/* CopyCraft — voxel world: generation, structures, meshing, chunk streaming */
'use strict';

const CH = 16;          // chunk width/depth
const WORLD_H = 80;     // world height
const SEA = 32;         // sea level
const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, MOUNTAINS: 3, SNOW: 4, OCEAN: 5 };

const WORLD_TYPES = {
  normal: 'Normaali maailma',
  amplified: 'Vuoristo',
  islands: 'Saaristo',
  flat: 'Tasanko',
  snow: 'Lumimaa',
  desert: 'Aavikko'
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* face data: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z */
const FACES = [
  { dir: [1, 0, 0], shade: 0.66, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], shade: 0.66, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.82, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.82, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];
const UVL = [[0, 0], [1, 0], [1, 1], [0, 1]];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(CH * CH * WORLD_H);
    this.generated = false;
    this.dirty = true;
    this.opaqueMesh = null;
    this.transMesh = null;
    this.torchMeshes = [];
  }
}

class World {
  constructor(seed, type, scene) {
    this.seed = seed >>> 0;
    this.type = type;
    this.scene = scene;
    this.group = new THREE.Group();   // all chunk/torch meshes; toggled in/out of scene
    this.chunks = new Map();
    this.containers = new Map();      // "x,y,z" -> chest/furnace data
    this.spawners = new Set();        // "x,y,z" — mob spawner positions (blaze)
    this.tntFuses = new Map();        // "x,y,z" -> seconds until explode
    this.edits = new Map();           // "cx,cz" -> Map("x,y,z" -> blockId)  player changes
    this.villageCenters = new Set();  // "vx,vz" strings — used for villager spawning
    this.endCities = [];              // {x,z} positions of generated End cities — used for shulker spawning
    this.renderDist = 5;
    const s = this.seed;
    this.nH = new Noise(s);
    this.nM = new Noise(s ^ 0x1234);
    this.nT = new Noise(s ^ 0xabcd);
    this.nC = new Noise(s ^ 0x7777);
    this.nC2 = new Noise(s ^ 0x3331);

    this.matOpaque = new THREE.MeshLambertMaterial({ map: Tex.texture, vertexColors: true });
    this.matTrans = new THREE.MeshLambertMaterial({
      map: Tex.texture, vertexColors: true, transparent: true,
      opacity: 0.84, side: THREE.DoubleSide, depthWrite: true
    });
    this.torchStick = new THREE.BoxGeometry(0.14, 0.55, 0.14);
    this.torchFlame = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    this.torchStickMat = new THREE.MeshBasicMaterial({ color: 0x6e5230 });
    this.torchFlameMat = new THREE.MeshBasicMaterial({ color: 0xffcf4a });
    // Tuli-lohkon liekit (kaksi sisäkkäistä laatikkoa)
    this.fireGeoOuter = new THREE.BoxGeometry(0.82, 0.85, 0.82);
    this.fireGeoInner = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    this.fireMatOuter = new THREE.MeshBasicMaterial({ color: 0xef6a1e, transparent: true, opacity: 0.85 });
    this.fireMatInner = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95 });

    // distance-sorted chunk offsets
    this.offsets = [];
    const R = this.renderDist + 1;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      this.offsets.push({ dx, dz, d: Math.hypot(dx, dz) });
    }
    this.offsets.sort((a, b) => a.d - b.d);
  }

  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }
  getOrCreate(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  }

  /* ---------------- terrain shape ---------------- */
  columnHeight(wx, wz) {
    if (this.type === 'flat') return SEA + 1;
    let cont = this.nH.fbm2D(wx * 0.0055, wz * 0.0055, 4, 2.0, 0.5);
    let hill = this.nH.fbm2D(wx * 0.021 + 91, wz * 0.021 + 91, 3, 2.0, 0.5);
    let e = cont * 20 + hill * 7;
    let mnt = this.nM.fbm2D(wx * 0.0045 + 500, wz * 0.0045 + 500, 2, 2, 0.5);
    if (mnt > 0.32) e += (mnt - 0.32) * (this.type === 'amplified' ? 280 : 150);
    if (this.type === 'amplified') e *= 1.5;
    if (this.type === 'islands') e -= 13;
    const h = Math.floor(SEA + 3 + e);
    return clamp(h, 6, WORLD_H - 14);
  }

  biomeAt(wx, wz) {
    if (this.type === 'snow') return BIOME.SNOW;
    if (this.type === 'desert') return BIOME.DESERT;
    const h = this.columnHeight(wx, wz);
    if (h <= SEA) return BIOME.OCEAN;
    if (h > SEA + 34) return BIOME.MOUNTAINS;
    const temp = this.nT.fbm2D(wx * 0.0032 + 777, wz * 0.0032 + 777, 2, 2, 0.5);
    const hum = this.nT.fbm2D(wx * 0.0032 - 333, wz * 0.0032 - 333, 2, 2, 0.5);
    if (temp > 0.33) return BIOME.DESERT;
    if (temp < -0.34) return BIOME.SNOW;
    if (hum > 0.12) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  /* ---------------- generation ---------------- */
  generateChunk(ch) {
    if (ch.generated) return;
    if (this.type === 'nether') {
      this._generateNether(ch);
      this._applyNetherStructures(ch);
      this._applyEdits(ch);
      ch.generated = true; ch.dirty = true;
      return;
    }
    if (this.type === 'end') {
      this._generateEnd(ch);
      this._applyEdits(ch);
      ch.generated = true; ch.dirty = true;
      return;
    }
    const x0 = ch.cx * CH, z0 = ch.cz * CH, d = ch.data, s = this.seed;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = this.columnHeight(wx, wz);
      const biome = this.biomeAt(wx, wz);
      for (let y = 0; y < WORLD_H; y++) {
        let id = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y <= 2 && hash3(wx, y, wz, s) < 0.5) id = B.BEDROCK;
        else if (y < h) {
          if (y === h - 1) id = this._surfaceTop(biome, h);
          else if (y >= h - 4) id = this._surfaceSub(biome);
          else id = B.STONE;
        }
        // caves, big caverns, huge cavities & ravines — multi-scale
        if (id !== B.AIR && id !== B.BEDROCK && y > 1 && y < h) {
          // small twisting caves
          const cv = this.nC.noise3D(wx * 0.05, y * 0.075, wz * 0.05);
          const cv2 = this.nC2.noise3D(wx * 0.05 + 40, y * 0.075, wz * 0.05 + 40);
          if (cv > 0.40 && cv2 > 0.34) id = B.AIR;
          else {
            // medium caves
            const cav = this.nC.noise3D(wx * 0.022 + 200, y * 0.045 + 200, wz * 0.022 + 200);
            if (cav > 0.52 && y < h - 3) id = B.AIR;
            else {
              // large caverns (broad open rooms)
              const big = this.nC2.noise3D(wx * 0.012 + 500, y * 0.018 + 500, wz * 0.012 + 500);
              if (big > 0.50 && y < h - 4 && y > 6) id = B.AIR;
              else {
                // huge rare cavities (occasional massive open underground spaces)
                const huge = this.nC.noise3D(wx * 0.006 + 900, y * 0.010 + 900, wz * 0.006 + 900);
                if (huge > 0.62 && y < h - 6 && y > 8) id = B.AIR;
                else {
                  // vertical ravines: thin sheets that go very deep
                  const rv1 = this.nC.noise3D(wx * 0.04 + 1500, 0, wz * 0.04 + 1500);
                  const rv2 = this.nC2.noise3D(wx * 0.04 + 1500, 0, wz * 0.04 + 1500);
                  if (Math.abs(rv1 - rv2) < 0.04 && y < h - 4 && y > 4) id = B.AIR;
                }
              }
            }
          }
        }
        // ores — harvinaisuudet tasapainotettu (ei-päällekkäiset kaistat yhdestä hashista).
        // Pienet suonet: viereiset lohkot saavat saman hashin → 1-3 lohkon ryppäitä.
        if (id === B.STONE) {
          const r = hash3(wx, y * 3 + 1, wz, s ^ 0x55aa);
          // suoni-bonus: pieni 3D-kohina ryhmittää malmit pieniksi suoniksi
          const vein = this.nC2.noise3D(wx * 0.18 + 1300, y * 0.18 + 1300, wz * 0.18 + 1300);
          const v = vein > 0.45 ? 1 : 0;   // suonialueella malmia hieman tiheämmin
          if (y < 14 && r < (0.0008 + v * 0.0008)) id = B.DIAMOND_ORE;          // ~3 / chunk
          else if (y < 30 && r >= 0.0030 && r < (0.0038 + v * 0.0008)) id = B.LAPIS_ORE;     // ~5 / chunk
          else if (y < 40 && r >= 0.0060 && r < (0.0061 + v * 0.0003)) id = B.EMERALD_ORE;   // ~1 / chunk (hyvin harvinainen)
          else if (y < 28 && r >= 0.0090 && r < (0.0106 + v * 0.0016)) id = B.GOLD_ORE;       // ~9 / chunk
          else if (y < 50 && r >= 0.0150 && r < (0.0235 + v * 0.0050)) id = B.IRON_ORE;        // ~80 / chunk
          else if (y < 18 && r >= 0.0280 && r < 0.0290) id = B.OBSIDIAN;
          else if (r >= 0.0320 && r < (0.0410 + v * 0.0060)) id = B.COAL_ORE;                  // common
          else {
            // gravel patches (3D noise veins, common at all depths)
            const gv = this.nC.noise3D(wx * 0.08 + 700, y * 0.10 + 700, wz * 0.08 + 700);
            if (gv > 0.42) id = B.GRAVEL;
          }
        }
        // gravel patches near water (oceans, beaches, lake shores) — not always
        if (y === h - 1 && (id === B.SAND || id === B.GRASS || id === B.DIRT)
            && h >= SEA - 1 && h <= SEA + 3) {
          const shoreN = this.nT.noise2D(wx * 0.05 + 333, wz * 0.05 + 333);
          if (shoreN > 0.32) id = B.GRAVEL;
        }
        // water fill (oceans & lakes only — not carved caves)
        if (id === B.AIR && y >= h && y <= SEA && y >= 1) {
          id = (y === SEA && biome === BIOME.SNOW) ? B.ICE : B.WATER;
        }
        d[x + z * CH + y * CH * CH] = id;
      }
    }
    ch.generated = true;
    this._applyStructures(ch);
    this._applyUndergroundStructures(ch);
    this._applyEdits(ch);
    ch.dirty = true;
  }

  _applyEdits(ch) {
    const em = this.edits.get(this.key(ch.cx, ch.cz));
    if (!em) return;
    for (const [pk, id] of em) {
      const pp = pk.split(',');
      const x = +pp[0], y = +pp[1], z = +pp[2];
      const lx = x - ch.cx * CH, lz = z - ch.cz * CH;
      if (lx >= 0 && lx < CH && lz >= 0 && lz < CH && y >= 0 && y < WORLD_H)
        ch.data[lx + lz * CH + y * CH * CH] = id;
    }
  }

  recordEdit(wx, wy, wz, id) {
    const ck = this.key(Math.floor(wx / CH), Math.floor(wz / CH));
    let m = this.edits.get(ck);
    if (!m) { m = new Map(); this.edits.set(ck, m); }
    m.set(wx + ',' + wy + ',' + wz, id);
  }
  loadEdits(flat) {
    for (const k in flat) {
      const pp = k.split(',');
      this.recordEdit(+pp[0], +pp[1], +pp[2], flat[k]);
    }
  }
  exportEdits() {
    const o = {};
    for (const m of this.edits.values()) for (const [k, v] of m) o[k] = v;
    return o;
  }

  /* ---------------- end (loppu) generation ---------------- */
  _generateEnd(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH, d = ch.data;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      const wx = x0 + x, wz = z0 + z;
      const dist = Math.hypot(wx, wz);
      // Main central island (Minecraft-like big island) — much larger
      const edgeNoise = this.nH.fbm2D(wx * 0.025 + 9000, wz * 0.025 + 9000, 2, 2, 0.5) * 12;
      const islandR = 100 + edgeNoise;
      // Outer end islands — large smooth blobs with lots of variety
      const outerScale = 0.006;  // larger smooth shapes
      const outerNoise = this.nH.fbm2D(wx * outerScale + 5000, wz * outerScale + 5000, 5, 2.2, 0.55);
      const distFactor = clamp((dist - 250) / 1800, 0, 1);
      const outerThreshold = 0.18 - distFactor * 0.08;  // lower threshold → bigger islands
      const isOuterIsland = dist > 250 && outerNoise > outerThreshold;
      const outerCenterY = 50 + Math.floor((this.nH.fbm2D(wx * 0.03 + 2000, wz * 0.03 + 2000, 2, 2, 0.5) + 1) * 14);
      const outerThickness = isOuterIsland ? Math.floor((outerNoise - outerThreshold) * 60) : 0;
      for (let y = 0; y < WORLD_H; y++) {
        let id = B.AIR;
        // Central island
        if (dist < islandR && y >= 38 && y <= 42) {
          const topY = 42 - Math.floor(Math.max(0, dist - islandR + 8) * 0.4);
          if (y <= topY && y >= 38) id = B.END_STONE;
        }
        // Outer islands: thick floating slabs
        if (isOuterIsland && y >= outerCenterY - outerThickness && y <= outerCenterY + Math.floor(outerThickness * 0.6)) {
          id = B.END_STONE;
        }
        d[x + z * CH + y * CH * CH] = id;
      }
    }
    this._applyEndStructures(ch);
  }

  _applyEndStructures(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    // End Cities packed denser (region 70, 80% spawn rate per region)
    const CR = 70;
    for (let rz = Math.floor((z0 - 24) / CR); rz <= Math.floor((z0 + CH + 24) / CR); rz++) {
      for (let rx = Math.floor((x0 - 24) / CR); rx <= Math.floor((x0 + CH + 24) / CR); rx++) {
        if (hash3(rx, 137, rz, this.seed + 0xeec1) > 0.78) continue;
        const cx2 = rx * CR + 18 + Math.floor(hash3(rx, 31, rz, this.seed + 0xeec2) * (CR - 36));
        const cz2 = rz * CR + 18 + Math.floor(hash3(rx, 33, rz, this.seed + 0xeec3) * (CR - 36));
        if (Math.hypot(cx2, cz2) < 80) continue;
        this._buildEndCity(ch, cx2, cz2);
        // Record city center for runtime mob spawning (shulkers)
        const ck = cx2 + ',' + cz2;
        if (!this._endCityKeys) this._endCityKeys = new Set();
        if (!this._endCityKeys.has(ck)) { this._endCityKeys.add(ck); this.endCities.push({ x: cx2, z: cz2 }); }
      }
    }
  }

  _buildEndCity(ch, wx, wz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, wx + lx - x0, ly, wz + lz - z0, id, mode || 'force');
    const chestAt = (lx, ly, lz) => {
      set(lx, ly, lz, B.CHEST);
      const cwx = wx + lx, cwz = wz + lz;
      if (cwx - x0 >= 0 && cwx - x0 < CH && cwz - z0 >= 0 && cwz - z0 < CH) this._seedEndCityChest(cwx, ly, cwz);
    };
    const baseY = 50;

    // ---- LARGE FOUNDATION PLATFORM (30x30) ----
    for (let lx = -15; lx <= 15; lx++) for (let lz = -15; lz <= 15; lz++) {
      set(lx, baseY, lz, B.END_STONE);
      set(lx, baseY - 1, lz, B.END_STONE);
      set(lx, baseY - 2, lz, B.END_STONE);
    }

    // ---- MAIN GRAND TOWER (12x12 footprint, 40 high) ----
    const mainTop = baseY + 40;
    for (let ly = baseY + 1; ly <= mainTop; ly++) {
      for (let lx = -5; lx <= 5; lx++) for (let lz = -5; lz <= 5; lz++) {
        const edge = (Math.abs(lx) === 5 || Math.abs(lz) === 5);
        if (edge) set(lx, ly, lz, B.PURPUR_BLOCK);
        else set(lx, ly, lz, B.AIR);
      }
    }
    // Cap
    for (let lx = -5; lx <= 5; lx++) for (let lz = -5; lz <= 5; lz++) set(lx, mainTop, lz, B.PURPUR_BLOCK);
    // Main entrance doorway
    for (let ly = baseY + 1; ly <= baseY + 3; ly++) { set(-5, ly, 0, B.AIR); set(-5, ly, 1, B.AIR); set(-5, ly, -1, B.AIR); }
    // Internal floors every 8 blocks with central staircase + chests
    for (let f = 1; f <= 4; f++) {
      const fy = baseY + f * 8;
      for (let lx = -4; lx <= 4; lx++) for (let lz = -4; lz <= 4; lz++) {
        set(lx, fy, lz, B.PURPUR_BLOCK);
      }
      // Stair hole 2x2
      set(0, fy, 0, B.AIR); set(1, fy, 0, B.AIR); set(0, fy, 1, B.AIR); set(1, fy, 1, B.AIR);
      // Loot chest on each floor
      chestAt(-3, fy + 1, -3);
      chestAt(3, fy + 1, 3);
      // Glowstone lamps in corners
      for (const [cx, cz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) set(cx, fy + 1, cz, B.GLOWSTONE);
    }
    set(0, mainTop + 1, 0, B.GLOWSTONE);

    // ---- 4 CORNER TOWERS (6x6 footprint, 20 high) ----
    const corners = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
    for (const [cx, cz] of corners) {
      const ctTop = baseY + 20;
      for (let ly = baseY + 1; ly <= ctTop; ly++) {
        for (let lx = cx - 2; lx <= cx + 2; lx++) for (let lz = cz - 2; lz <= cz + 2; lz++) {
          const edge = (lx === cx - 2 || lx === cx + 2 || lz === cz - 2 || lz === cz + 2);
          if (edge) set(lx, ly, lz, B.PURPUR_BLOCK);
          else set(lx, ly, lz, B.AIR);
        }
      }
      // cap
      for (let lx = cx - 2; lx <= cx + 2; lx++) for (let lz = cz - 2; lz <= cz + 2; lz++) set(lx, ctTop, lz, B.PURPUR_BLOCK);
      // doorway facing center
      const doorDirX = -Math.sign(cx), doorDirZ = -Math.sign(cz);
      for (let ly = baseY + 1; ly <= baseY + 3; ly++) {
        if (Math.abs(cx) > Math.abs(cz)) set(cx + doorDirX * 2, ly, cz, B.AIR);
        else set(cx, ly, cz + doorDirZ * 2, B.AIR);
      }
      // Loot chest inside each corner tower
      chestAt(cx, baseY + 1, cz);
      // Top glow
      set(cx, ctTop + 1, cz, B.GLOWSTONE);
    }

    // ---- BRIDGES from main tower to each corner tower (along diagonal) ----
    for (const [cx, cz] of corners) {
      const steps = 12;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const bx = Math.round(cx * t), bz = Math.round(cz * t);
        const by = baseY + 6;
        // Bridge floor
        set(bx, by, bz, B.PURPUR_BLOCK);
        set(bx, by, bz + 1, B.PURPUR_BLOCK);
        set(bx + 1, by, bz, B.PURPUR_BLOCK);
        // Side railings
        set(bx, by + 1, bz + 2, B.PURPUR_BLOCK);
        if (s % 4 === 0) set(bx, by + 2, bz, B.GLOWSTONE);
      }
    }

    // ---- 4 MINI HOUSES on platform corners (4x4 footprint, 5 tall) ----
    const houses = [[-10, 0], [10, 0], [0, -10], [0, 10]];
    for (const [hx, hz] of houses) {
      for (let ly = baseY + 1; ly <= baseY + 5; ly++) {
        for (let lx = hx - 1; lx <= hx + 2; lx++) for (let lz = hz - 1; lz <= hz + 2; lz++) {
          const edge = (lx === hx - 1 || lx === hx + 2 || lz === hz - 1 || lz === hz + 2);
          if (edge) set(lx, ly, lz, B.PURPUR_BLOCK);
          else if (ly === baseY + 5) set(lx, ly, lz, B.PURPUR_BLOCK);
          else set(lx, ly, lz, B.AIR);
        }
      }
      // doorway facing center
      for (let ly = baseY + 1; ly <= baseY + 2; ly++) {
        if (Math.abs(hx) > Math.abs(hz)) set(hx + (hx > 0 ? -1 : 2), ly, hz, B.AIR);
        else set(hx, ly, hz + (hz > 0 ? -1 : 2), B.AIR);
      }
      chestAt(hx, baseY + 1, hz);
      set(hx, baseY + 6, hz, B.GLOWSTONE);
    }

    // ---- Glowstone lampposts around platform edges ----
    for (let i = -12; i <= 12; i += 6) {
      set(i, baseY + 1, -15, B.GLOWSTONE);
      set(i, baseY + 1, 15, B.GLOWSTONE);
      set(-15, baseY + 1, i, B.GLOWSTONE);
      set(15, baseY + 1, i, B.GLOWSTONE);
    }
  }

  _seedEndCityChest(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 113 + wy * 31 + wz * 71 + this.seed);
    // Elytra guaranteed in End City chest
    cont.slots[(r() * 27) | 0] = { id: I.ELYTRA, count: 1 };
    // 50% chance for enderite scrap
    if (r() < 0.5) {
      for (let s = 0; s < 27; s++) if (!cont.slots[s]) { cont.slots[s] = { id: I.ENDERITE_SCRAP, count: 2 + ((r() * 3) | 0) }; break; }
    }
    // 50% chance for enderite upgrade template
    if (r() < 0.5) {
      for (let s = 0; s < 27; s++) if (!cont.slots[s]) { cont.slots[s] = { id: I.ENDERITE_TEMPLATE, count: 1 }; break; }
    }
    // Huom: shulker-kuoria ja -laatikoita EI saa arkuista — ne saa vain tappamalla shulker-mobeja
    const loot = [
      { id: I.DIAMOND, n: 3 }, { id: I.GOLD_INGOT, n: 4 }, { id: I.IRON_INGOT, n: 5 },
      { id: B.GLOWSTONE, n: 2 }, { id: I.NETHER_QUARTZ, n: 4 }, { id: B.PURPUR_BLOCK, n: 8 }
    ];
    for (let i = 0; i < 4; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    this.containers.set(k, cont);
  }

  /* ---------------- nether generation ---------------- */
  _generateNether(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH, d = ch.data, s = this.seed;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      const wx = x0 + x, wz = z0 + z;
      for (let y = 0; y < WORLD_H; y++) {
        let id = B.NETHERRACK;
        if (y === 0 || y >= WORLD_H - 1) id = B.BEDROCK;
        else if (y >= WORLD_H - 4 && hash3(wx, y, wz, s) < 0.6) id = B.BEDROCK;
        else if (y > 4 && y < WORLD_H - 6) {
          const open = this.nC.fbm3D(wx * 0.042, y * 0.05, wz * 0.042, 2, 2, 0.5);
          if (open > -0.08) id = B.AIR;
        }
        if (id === B.NETHERRACK) {
          const r = hash3(wx, y * 2 + 5, wz, s ^ 0x3a3a);
          if (r < 0.014) id = B.QUARTZ_ORE;
          else if (y >= 8 && y <= 22 && r > 0.992) id = B.ANCIENT_DEBRIS;
          else if (y > 56 && r > 0.20 && r < 0.235) id = B.GLOWSTONE;
          else if (y > 23 && y < 29 && r > 0.5 && r < 0.6) id = B.SOUL_SAND;
        }
        if (id === B.AIR && y <= 22) id = B.LAVA;
        d[x + z * CH + y * CH * CH] = id;
      }
    }
  }

  _surfaceTop(biome, h) {
    switch (biome) {
      case BIOME.DESERT: return B.SAND;
      case BIOME.SNOW: return B.SNOW;
      case BIOME.OCEAN: return B.SAND;
      case BIOME.MOUNTAINS:
        if (h > SEA + 48) return B.SNOW;
        if (h > SEA + 38) return B.STONE;
        return B.GRASS;
      default:
        return h <= SEA + 1 ? B.SAND : B.GRASS;
    }
  }
  _surfaceSub(biome) {
    if (biome === BIOME.DESERT || biome === BIOME.OCEAN) return B.SANDSTONE;
    if (biome === BIOME.MOUNTAINS) return B.STONE;
    return B.DIRT;
  }

  /* ---------------- structures ---------------- */
  _setLocal(ch, x, y, z, id, mode) {
    if (x < 0 || x >= CH || z < 0 || z >= CH || y < 0 || y >= WORLD_H) return;
    const i = x + z * CH + y * CH * CH;
    const cur = ch.data[i];
    if (cur === B.BEDROCK) return;
    if (mode === 'air' && cur !== B.AIR && cur !== B.WATER && cur !== B.LEAVES) return;
    ch.data[i] = id;
  }

  _treeHere(wx, wz) {
    const salt = this.seed + 0x7ee5;
    const density = 0.10;
    const base = hash3(wx, 7, wz, salt);
    if (base >= density) return false;
    const biome = this.biomeAt(wx, wz);
    if (biome !== BIOME.PLAINS && biome !== BIOME.FOREST && biome !== BIOME.SNOW) return false;
    const localD = biome === BIOME.FOREST ? 0.10 : (biome === BIOME.SNOW ? 0.03 : 0.022);
    if (base >= localD) return false;
    const h = this.columnHeight(wx, wz);
    if (h <= SEA + 1) return false;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dz === 0) continue;
      const hb = hash3(wx + dx, 7, wz + dz, salt);
      if (hb < localD && hb < base) return false;
    }
    return true;
  }

  _applyStructures(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    // trees & cactus
    for (let wz = z0 - 3; wz < z0 + CH + 3; wz++) {
      for (let wx = x0 - 3; wx < x0 + CH + 3; wx++) {
        const biome = this.biomeAt(wx, wz);
        if (biome === BIOME.DESERT) {
          const r = hash3(wx, 13, wz, this.seed + 0xcac1);
          if (r < 0.012) {
            const h = this.columnHeight(wx, wz);
            const th = 2 + ((r * 1000) | 0) % 3;
            for (let i = 0; i < th; i++) this._setLocal(ch, wx - x0, h + i, wz - z0, B.CACTUS, 'air');
          }
          continue;
        }
        if (this._treeHere(wx, wz)) this._buildTree(ch, wx, wz, biome);
        // Sugar cane: on grass/dirt/sand next to water at sea level
        const h = this.columnHeight(wx, wz);
        if (h === SEA || h === SEA + 1) {
          const r = hash3(wx, 23, wz, this.seed + 0xca5e);
          if (r < 0.06) {
            // check water adjacency at same height
            let nearWater = false;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (this.columnHeight(wx + dx, wz + dz) < h) { nearWater = true; break; }
            }
            if (nearWater) {
              const cnt = 1 + ((r * 1000) | 0) % 3;
              for (let i = 0; i < cnt; i++) this._setLocal(ch, wx - x0, h + i, wz - z0, B.SUGAR_CANE, 'air');
            }
          }
        }
      }
    }
    // villages
    const VR = 200;
    for (let rz = Math.floor((z0 - 96) / VR); rz <= Math.floor((z0 + CH + 96) / VR); rz++) {
      for (let rx = Math.floor((x0 - 96) / VR); rx <= Math.floor((x0 + CH + 96) / VR); rx++) {
        if (hash3(rx, 71, rz, this.seed + 0x4b17) > 0.55) continue;
        const vx = rx * VR + 54 + Math.floor(hash3(rx, 3, rz, this.seed + 0x11) * 92);
        const vz = rz * VR + 54 + Math.floor(hash3(rx, 4, rz, this.seed + 0x22) * 92);
        this._buildVillage(ch, vx, vz);
      }
    }
  }

  _villageBuildings(vx, vz) {
    const list = [];
    const n = 6 + Math.floor(hash3(vx, 1, vz, this.seed) * 4);   // 6-9 houses
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + hash3(vx, i + 10, vz, this.seed) * 0.7;
      const rad = 14 + hash3(vx, i + 20, vz, this.seed) * 26;
      const bx = vx + Math.round(Math.cos(ang) * rad);
      const bz = vz + Math.round(Math.sin(ang) * rad);
      const big = hash3(vx, i + 30, vz, this.seed) < 0.42;
      list.push({ x: bx, z: bz, big: big });
    }
    return list;
  }

  _buildVillage(ch, vx, vz) {
    this.villageCenters.add(vx + ',' + vz);
    for (const b of this._villageBuildings(vx, vz)) {
      if (b.big) this._buildBigHouse(ch, b.x, b.z);
      else this._buildSmallHouse(ch, b.x, b.z);
    }
    this._buildWell(ch, vx, vz);
  }

  _flatCheck(ox, oz, w, d) {
    const cb = this.biomeAt(ox + (w >> 1), oz + (d >> 1));
    if (cb === BIOME.OCEAN || cb === BIOME.MOUNTAINS) return -1;
    const hc = this.columnHeight(ox + (w >> 1), oz + (d >> 1));
    if (hc <= SEA) return -1;
    let minH = hc, maxH = hc;
    for (const c of [[0, 0], [w, 0], [0, d], [w, d]]) {
      const hh = this.columnHeight(ox + c[0], oz + c[1]);
      minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
    }
    if (maxH - minH > 3) return -1;
    return hc;
  }

  _buildWell(ch, vx, vz) {
    const baseY = this._flatCheck(vx - 1, vz - 1, 2, 2);
    if (baseY < 0) return;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      this._setLocal(ch, vx + dx - ch.cx * CH, baseY, vz + dz - ch.cz * CH, B.COBBLE, 'force');
      if (dx === 0 && dz === 0) {
        this._setLocal(ch, vx - ch.cx * CH, baseY, vz - ch.cz * CH, B.WATER, 'force');
        this._setLocal(ch, vx - ch.cx * CH, baseY - 1, vz - ch.cz * CH, B.WATER, 'force');
      } else {
        this._setLocal(ch, vx + dx - ch.cx * CH, baseY + 1, vz + dz - ch.cz * CH, B.COBBLE, 'force');
      }
    }
  }

  _buildTree(ch, wx, wz, biome) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const h = this.columnHeight(wx, wz);
    const th = 4 + Math.floor(hash3(wx, 21, wz, this.seed) * 3);
    const top = h + th;
    for (let y = h; y < top; y++) this._setLocal(ch, wx - x0, y, wz - z0, B.LOG, 'force');
    for (let ly = top - 3; ly <= top + 1; ly++) {
      const rad = (ly >= top) ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx === 0 && dz === 0 && ly < top) continue;
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && rad === 2 && hash3(wx + dx, ly, wz + dz, this.seed) < 0.4) continue;
        this._setLocal(ch, wx - x0 + dx, ly, wz - z0 + dz, B.LEAVES, 'air');
      }
    }
  }

  _buildSmallHouse(ch, ox, oz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const baseY = this._flatCheck(ox, oz, 6, 4);
    if (baseY < 0) return;
    const cb = this.biomeAt(ox + 3, oz + 2);
    const wall = (cb === BIOME.DESERT) ? B.SANDSTONE : B.PLANKS;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, ox + lx - x0, baseY + ly, oz + lz - z0, id, mode || 'force');
    for (let lz = 0; lz <= 4; lz++) for (let lx = 0; lx <= 6; lx++) {
      set(lx, 0, lz, B.PLANKS);
      for (let dy = 1; dy <= 4; dy++) this._setLocal(ch, ox + lx - x0, baseY - dy, oz + lz - z0, B.DIRT, 'air');
    }
    for (let ly = 1; ly <= 3; ly++) for (let lz = 0; lz <= 4; lz++) for (let lx = 0; lx <= 6; lx++) {
      const edge = (lx === 0 || lx === 6 || lz === 0 || lz === 4);
      if (!edge) { set(lx, ly, lz, B.AIR); continue; }
      const corner = (lx === 0 || lx === 6) && (lz === 0 || lz === 4);
      if (corner) { set(lx, ly, lz, B.LOG); continue; }
      if (lz === 0 && lx === 3 && ly <= 2) { set(lx, ly, lz, B.AIR); continue; }
      if (ly === 2 && (lx === 1 || lx === 5) && lz === 4) { set(lx, ly, lz, B.GLASS); continue; }
      set(lx, ly, lz, wall);
    }
    for (let lz = -1; lz <= 5; lz++) for (let lx = -1; lx <= 7; lx++) set(lx, 4, lz, B.LOG);
    set(1, 1, 1, B.CRAFTING_TABLE);
    set(5, 1, 3, B.CHEST);
    set(3, 1, 3, B.BED);                             // bed at back wall
    set(2, 3, 1, B.TORCH); set(4, 3, 3, B.TORCH);   // interior lamps
    set(0, 4, -1, B.TORCH); set(6, 4, -1, B.TORCH); // roof corner lamps
    if (ox + 5 - x0 >= 0 && ox + 5 - x0 < CH && oz + 3 - z0 >= 0 && oz + 3 - z0 < CH) {
      this._seedHutChest(ox + 5, baseY + 1, oz + 3);
    }
  }

  _buildBigHouse(ch, ox, oz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const baseY = this._flatCheck(ox, oz, 8, 6);
    if (baseY < 0) return;
    const cb = this.biomeAt(ox + 4, oz + 3);
    const wall = (cb === BIOME.DESERT) ? B.SANDSTONE : B.PLANKS;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, ox + lx - x0, baseY + ly, oz + lz - z0, id, mode || 'force');
    for (let lz = 0; lz <= 6; lz++) for (let lx = 0; lx <= 8; lx++) {
      set(lx, 0, lz, B.PLANKS);
      for (let dy = 1; dy <= 5; dy++) this._setLocal(ch, ox + lx - x0, baseY - dy, oz + lz - z0, B.DIRT, 'air');
    }
    for (let ly = 1; ly <= 4; ly++) for (let lz = 0; lz <= 6; lz++) for (let lx = 0; lx <= 8; lx++) {
      const edge = (lx === 0 || lx === 8 || lz === 0 || lz === 6);
      if (!edge) { set(lx, ly, lz, B.AIR); continue; }
      const corner = (lx === 0 || lx === 8) && (lz === 0 || lz === 6);
      if (corner) { set(lx, ly, lz, B.LOG); continue; }
      if (lz === 0 && lx === 4 && ly <= 2) { set(lx, ly, lz, B.AIR); continue; }
      if (ly === 2 && lz === 0 && (lx === 2 || lx === 6)) { set(lx, ly, lz, B.GLASS); continue; }
      if (ly === 2 && lz === 6 && (lx === 2 || lx === 6)) { set(lx, ly, lz, B.GLASS); continue; }
      if (ly === 2 && (lx === 0 || lx === 8) && (lz === 2 || lz === 4)) { set(lx, ly, lz, B.GLASS); continue; }
      set(lx, ly, lz, wall);
    }
    // peaked roof of logs
    for (let r = 0; r <= 3; r++) {
      for (let lx = -1; lx <= 9; lx++) { set(lx, 5 + r, r - 1, B.LOG); set(lx, 5 + r, 7 - r, B.LOG); }
    }
    for (let lx = -1; lx <= 9; lx++) set(lx, 8, 3, B.LOG);
    set(1, 1, 1, B.CRAFTING_TABLE);
    set(7, 1, 1, B.FURNACE);
    set(1, 1, 5, B.CHEST);
    set(5, 1, 5, B.BED);                              // bed near back wall
    set(2, 4, 1, B.TORCH); set(6, 4, 5, B.TORCH);
    set(0, 5, -1, B.TORCH); set(8, 5, -1, B.TORCH);
    if (ox + 1 - x0 >= 0 && ox + 1 - x0 < CH && oz + 5 - z0 >= 0 && oz + 5 - z0 < CH) {
      this._seedHutChest(ox + 1, baseY + 1, oz + 5);
    }
  }

  /* ---------------- underground structures (overworld) ---------------- */
  _applyUndergroundStructures(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    // Surface sinkholes opening into cave systems
    const SR = 90;
    for (let rz = Math.floor((z0 - 12) / SR); rz <= Math.floor((z0 + CH + 12) / SR); rz++) {
      for (let rx = Math.floor((x0 - 12) / SR); rx <= Math.floor((x0 + CH + 12) / SR); rx++) {
        if (hash3(rx, 333, rz, this.seed + 0x5ee) > 0.55) continue;
        const sx = rx * SR + 16 + Math.floor(hash3(rx, 31, rz, this.seed + 0x5ee2) * (SR - 32));
        const sz = rz * SR + 16 + Math.floor(hash3(rx, 33, rz, this.seed + 0x5ee3) * (SR - 32));
        const radius = 2 + Math.floor(hash3(rx, 35, rz, this.seed + 0x5ee4) * 3);
        this._carveSinkhole(ch, sx, sz, radius);
      }
    }
    // Ancient cities — large deep structures
    const ACR = 300;
    for (let rz = Math.floor((z0 - 80) / ACR); rz <= Math.floor((z0 + CH + 80) / ACR); rz++) {
      for (let rx = Math.floor((x0 - 80) / ACR); rx <= Math.floor((x0 + CH + 80) / ACR); rx++) {
        if (hash3(rx, 991, rz, this.seed + 0xacac) > 0.55) continue;
        const ax = rx * ACR + 64 + Math.floor(hash3(rx, 53, rz, this.seed + 0xac01) * (ACR - 128));
        const az = rz * ACR + 64 + Math.floor(hash3(rx, 57, rz, this.seed + 0xac02) * (ACR - 128));
        const ay = 6;
        this._buildAncientCity(ch, ax, ay, az);
      }
    }
    // Dungeons — small loot rooms underground
    const DR = 130;
    for (let rz = Math.floor((z0 - 16) / DR); rz <= Math.floor((z0 + CH + 16) / DR); rz++) {
      for (let rx = Math.floor((x0 - 16) / DR); rx <= Math.floor((x0 + CH + 16) / DR); rx++) {
        if (hash3(rx, 41, rz, this.seed + 0xd001) > 0.65) continue;
        const dx = rx * DR + 24 + Math.floor(hash3(rx, 13, rz, this.seed + 0xd002) * (DR - 48));
        const dz = rz * DR + 24 + Math.floor(hash3(rx, 17, rz, this.seed + 0xd003) * (DR - 48));
        const dy = 10 + Math.floor(hash3(rx, 23, rz, this.seed + 0xd004) * 26);
        this._buildDungeon(ch, dx, dy, dz);
      }
    }
    // Mineshafts — long horizontal corridors with wood supports
    const MR = 220;
    for (let rz = Math.floor((z0 - 64) / MR); rz <= Math.floor((z0 + CH + 64) / MR); rz++) {
      for (let rx = Math.floor((x0 - 64) / MR); rx <= Math.floor((x0 + CH + 64) / MR); rx++) {
        if (hash3(rx, 71, rz, this.seed + 0xa101) > 0.6) continue;
        const mx = rx * MR + 50 + Math.floor(hash3(rx, 19, rz, this.seed + 0xa102) * (MR - 100));
        const mz = rz * MR + 50 + Math.floor(hash3(rx, 21, rz, this.seed + 0xa103) * (MR - 100));
        const my = 14 + Math.floor(hash3(rx, 27, rz, this.seed + 0xa104) * 14);
        this._buildMineshaft(ch, mx, my, mz, rx, rz);
      }
    }
    // Strongholds — large stone-brick complexes (rare)
    const TR = 380;
    for (let rz = Math.floor((z0 - 32) / TR); rz <= Math.floor((z0 + CH + 32) / TR); rz++) {
      for (let rx = Math.floor((x0 - 32) / TR); rx <= Math.floor((x0 + CH + 32) / TR); rx++) {
        if (hash3(rx, 91, rz, this.seed + 0xc001) > 0.6) continue;
        const tx = rx * TR + 60 + Math.floor(hash3(rx, 53, rz, this.seed + 0xc002) * (TR - 120));
        const tz = rz * TR + 60 + Math.floor(hash3(rx, 57, rz, this.seed + 0xc003) * (TR - 120));
        const ty = 12 + Math.floor(hash3(rx, 59, rz, this.seed + 0xc004) * 16);
        this._buildStronghold(ch, tx, ty, tz);
      }
    }
  }

  _carveSinkhole(ch, wx, wz, r) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r) continue;
      const lx = wx + dx - x0, lz = wz + dz - z0;
      if (lx < 0 || lx >= CH || lz < 0 || lz >= CH) continue;
      // find current top of column
      let surfY = WORLD_H - 1;
      while (surfY > 0 && !isSolid(ch.data[lx + lz * CH + surfY * CH * CH])) surfY--;
      // carve from below surface down to y=12 (well into cave territory)
      const bottom = 12;
      for (let y = bottom; y <= surfY; y++) {
        const idx = lx + lz * CH + y * CH * CH;
        const cur = ch.data[idx];
        if (cur === B.BEDROCK) continue;
        ch.data[idx] = B.AIR;
      }
    }
  }

  _buildAncientCity(ch, wx, wy, wz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const set = (lx, ly, lz, id) => this._setLocal(ch, wx + lx - x0, wy + ly, wz + lz - z0, id, 'force');
    const chestAt = (lx, ly, lz, isCentral) => {
      set(lx, ly, lz, B.CHEST);
      const cwx = wx + lx, cwz = wz + lz;
      if (cwx - x0 >= 0 && cwx - x0 < CH && cwz - z0 >= 0 && cwz - z0 < CH)
        this._seedAncientChest(cwx, wy + ly, cwz, isCentral);
    };
    // HUGE ancient city: 60-wide × 24-tall × 60-deep, multi-chamber complex
    const W = 30, H = 22, D = 30;
    const r = makeRNG(wx * 311 + wz * 7 + this.seed);
    // Floor: sculk + stone bricks mix
    for (let lx = -W; lx <= W; lx++) for (let lz = -D; lz <= D; lz++) {
      const v = r();
      set(lx, 0, lz, v < 0.35 ? B.SCULK : v < 0.75 ? B.STONE_BRICKS : B.COBBLE);
    }
    // Ceiling: stone bricks with sculk patches
    for (let lx = -W; lx <= W; lx++) for (let lz = -D; lz <= D; lz++) {
      set(lx, H, lz, r() < 0.2 ? B.SCULK : B.STONE_BRICKS);
    }
    // Hollow interior
    for (let lx = -W + 1; lx <= W - 1; lx++) for (let lz = -D + 1; lz <= D - 1; lz++) {
      for (let ly = 1; ly < H; ly++) set(lx, ly, lz, B.AIR);
    }
    // Walls — stone brick with occasional sculk veins
    for (let ly = 1; ly < H; ly++) for (let i = -W; i <= W; i++) {
      set(i, ly, -D, r() < 0.15 ? B.SCULK : B.STONE_BRICKS);
      set(i, ly, D, r() < 0.15 ? B.SCULK : B.STONE_BRICKS);
    }
    for (let ly = 1; ly < H; ly++) for (let i = -D + 1; i <= D - 1; i++) {
      set(-W, ly, i, r() < 0.15 ? B.SCULK : B.STONE_BRICKS);
      set(W, ly, i, r() < 0.15 ? B.SCULK : B.STONE_BRICKS);
    }
    // Grand 5x5 grid of pillars
    const pillars = [];
    for (const px of [-W + 5, -W / 2, 0, W / 2, W - 5]) for (const pz of [-D + 5, -D / 2, 0, D / 2, D - 5]) {
      pillars.push([Math.round(px), Math.round(pz)]);
    }
    for (const [px, pz] of pillars) {
      if (Math.abs(px) < 3 && Math.abs(pz) < 3) continue; // skip center (altar there)
      for (let ly = 1; ly < H; ly++) set(px, ly, pz, B.COBBLE);
      set(px, H - 1, pz, B.GLOWSTONE);
    }

    // ---- 4 MINI SANCTUARY ROOMS in corners (8x6x8 walls, sculk + glow) ----
    const sanctuaries = [
      { cx: -W + 7, cz: -D + 7 }, { cx: W - 7, cz: -D + 7 },
      { cx: -W + 7, cz: D - 7 }, { cx: W - 7, cz: D - 7 }
    ];
    for (const s of sanctuaries) {
      for (let ly = 1; ly <= 6; ly++) for (let lx = s.cx - 3; lx <= s.cx + 3; lx++) for (let lz = s.cz - 3; lz <= s.cz + 3; lz++) {
        const edge = (lx === s.cx - 3 || lx === s.cx + 3 || lz === s.cz - 3 || lz === s.cz + 3);
        const top = (ly === 6);
        if (edge || top) set(lx, ly, lz, ((r() < 0.3) ? B.SCULK : B.STONE_BRICKS));
        else set(lx, ly, lz, B.AIR);
      }
      // Doorway facing center
      const dx = -Math.sign(s.cx) * 3, dz = -Math.sign(s.cz) * 3;
      for (let ly = 1; ly <= 3; ly++) set(s.cx + dx, ly, s.cz, B.AIR);
      // Inner glowstone + chest
      set(s.cx, 5, s.cz, B.GLOWSTONE);
      chestAt(s.cx, 1, s.cz);
    }

    // ---- MINI HOUSES along walls (5 per side) ----
    for (let i = 0; i < 5; i++) {
      const fraction = (i + 1) / 6; // spread evenly
      const xPos = Math.round(-W + 6 + fraction * (W * 2 - 12));
      // Two houses on -D and D walls
      for (const [hz, doorDz] of [[-D + 4, 1], [D - 4, -1]]) {
        for (let ly = 1; ly <= 4; ly++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const edge = (dx === -2 || dx === 2 || dz === -2 || dz === 2 || ly === 4);
          if (edge) set(xPos + dx, ly, hz + dz, ((r() < 0.2) ? B.SCULK : B.COBBLE));
          else set(xPos + dx, ly, hz + dz, B.AIR);
        }
        // Door facing center
        for (let ly = 1; ly <= 2; ly++) set(xPos, ly, hz + doorDz * 2, B.AIR);
        // Small chest inside
        if (i % 2 === 0) chestAt(xPos, 1, hz);
        // Glow on roof
        set(xPos, 5, hz, B.GLOWSTONE);
      }
    }

    // ---- MINI TOWER in dead center back area (behind altar) ----
    const towerZ = -D + 12;
    for (let ly = 1; ly <= 10; ly++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = (dx === -2 || dx === 2 || dz === -2 || dz === 2);
      const top = (ly === 10);
      if (edge || top) set(dx, ly, towerZ + dz, B.STONE_BRICKS);
      else set(dx, ly, towerZ + dz, B.AIR);
    }
    // Tower doorway
    for (let ly = 1; ly <= 3; ly++) set(0, ly, towerZ + 2, B.AIR);
    // Tower top loot
    chestAt(0, 9, towerZ);
    set(0, 11, towerZ, B.GLOWSTONE);
    // Central altar — sculk + diamond block
    for (let ly = 1; ly <= 3; ly++) {
      for (let lx = -2; lx <= 2; lx++) for (let lz = -2; lz <= 2; lz++) {
        if (ly === 3 && lx === 0 && lz === 0) set(lx, ly, lz, B.DIAMOND_ORE);
        else if (ly === 3) set(lx, ly, lz, B.SCULK);
        else set(lx, ly, lz, B.COBBLE);
      }
    }
    // Sculk shrieker emblems (sculk + glowstone) at altar corners
    for (const [ex, ez] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      set(ex, 4, ez, B.SCULK);
      set(ex, 5, ez, B.GLOWSTONE);
    }
    // Central altar chest + ring around altar
    chestAt(0, 4, 0, true);  // CENTRAL altar = elite loot
    chestAt(-4, 1, -4);
    chestAt(4, 1, -4);
    chestAt(-4, 1, 4);
    chestAt(4, 1, 4);
    // Sculk floor patches scattered (lots more)
    for (let i = 0; i < 60; i++) {
      const lx = -W + 1 + ((r() * (W * 2 - 1)) | 0);
      const lz = -D + 1 + ((r() * (D * 2 - 1)) | 0);
      set(lx, 1, lz, B.SCULK);
    }
  }

  _seedAncientChest(wx, wy, wz, isCentral) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 211 + wy * 53 + wz * 17 + this.seed);
    const loot = [
      { id: I.DIAMOND, n: 4 }, { id: I.IRON_INGOT, n: 6 }, { id: I.GOLD_INGOT, n: 5 },
      { id: B.GLOWSTONE, n: 3 }, { id: I.LAPIS, n: 8 }, { id: I.EMERALD, n: 3 },
      { id: I.ENCHANTED_GOLDEN_APPLE, n: 1 }, { id: I.GOLDEN_APPLE, n: 2 },
      { id: B.OBSIDIAN, n: 4 }, { id: I.UPGRADE_TEMPLATE, n: 1 }, { id: I.ENDERITE_SCRAP, n: 2 },
      { id: I.ENCHANTED_BOOK, n: 1 }, { id: I.ECHO_SHARD, n: 3 }, { id: B.SCULK, n: 4 },
      { id: I.ENDERITE_TEMPLATE, n: 1 }, { id: I.NETHERITE_INGOT, n: 1 }
    ];
    // Premium loot only in central altar chest
    const eliteLoot = [
      { id: I.NETHERITE_INGOT, n: 3 }, { id: I.ENDERITE_INGOT, n: 2 }, { id: I.DIAMOND, n: 8 },
      { id: I.ENDERITE_SCRAP, n: 4 }, { id: I.ENCHANTED_GOLDEN_APPLE, n: 2 },
      { id: I.ECHO_SHARD, n: 6 }, { id: I.SCULK_AMMO, n: 16 },
      { id: I.ENDERITE_TEMPLATE, n: 2 }, { id: I.UPGRADE_TEMPLATE, n: 2 }
    ];
    const rolls = isCentral ? 14 : 8;
    const table = isCentral ? eliteLoot : loot;
    for (let i = 0; i < rolls; i++) {
      const it = table[(r() * table.length) | 0];
      const slot = (r() * 27) | 0;
      if (!cont.slots[slot]) cont.slots[slot] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    // Warden Blaster spawn: 0.4% regular, 0.6% central
    const blasterChance = isCentral ? 0.006 : 0.004;
    if (r() < blasterChance) {
      for (let s = 0; s < 27; s++) if (!cont.slots[s]) { cont.slots[s] = { id: I.WARDEN_BLASTER, count: 1 }; break; }
    }
    this.containers.set(k, cont);
  }

  _buildDungeon(ch, wx, wy, wz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, wx + lx - x0, wy + ly, wz + lz - z0, id, mode || 'force');
    const half = 3, h = 4;
    // walls + floor + ceiling of cobble
    for (let lx = -half; lx <= half; lx++) for (let lz = -half; lz <= half; lz++) {
      set(lx, 0, lz, B.COBBLE);
      set(lx, h, lz, B.COBBLE);
    }
    for (let ly = 1; ly < h; ly++) for (let lx = -half; lx <= half; lx++) for (let lz = -half; lz <= half; lz++) {
      const onEdge = (lx === -half || lx === half || lz === -half || lz === half);
      if (onEdge) set(lx, ly, lz, B.COBBLE);
      else set(lx, ly, lz, B.AIR);
    }
    // doorway on -X wall
    set(-half, 1, 0, B.AIR); set(-half, 2, 0, B.AIR);
    // chest at center-back
    if (wx - x0 >= 0 && wx - x0 < CH && wz + (half - 1) - z0 >= 0 && wz + (half - 1) - z0 < CH) {
      this._setLocal(ch, wx - x0, wy + 1, wz + (half - 1) - z0, B.CHEST, 'force');
      this._seedDungeonChest(wx, wy + 1, wz + (half - 1));
    }
    // torches on walls
    set(-half + 1, 3, -half + 1, B.TORCH);
    set(half - 1, 3, half - 1, B.TORCH);
  }

  _seedDungeonChest(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 17 + wy * 73 + wz * 31 + this.seed);
    const loot = [
      { id: I.IRON_INGOT, n: 4 }, { id: I.GOLD_INGOT, n: 2 }, { id: I.COAL, n: 6 },
      { id: I.APPLE, n: 3 }, { id: I.COOKED_BEEF, n: 2 }, { id: I.BONE, n: 4 },
      { id: I.STRING, n: 3 }, { id: I.DIAMOND, n: 1 }, { id: B.OBSIDIAN, n: 2 }
    ];
    for (let i = 0; i < 4; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    this.containers.set(k, cont);
  }

  _buildMineshaft(ch, wx, wy, wz, rx, rz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, wx + lx - x0, wy + ly, wz + lz - z0, id, mode || 'force');
    // 4 tunnels radiating from center (N, S, E, W) — 24 blocks long each
    const length = 24;
    const carve = (axis, dir) => {
      for (let t = 0; t < length; t++) {
        const dx = (axis === 'x') ? dir * t : 0;
        const dz = (axis === 'z') ? dir * t : 0;
        // 2-wide, 3-tall corridor
        for (let lx = -1; lx <= 1; lx++) for (let ly = 0; ly <= 2; ly++) for (let lz = -1; lz <= 1; lz++) {
          if (axis === 'x') set(dx + lx, ly, lz, ly === 0 ? B.PLANKS : B.AIR);
          else set(lx, ly, dz + lz, ly === 0 ? B.PLANKS : B.AIR);
        }
        // wood supports every 5 blocks
        if (t % 5 === 0 && t > 0) {
          if (axis === 'x') {
            set(dx, 0, -1, B.LOG); set(dx, 0, 1, B.LOG);
            set(dx, 1, -1, B.LOG); set(dx, 1, 1, B.LOG);
            set(dx, 2, -1, B.LOG); set(dx, 2, 1, B.LOG);
            set(dx, 3, -1, B.LOG); set(dx, 3, 0, B.LOG); set(dx, 3, 1, B.LOG); // cross brace
          } else {
            set(-1, 0, dz, B.LOG); set(1, 0, dz, B.LOG);
            set(-1, 1, dz, B.LOG); set(1, 1, dz, B.LOG);
            set(-1, 2, dz, B.LOG); set(1, 2, dz, B.LOG);
            set(-1, 3, dz, B.LOG); set(0, 3, dz, B.LOG); set(1, 3, dz, B.LOG);
          }
        }
        // torch every 7 blocks for light
        if (t > 0 && t % 7 === 0) {
          if (axis === 'x') set(dx, 2, 0, B.TORCH);
          else set(0, 2, dz, B.TORCH);
        }
      }
    };
    // Center hub: small 3×3 room
    for (let lx = -1; lx <= 1; lx++) for (let lz = -1; lz <= 1; lz++) {
      set(lx, 0, lz, B.PLANKS);
      for (let ly = 1; ly <= 2; ly++) set(lx, ly, lz, B.AIR);
    }
    // Always carve the 4 directions
    carve('x', 1); carve('x', -1); carve('z', 1); carve('z', -1);
    // Loot chest at center
    if (wx - x0 >= 0 && wx - x0 < CH && wz - z0 >= 0 && wz - z0 < CH) {
      this._setLocal(ch, wx - x0, wy + 1, wz - z0, B.CHEST, 'force');
      this._seedMineshaftChest(wx, wy + 1, wz);
    }
  }

  _seedMineshaftChest(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 41 + wy * 23 + wz * 67 + this.seed);
    const loot = [
      { id: I.IRON_INGOT, n: 5 }, { id: I.COAL, n: 8 }, { id: B.PLANKS, n: 12 },
      { id: B.LOG, n: 6 }, { id: I.STICK, n: 8 }, { id: I.APPLE, n: 2 },
      { id: I.GOLD_INGOT, n: 2 }, { id: B.COBBLE, n: 6 }
    ];
    for (let i = 0; i < 5; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    this.containers.set(k, cont);
  }

  _buildStronghold(ch, wx, wy, wz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const set = (lx, ly, lz, id, mode) => this._setLocal(ch, wx + lx - x0, wy + ly, wz + lz - z0, id, mode || 'force');
    // Main hall: 11×11×5 of stone bricks
    const R = 5, H = 5;
    for (let lx = -R; lx <= R; lx++) for (let lz = -R; lz <= R; lz++) {
      set(lx, 0, lz, B.STONE_BRICKS);
      set(lx, H, lz, B.STONE_BRICKS);
    }
    for (let ly = 1; ly < H; ly++) for (let lx = -R; lx <= R; lx++) for (let lz = -R; lz <= R; lz++) {
      const edge = (lx === -R || lx === R || lz === -R || lz === R);
      if (edge) set(lx, ly, lz, B.STONE_BRICKS);
      else set(lx, ly, lz, B.AIR);
    }
    // 4 stone-brick pillars inside
    for (const px of [-2, 2]) for (const pz of [-2, 2]) {
      for (let ly = 1; ly < H; ly++) set(px, ly, pz, B.STONE_BRICKS);
    }
    // 4 doorways (N S E W)
    for (let ly = 1; ly <= 3; ly++) { set(0, ly, -R, B.AIR); set(0, ly, R, B.AIR); set(-R, ly, 0, B.AIR); set(R, ly, 0, B.AIR); }
    // 4 corridor stubs from doorways (16 blocks each)
    const corridor = (dx, dz) => {
      for (let t = 1; t <= 16; t++) {
        for (let off = -1; off <= 1; off++) for (let ly = 0; ly <= 4; ly++) {
          const cx = (dx !== 0) ? dx * (R + t) : off;
          const cz = (dz !== 0) ? dz * (R + t) : off;
          if (ly === 0 || ly === 4) set(cx, ly, cz, B.STONE_BRICKS);
          else if (off === -1 || off === 1) set(cx, ly, cz, B.STONE_BRICKS);
          else set(cx, ly, cz, B.AIR);
        }
        if (t % 6 === 0) {
          if (dx !== 0) set(dx * (R + t), 3, 0, B.TORCH);
          else set(0, 3, dz * (R + t), B.TORCH);
        }
      }
    };
    corridor(1, 0); corridor(-1, 0); corridor(0, 1); corridor(0, -1);
    // End Portal frame ring (12 frames around a 3×3 air well at center)
    // Place 3 frames per side (lx -1..1 with edge at -2 or +2) on the floor (ly=1)
    const eyeRng = makeRNG(wx * 271 + wz * 379 + this.seed);
    for (let lx = -1; lx <= 1; lx++) {
      set(lx, 1, -2, eyeRng() < 0.15 ? B.END_PORTAL_FRAME_LIT : B.END_PORTAL_FRAME);
      set(lx, 1, 2, eyeRng() < 0.15 ? B.END_PORTAL_FRAME_LIT : B.END_PORTAL_FRAME);
    }
    for (let lz = -1; lz <= 1; lz++) {
      set(-2, 1, lz, eyeRng() < 0.15 ? B.END_PORTAL_FRAME_LIT : B.END_PORTAL_FRAME);
      set(2, 1, lz, eyeRng() < 0.15 ? B.END_PORTAL_FRAME_LIT : B.END_PORTAL_FRAME);
    }
    // Carve the 3×3 well at center (where portal will form when activated)
    for (let lx = -1; lx <= 1; lx++) for (let lz = -1; lz <= 1; lz++) {
      set(lx, 1, lz, B.AIR);
    }
    // Loot chest off to the side
    if (wx - x0 + 4 >= 0 && wx - x0 + 4 < CH && wz - z0 - z0 >= 0) {
      // place chest 4 blocks away in one direction
    }
    set(4, 1, 0, B.CHEST);
    if (wx + 4 - x0 >= 0 && wx + 4 - x0 < CH && wz - z0 >= 0 && wz - z0 < CH) {
      this._seedStrongholdChest(wx + 4, wy + 1, wz);
    }
    // Glowstone lights at corners of main hall
    set(-R + 1, H - 1, -R + 1, B.GLOWSTONE);
    set(R - 1, H - 1, -R + 1, B.GLOWSTONE);
    set(-R + 1, H - 1, R - 1, B.GLOWSTONE);
    set(R - 1, H - 1, R - 1, B.GLOWSTONE);
  }

  _seedStrongholdChest(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 13 + wy * 17 + wz * 19 + this.seed);
    const loot = [
      { id: I.DIAMOND, n: 3 }, { id: I.GOLD_INGOT, n: 5 }, { id: I.IRON_INGOT, n: 8 },
      { id: B.OBSIDIAN, n: 4 }, { id: I.COOKED_BEEF, n: 3 }, { id: B.GLOWSTONE, n: 2 },
      { id: I.APPLE, n: 4 }, { id: I.BOW, n: 1 }, { id: I.ARROW, n: 12 }
    ];
    for (let i = 0; i < 6; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    this.containers.set(k, cont);
  }

  /* ---------------- nether structures ---------------- */
  _applyNetherStructures(ch) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    // Nether fortresses (kohtuullisen tiheässä: pienempi alue ja korkea todennäköisyys per alue)
    const FR = 72;
    for (let rz = Math.floor((z0 - 64) / FR); rz <= Math.floor((z0 + CH + 64) / FR); rz++) {
      for (let rx = Math.floor((x0 - 64) / FR); rx <= Math.floor((x0 + CH + 64) / FR); rx++) {
        if (hash3(rx, 88, rz, this.seed + 0x6677) > 0.55) continue;
        const fx = rx * FR + 16 + Math.floor(hash3(rx, 9, rz, this.seed + 0x3311) * (FR - 32));
        const fz = rz * FR + 16 + Math.floor(hash3(rx, 11, rz, this.seed + 0x5511) * (FR - 32));
        this._buildNetherFortress(ch, fx, fz);
      }
    }
    // Bastions (offset region)
    const BR = 240;
    for (let rz = Math.floor((z0 - 64) / BR); rz <= Math.floor((z0 + CH + 64) / BR); rz++) {
      for (let rx = Math.floor((x0 - 64) / BR); rx <= Math.floor((x0 + CH + 64) / BR); rx++) {
        if (hash3(rx + 7, 91, rz + 13, this.seed + 0xaa55) > 0.45) continue;
        const bx = rx * BR + 120 + Math.floor(hash3(rx, 19, rz, this.seed + 0x77aa) * 100);
        const bz = rz * BR + 120 + Math.floor(hash3(rx, 21, rz, this.seed + 0x99bb) * 100);
        this._buildBastion(ch, bx, bz);
      }
    }
  }

  _buildNetherFortress(ch, fx, fz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const baseY = 44, length = 22, halfW = 2;
    const set = (lx, ly, lz, id) => this._setLocal(ch, fx + lx - x0, baseY + ly, fz + lz - z0, id, 'force');

    // clearance around bridge so structure is visible inside open air pocket
    for (let lz = -3; lz < length + 3; lz++) {
      for (let lx = -halfW - 2; lx <= halfW + 2; lx++) {
        for (let ly = -2; ly <= 8; ly++) set(lx, ly, lz, B.AIR);
      }
    }

    // bridge floor + side parapets
    for (let lz = 0; lz < length; lz++) {
      for (let lx = -halfW; lx <= halfW; lx++) set(lx, 0, lz, B.NETHER_BRICKS);
      set(-halfW, 1, lz, B.NETHER_BRICKS); set(halfW, 1, lz, B.NETHER_BRICKS);
      set(-halfW, 2, lz, B.NETHER_BRICKS); set(halfW, 2, lz, B.NETHER_BRICKS);
    }
    // glowstone lanterns set into the parapet
    for (let lz = 4; lz < length - 1; lz += 5) {
      set(-halfW, 2, lz, B.GLOWSTONE); set(halfW, 2, lz, B.GLOWSTONE);
    }

    // end towers (5×5×6, hollow)
    for (const az of [0, length - 1]) {
      const aw = halfW + 1;
      for (let lx = -aw; lx <= aw; lx++) for (let lz = az - 2; lz <= az + 2; lz++) {
        set(lx, 0, lz, B.NETHER_BRICKS);
        set(lx, 5, lz, B.NETHER_BRICKS);
        for (let ly = 1; ly <= 4; ly++) {
          const edge = (lx === -aw || lx === aw || lz === az - 2 || lz === az + 2);
          if (edge) set(lx, ly, lz, B.NETHER_BRICKS);
          else set(lx, ly, lz, B.AIR);
        }
      }
      // doorway connecting bridge → tower
      const dz = (az === 0) ? az + 2 : az - 2;
      for (let ly = 1; ly <= 3; ly++) set(0, ly, dz, B.AIR);
      // interior light
      set(0, 4, az, B.GLOWSTONE);
      // open battlements on roof edge
      for (let lx = -aw; lx <= aw; lx += 2) {
        set(lx, 6, az - 2, B.NETHER_BRICKS);
        set(lx, 6, az + 2, B.NETHER_BRICKS);
      }
    }

    // loot chest inside far tower
    const cwx = fx + 1, cwy = baseY + 1, cwz = fz + length - 1;
    if (cwx - x0 >= 0 && cwx - x0 < CH && cwz - z0 >= 0 && cwz - z0 < CH) {
      this._setLocal(ch, cwx - x0, cwy, cwz - z0, B.CHEST, 'force');
      this._seedNetherChest(cwx, cwy, cwz, 'fortress');
    }
    // blaze spawnerit molempiin torneihin (lähitorni ja kaukotorni) — varmistaa että
    // pelaaja löytää spawnerin ja saa blaze-rodeja myös jos fortress on chunkien rajalla
    for (const az of [0, length - 1]) {
      const swx = fx, swy = baseY + 1, swz = fz + az;
      if (swx - x0 >= 0 && swx - x0 < CH && swz - z0 >= 0 && swz - z0 < CH) {
        this._setLocal(ch, swx - x0, swy, swz - z0, B.SPAWNER, 'force');
        this.spawners.add(swx + ',' + swy + ',' + swz);
      }
    }
  }

  _buildBastion(ch, bx, bz) {
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    const baseY = 36, R = 5;
    const set = (lx, ly, lz, id) => this._setLocal(ch, bx + lx - x0, baseY + ly, bz + lz - z0, id, 'force');

    // clearance moat around the bastion
    for (let lx = -R - 2; lx <= R + 2; lx++) for (let lz = -R - 2; lz <= R + 2; lz++) {
      for (let ly = -2; ly <= 11; ly++) set(lx, ly, lz, B.AIR);
    }
    // foundation slab (3 layers)
    for (let lx = -R; lx <= R; lx++) for (let lz = -R; lz <= R; lz++) {
      set(lx, -2, lz, B.NETHER_BRICKS);
      set(lx, -1, lz, B.NETHER_BRICKS);
      set(lx, 0, lz, B.NETHER_BRICKS);
    }
    // outer walls (6 tall, hollow interior)
    for (let ly = 1; ly <= 6; ly++) for (let lx = -R; lx <= R; lx++) for (let lz = -R; lz <= R; lz++) {
      if (lx === -R || lx === R || lz === -R || lz === R) set(lx, ly, lz, B.NETHER_BRICKS);
    }
    // doorway on south wall
    for (let ly = 1; ly <= 3; ly++) for (let lx = -1; lx <= 1; lx++) set(lx, ly, -R, B.AIR);
    // battlements row 7 (alternating)
    for (let lx = -R; lx <= R; lx++) {
      if (((lx + R) & 1) === 0) {
        set(lx, 7, -R, B.NETHER_BRICKS);
        set(lx, 7, R, B.NETHER_BRICKS);
      }
    }
    for (let lz = -R + 1; lz < R; lz++) {
      if (((lz + R) & 1) === 0) {
        set(-R, 7, lz, B.NETHER_BRICKS);
        set(R, 7, lz, B.NETHER_BRICKS);
      }
    }
    // corner pillar towers (taller, gold ore caps)
    for (const tx of [-R, R]) for (const tz of [-R, R]) {
      for (let ly = 1; ly <= 9; ly++) set(tx, ly, tz, B.NETHER_BRICKS);
      set(tx, 10, tz, B.GOLD_ORE);
    }
    // interior quartz pillars topped with glowstone
    for (const px of [-3, 3]) for (const pz of [-3, 3]) {
      for (let ly = 1; ly <= 5; ly++) set(px, ly, pz, B.QUARTZ_BLOCK);
      set(px, 6, pz, B.GLOWSTONE);
    }
    // central ceiling lamp
    set(0, 5, 0, B.GLOWSTONE);
    // central treasure chest
    const cwx = bx, cwy = baseY + 1, cwz = bz;
    if (cwx - x0 >= 0 && cwx - x0 < CH && cwz - z0 >= 0 && cwz - z0 < CH) {
      this._setLocal(ch, cwx - x0, cwy, cwz - z0, B.CHEST, 'force');
      this._seedNetherChest(cwx, cwy, cwz, 'bastion');
    }
  }

  _seedNetherChest(wx, wy, wz, kind) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 71 + wy * 13 + wz * 19 + this.seed);
    const loot = (kind === 'bastion')
      ? [{ id: I.GOLD_INGOT, n: 6 }, { id: I.NETHER_QUARTZ, n: 8 }, { id: B.GLOWSTONE, n: 3 },
         { id: I.IRON_INGOT, n: 4 }, { id: I.DIAMOND, n: 1 }, { id: B.OBSIDIAN, n: 2 }]
      : [{ id: I.IRON_INGOT, n: 3 }, { id: I.NETHER_QUARTZ, n: 5 }, { id: I.GOLD_INGOT, n: 2 },
         { id: I.FLINT_AND_STEEL, n: 1 }, { id: I.BONE, n: 4 }, { id: I.STRING, n: 4 }];
    for (let i = 0; i < 5; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    // Bastion: 85% chance to contain a Netherite Upgrade Smithing Template
    if (kind === 'bastion' && r() < 0.85) {
      for (let s = 0; s < 27; s++) if (!cont.slots[s]) { cont.slots[s] = { id: I.UPGRADE_TEMPLATE, count: 1 }; break; }
    }
    this.containers.set(k, cont);
  }

  _seedHutChest(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    if (this.containers.has(k)) return;
    const cont = { type: 'chest', slots: new Array(27).fill(null) };
    const r = makeRNG(wx * 31 + wy * 7 + wz * 911 + this.seed);
    const loot = [
      { id: I.APPLE, n: 3 }, { id: B.LOG, n: 4 }, { id: I.IRON_INGOT, n: 2 },
      { id: I.COAL, n: 4 }, { id: B.BREAD || I.COOKED_PORK, n: 2 }, { id: I.STICK, n: 5 }
    ];
    for (let i = 0; i < 4; i++) {
      const it = loot[(r() * loot.length) | 0];
      cont.slots[(r() * 27) | 0] = { id: it.id, count: 1 + ((r() * it.n) | 0) };
    }
    this.containers.set(k, cont);
  }

  /* ---------------- block access ---------------- */
  getBlock(wx, wy, wz) {
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_H) return B.AIR;
    const cx = Math.floor(wx / CH), cz = Math.floor(wz / CH);
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch || !ch.generated) return B.AIR;
    const lx = wx - cx * CH, lz = wz - cz * CH;
    return ch.data[lx + lz * CH + wy * CH * CH];
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_H) return;
    const cx = Math.floor(wx / CH), cz = Math.floor(wz / CH);
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch) return;
    const lx = wx - cx * CH, lz = wz - cz * CH;
    ch.data[lx + lz * CH + wy * CH * CH] = id;
    this.recordEdit(wx, wy, wz, id);
    ch.dirty = true;
    if (lx === 0) this._dirtyN(cx - 1, cz);
    if (lx === CH - 1) this._dirtyN(cx + 1, cz);
    if (lz === 0) this._dirtyN(cx, cz - 1);
    if (lz === CH - 1) this._dirtyN(cx, cz + 1);
    if (id !== B.CHEST && id !== B.FURNACE && id !== B.SHULKER_BOX) this.containers.delete(wx + ',' + wy + ',' + wz);
    if (id !== B.SPAWNER) this.spawners.delete(wx + ',' + wy + ',' + wz);
  }
  _dirtyN(cx, cz) { const c = this.getChunk(cx, cz); if (c) c.dirty = true; }

  getContainer(wx, wy, wz) {
    const k = wx + ',' + wy + ',' + wz;
    let c = this.containers.get(k);
    if (c) return c;
    const id = this.getBlock(wx, wy, wz);
    if (id === B.CHEST) c = { type: 'chest', slots: new Array(27).fill(null) };
    else if (id === B.SHULKER_BOX) c = { type: 'shulker', slots: new Array(27).fill(null) };
    else if (id === B.FURNACE) c = { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
    else if (id === B.BREWING_STAND) c = { type: 'brewing', water: null, ingredient: null, fuel: null, output: null, brew: 0 };
    else return null;
    this.containers.set(k, c);
    return c;
  }

  /* ---------------- meshing ---------------- */
  buildChunkMesh(ch) {
    const op = { pos: [], nor: [], col: [], uv: [], idx: [] };
    const tr = { pos: [], nor: [], col: [], uv: [], idx: [] };
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < CH; z++) {
        for (let x = 0; x < CH; x++) {
          const id = ch.data[x + z * CH + y * CH * CH];
          if (id === B.AIR || id === B.TORCH || id === B.FIRE) continue;
          const def = BLOCKS[id];
          if (!def) continue;
          const trans = isTransparentMesh(id);
          const t = trans ? tr : op;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nb = this.getBlock(x0 + x + F.dir[0], y + F.dir[1], z0 + z + F.dir[2]);
            const draw = trans ? (nb !== id && !isOpaqueCube(nb)) : !isOpaqueCube(nb);
            if (!draw) continue;
            const uvr = Tex.uv(faceTile(def, f));
            const base = t.pos.length / 3;
            for (let k = 0; k < 4; k++) {
              const c = F.corners[k];
              t.pos.push(x + c[0], y + c[1], z + c[2]);
              t.nor.push(F.dir[0], F.dir[1], F.dir[2]);
              t.col.push(F.shade, F.shade, F.shade);
              t.uv.push(uvr[0] + UVL[k][0] * (uvr[2] - uvr[0]), uvr[1] + UVL[k][1] * (uvr[3] - uvr[1]));
            }
            t.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
    ch.opaqueMesh = this._makeMesh(ch.opaqueMesh, op, this.matOpaque, x0, z0);
    ch.transMesh = this._makeMesh(ch.transMesh, tr, this.matTrans, x0, z0);
    this._rebuildTorches(ch);
    ch.dirty = false;
  }

  _makeMesh(old, a, mat, x0, z0) {
    if (old) { this.group.remove(old); old.geometry.dispose(); }
    if (a.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
    g.setIndex(new THREE.Uint32BufferAttribute(a.idx, 1));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x0, 0, z0);
    m.frustumCulled = true;
    g.computeBoundingSphere();
    this.group.add(m);
    return m;
  }

  _rebuildTorches(ch) {
    for (const tm of ch.torchMeshes) this.group.remove(tm);
    ch.torchMeshes.length = 0;
    const x0 = ch.cx * CH, z0 = ch.cz * CH;
    for (let y = 0; y < WORLD_H; y++) for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) {
      const id = ch.data[x + z * CH + y * CH * CH];
      if (id === B.TORCH) {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(this.torchStick, this.torchStickMat);
        stick.position.y = -0.22;
        const flame = new THREE.Mesh(this.torchFlame, this.torchFlameMat);
        flame.position.y = 0.16;
        g.add(stick); g.add(flame);
        g.position.set(x0 + x + 0.5, y + 0.35, z0 + z + 0.5);
        this.group.add(g);
        ch.torchMeshes.push(g);
      } else if (id === B.FIRE) {
        const g = new THREE.Group();
        const outer = new THREE.Mesh(this.fireGeoOuter, this.fireMatOuter);
        const inner = new THREE.Mesh(this.fireGeoInner, this.fireMatInner);
        outer.position.y = -0.07; inner.position.y = -0.18;
        g.add(outer); g.add(inner);
        g.position.set(x0 + x + 0.5, y + 0.5, z0 + z + 0.5);
        this.group.add(g);
        ch.torchMeshes.push(g);
      }
    }
  }

  /* ---------------- streaming ---------------- */
  update(px, pz, genBudget, meshBudget) {
    const pcx = Math.floor(px / CH), pcz = Math.floor(pz / CH);
    const R = this.renderDist;
    let pending = 0;
    // generate data
    for (const o of this.offsets) {
      const ch = this.getOrCreate(pcx + o.dx, pcz + o.dz);
      if (!ch.generated) {
        if (genBudget > 0) { this.generateChunk(ch); genBudget--; }
        else pending++;
      }
    }
    // mesh
    for (const o of this.offsets) {
      if (o.d > R + 0.5) continue;
      const ch = this.getChunk(pcx + o.dx, pcz + o.dz);
      if (!ch || !ch.generated) { pending++; continue; }
      if (ch.opaqueMesh || ch.transMesh || !ch.dirty) {
        if (!ch.dirty) continue;
      }
      // need neighbours generated
      const n1 = this.getChunk(ch.cx + 1, ch.cz), n2 = this.getChunk(ch.cx - 1, ch.cz);
      const n3 = this.getChunk(ch.cx, ch.cz + 1), n4 = this.getChunk(ch.cx, ch.cz - 1);
      if (!n1 || !n1.generated || !n2 || !n2.generated || !n3 || !n3.generated || !n4 || !n4.generated) { pending++; continue; }
      if (meshBudget > 0) { this.buildChunkMesh(ch); meshBudget--; }
      else pending++;
    }
    // unload far meshes (keep data)
    for (const ch of this.chunks.values()) {
      const dist = Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz));
      if (dist > R + 2 && (ch.opaqueMesh || ch.transMesh || ch.torchMeshes.length)) {
        if (ch.opaqueMesh) { this.group.remove(ch.opaqueMesh); ch.opaqueMesh.geometry.dispose(); ch.opaqueMesh = null; }
        if (ch.transMesh) { this.group.remove(ch.transMesh); ch.transMesh.geometry.dispose(); ch.transMesh = null; }
        for (const tm of ch.torchMeshes) this.group.remove(tm);
        ch.torchMeshes.length = 0;
        ch.dirty = true;
      }
    }
    return pending === 0;
  }

  /* ---------------- nether portal ---------------- */
  lightPortal(ax, ay, az) {
    if (this.getBlock(ax, ay, az) !== B.AIR) return false;
    for (const axis of ['x', 'z']) {
      const cells = this._portalRegion(ax, ay, az, axis);
      if (cells) {
        for (const c of cells) this.setBlock(c[0], c[1], c[2], B.PORTAL);
        return true;
      }
    }
    return false;
  }

  _portalRegion(sx, sy, sz, axis) {
    const seen = {}, cells = [];
    const stack = [[sx, sy, sz]];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    while (stack.length) {
      const c = stack.pop();
      const x = c[0], y = c[1], z = c[2];
      const k = x + ',' + y + ',' + z;
      if (seen[k]) continue;
      seen[k] = 1;
      if (this.getBlock(x, y, z) !== B.AIR) continue;
      cells.push([x, y, z]);
      if (cells.length > 30) return null;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (axis === 'x') { stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z]); }
      else { stack.push([x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z]); }
    }
    const W = (axis === 'x') ? (maxX - minX + 1) : (maxZ - minZ + 1);
    const H = maxY - minY + 1;
    if (W < 2 || W > 4 || H < 3 || H > 5) return null;
    if (cells.length !== W * H) return null;
    for (const c of cells) {
      const x = c[0], y = c[1], z = c[2];
      const onLeft = (axis === 'x') ? x === minX : z === minZ;
      const onRight = (axis === 'x') ? x === maxX : z === maxZ;
      if (axis === 'x') {
        if (onLeft && this.getBlock(x - 1, y, z) !== B.OBSIDIAN) return null;
        if (onRight && this.getBlock(x + 1, y, z) !== B.OBSIDIAN) return null;
      } else {
        if (onLeft && this.getBlock(x, y, z - 1) !== B.OBSIDIAN) return null;
        if (onRight && this.getBlock(x, y, z + 1) !== B.OBSIDIAN) return null;
      }
      if (y === minY && this.getBlock(x, y - 1, z) !== B.OBSIDIAN) return null;
      if (y === maxY && this.getBlock(x, y + 1, z) !== B.OBSIDIAN) return null;
    }
    return cells;
  }

  // Compute the nearest stronghold position from seed (works even if chunk not generated).
  // Uses the same parameters as _applyUndergroundStructures.
  findNearestStronghold(wx, wz) {
    const TR = 380;
    let best = null, bestDist = Infinity;
    const baseRx = Math.floor(wx / TR), baseRz = Math.floor(wz / TR);
    for (let drz = -3; drz <= 3; drz++) for (let drx = -3; drx <= 3; drx++) {
      const rx = baseRx + drx, rz = baseRz + drz;
      if (hash3(rx, 91, rz, this.seed + 0xc001) > 0.6) continue;
      const tx = rx * TR + 60 + Math.floor(hash3(rx, 53, rz, this.seed + 0xc002) * (TR - 120));
      const tz = rz * TR + 60 + Math.floor(hash3(rx, 57, rz, this.seed + 0xc003) * (TR - 120));
      const ty = 12 + Math.floor(hash3(rx, 59, rz, this.seed + 0xc004) * 16);
      const d = Math.hypot(tx - wx, tz - wz);
      if (d < bestDist) { bestDist = d; best = { x: tx, y: ty, z: tz, dist: d }; }
    }
    return best;
  }

  // Find nearest Ancient City using same parameters as _applyUndergroundStructures
  findNearestAncientCity(wx, wz) {
    const ACR = 300;
    let best = null, bestDist = Infinity;
    const baseRx = Math.floor(wx / ACR), baseRz = Math.floor(wz / ACR);
    for (let drz = -3; drz <= 3; drz++) for (let drx = -3; drx <= 3; drx++) {
      const rx = baseRx + drx, rz = baseRz + drz;
      if (hash3(rx, 991, rz, this.seed + 0xacac) > 0.55) continue;
      const ax = rx * ACR + 64 + Math.floor(hash3(rx, 53, rz, this.seed + 0xac01) * (ACR - 128));
      const az = rz * ACR + 64 + Math.floor(hash3(rx, 57, rz, this.seed + 0xac02) * (ACR - 128));
      const d = Math.hypot(ax - wx, az - wz);
      if (d < bestDist) { bestDist = d; best = { x: ax, y: 6, z: az, dist: d }; }
    }
    return best;
  }

  findSpawn() {
    for (let r = 0; r < 64; r++) {
      for (let a = 0; a < Math.max(1, r * 6); a++) {
        const ang = a / Math.max(1, r * 6) * Math.PI * 2;
        const wx = Math.round(Math.cos(ang) * r);
        const wz = Math.round(Math.sin(ang) * r);
        const biome = this.biomeAt(wx, wz);
        if (biome === BIOME.OCEAN) continue;
        const h = this.columnHeight(wx, wz);
        if (h > SEA) return { x: wx + 0.5, y: h + 0.5, z: wz + 0.5 };
      }
    }
    return { x: 0.5, y: this.columnHeight(0, 0) + 0.5, z: 0.5 };
  }
}
