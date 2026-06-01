/* CopyCraft — physics, mobs, dropped items, arrows */
'use strict';

/* ---------------- shared AABB collision ---------------- */
function _solidIn(world, x0, x1, y0, y1, z0, z1) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        if (isSolid(world.getBlock(x, y, z))) return true;
  return false;
}

// pos = feet centre; mutates pos & vel. returns {onGround,hitX,hitZ}
function moveAndCollide(world, pos, vel, hw, height, dt) {
  const eps = 1e-3;
  let onGround = false, hitX = false, hitZ = false;
  // X
  pos.x += vel.x * dt;
  {
    const y0 = Math.floor(pos.y + eps), y1 = Math.floor(pos.y + height - eps);
    const z0 = Math.floor(pos.z - hw + eps), z1 = Math.floor(pos.z + hw - eps);
    if (vel.x > 0) {
      const bx = Math.floor(pos.x + hw);
      if (_solidIn(world, bx, bx, y0, y1, z0, z1)) { pos.x = bx - hw - eps; vel.x = 0; hitX = true; }
    } else if (vel.x < 0) {
      const bx = Math.floor(pos.x - hw);
      if (_solidIn(world, bx, bx, y0, y1, z0, z1)) { pos.x = bx + 1 + hw + eps; vel.x = 0; hitX = true; }
    }
  }
  // Z
  pos.z += vel.z * dt;
  {
    const y0 = Math.floor(pos.y + eps), y1 = Math.floor(pos.y + height - eps);
    const x0 = Math.floor(pos.x - hw + eps), x1 = Math.floor(pos.x + hw - eps);
    if (vel.z > 0) {
      const bz = Math.floor(pos.z + hw);
      if (_solidIn(world, x0, x1, y0, y1, bz, bz)) { pos.z = bz - hw - eps; vel.z = 0; hitZ = true; }
    } else if (vel.z < 0) {
      const bz = Math.floor(pos.z - hw);
      if (_solidIn(world, x0, x1, y0, y1, bz, bz)) { pos.z = bz + 1 + hw + eps; vel.z = 0; hitZ = true; }
    }
  }
  // Y
  pos.y += vel.y * dt;
  {
    const x0 = Math.floor(pos.x - hw + eps), x1 = Math.floor(pos.x + hw - eps);
    const z0 = Math.floor(pos.z - hw + eps), z1 = Math.floor(pos.z + hw - eps);
    if (vel.y <= 0) {
      const by = Math.floor(pos.y);
      if (_solidIn(world, x0, x1, by, by, z0, z1)) { pos.y = by + 1; vel.y = 0; onGround = true; }
    } else {
      const ty = Math.floor(pos.y + height);
      if (_solidIn(world, x0, x1, ty, ty, z0, z1)) { pos.y = ty - height - eps; vel.y = 0; }
    }
  }
  return { onGround, hitX, hitZ };
}

/* ---------------- shared visuals ---------------- */
const Entities = {
  init() {
    this.dropMat = new THREE.MeshLambertMaterial({ map: Tex.texture });
    this.dropGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    this.arrowGeo = new THREE.BoxGeometry(0.09, 0.09, 0.7);
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0xb0b0b0 });
    // Palavien mobien liekit
    this.fireGeo = new THREE.BoxGeometry(0.28, 0.45, 0.28);
    this.fireMatA = new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: 0.85 });
    this.fireMatB = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95 });
  },
  makeItemMesh(id) {
    const d = defOf(id);
    const tile = d.isBlock ? (d.all !== undefined ? d.all : (d.front !== undefined ? d.front : d.side)) : d.tile;
    const geo = this.dropGeo.clone();
    const uvr = Tex.uv(tile), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uvr[0] + uv.getX(i) * (uvr[2] - uvr[0]), uvr[1] + uv.getY(i) * (uvr[3] - uvr[1]));
    }
    uv.needsUpdate = true;
    return new THREE.Mesh(geo, this.dropMat);
  },
  // For items HELD by player: blocks stay as cubes, everything else uses a flat textured plane
  // shaped like the icon (Minecraft 2D-in-hand style). Tools/swords/shields/bows look like real tools.
  makeHeldMesh(id) {
    const d = defOf(id);
    if (!d) return this.makeItemMesh(id);
    // Blocks: solid cube (looks right in hand)
    if (d.isBlock) return this.makeItemMesh(id);
    // Non-block items: flat plane with item texture, double-sided
    const tile = d.tile;
    if (tile === undefined) return this.makeItemMesh(id);
    if (!this._heldPlaneMatCache) this._heldPlaneMatCache = new Map();
    let mat = this._heldPlaneMatCache.get(tile);
    if (!mat) {
      // Build a tiny canvas texture from the tile so each item gets a sharp 16x16
      const dataUrl = Tex.tileURL[tile];
      if (!dataUrl) return this.makeItemMesh(id);
      const img = new Image(); img.src = dataUrl;
      const tex = new THREE.CanvasTexture((function () {
        const cv = document.createElement('canvas');
        cv.width = 16; cv.height = 16;
        const c = cv.getContext('2d');
        const im = new Image(); im.src = dataUrl;
        im.onload = () => { c.drawImage(im, 0, 0); tex.needsUpdate = true; };
        return cv;
      })());
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
      this._heldPlaneMatCache.set(tile, mat);
    }
    // Plane sizes adapted to category
    let w = 0.5, h = 0.5;
    if (d.type === 'shield') { w = 0.7; h = 0.8; }
    else if (d.type === 'bow') { w = 0.7; h = 0.7; }
    else if (d.type === 'tool') { w = 0.6; h = 0.6; }
    else if (d.elytra) { w = 0.9; h = 0.6; }
    else if (d.type === 'armor') {
      if (d.slot === 'head') { w = 0.6; h = 0.5; }
      else if (d.slot === 'chest') { w = 0.7; h = 0.8; }
      else if (d.slot === 'legs') { w = 0.55; h = 0.75; }
      else if (d.slot === 'feet') { w = 0.6; h = 0.4; }
    }
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, mat);
    return m;
  }
};

/* ---------------- mob definitions ---------------- */
const MOB_TYPES = {
  pig: { hp: 10, hw: 0.42, h: 0.9, speed: 1.8, hostile: false, drops: [{ id: I.RAW_PORK, n: 3 }] },
  cow: { hp: 10, hw: 0.45, h: 1.3, speed: 1.7, hostile: false, drops: [{ id: I.RAW_BEEF, n: 3 }, { id: I.LEATHER, n: 2 }] },
  sheep: { hp: 8, hw: 0.45, h: 1.2, speed: 1.7, hostile: false, drops: [{ id: I.RAW_MUTTON, n: 2 }, { id: B.WOOL, n: 1 }] },
  chicken: { hp: 4, hw: 0.3, h: 0.7, speed: 1.7, hostile: false, drops: [{ id: I.RAW_CHICKEN, n: 1 }, { id: I.FEATHER, n: 2 }] },
  villager: { hp: 14, hw: 0.4, h: 1.8, speed: 1.4, hostile: false, drops: [{ id: I.APPLE, n: 1 }] },
  rabbit: { hp: 3, hw: 0.22, h: 0.5, speed: 2.6, hostile: false, drops: [{ id: I.RAW_CHICKEN, n: 1 }, { id: I.LEATHER, n: 1 }] },
  lizard: { hp: 6, hw: 0.3, h: 0.4, speed: 3.2, hostile: false, drops: [{ id: I.LEATHER, n: 1 }] },
  sloth: { hp: 14, hw: 0.45, h: 1.0, speed: 0.6, hostile: false, drops: [{ id: I.LEATHER, n: 2 }, { id: I.APPLE, n: 1 }] },
  fox: { hp: 10, hw: 0.35, h: 0.7, speed: 2.4, hostile: false, drops: [{ id: I.LEATHER, n: 1 }, { id: I.RAW_CHICKEN, n: 1 }] },
  wolf: { hp: 12, hw: 0.4, h: 0.9, speed: 2.5, hostile: false, drops: [{ id: I.RAW_BEEF, n: 1 }, { id: I.BONE, n: 1 }] },
  frog: { hp: 4, hw: 0.25, h: 0.4, speed: 2.0, hostile: false, drops: [{ id: I.STRING, n: 1 }] },
  warden: { hp: 100, hw: 0.7, h: 2.8, speed: 2.6, hostile: true, dmg: 12, detect: 30, drops: [{ id: I.ECHO_SHARD, n: 3 }] },
  zombie: { hp: 20, hw: 0.4, h: 1.85, speed: 2.0, hostile: true, dmg: 3, detect: 17, burn: true, drops: [{ id: I.IRON_INGOT, n: 1 }] },
  skeleton: { hp: 20, hw: 0.38, h: 1.85, speed: 2.1, hostile: true, dmg: 0, ranged: true, detect: 18, burn: true, drops: [{ id: I.BONE, n: 2 }, { id: I.ARROW, n: 2 }] },
  creeper: { hp: 20, hw: 0.4, h: 1.65, speed: 2.0, hostile: true, dmg: 0, explode: true, detect: 16, drops: [{ id: I.GUNPOWDER, n: 2 }] },
  spider: { hp: 16, hw: 0.6, h: 0.7, speed: 2.7, hostile: true, dmg: 2, detect: 16, climb: true, drops: [{ id: I.STRING, n: 2 }] },
  blaze: { hp: 14, hw: 0.35, h: 1.8, speed: 1.6, hostile: true, dmg: 0, ranged: true, detect: 20, fly: true, drops: [{ id: I.BLAZE_ROD, n: 1 }] },
  enderman: { hp: 40, hw: 0.4, h: 2.9, speed: 2.3, hostile: true, dmg: 5, detect: 18, teleport: true, drops: [{ id: I.ENDER_PEARL, n: 1 }] },
  ender_dragon: { hp: 200, hw: 1.8, h: 1.8, speed: 5, hostile: true, dmg: 8, detect: 60, fly: true, boss: true, drops: [{ id: B.DRAGON_EGG, n: 1 }] },
  end_crystal: { hp: 6, hw: 0.6, h: 1.4, speed: 0, hostile: false, stationary: true, drops: [] },
  shulker: { hp: 30, hw: 0.45, h: 1.0, speed: 0, hostile: true, stationary: true, dmg: 0, ranged: true, detect: 16, drops: [{ id: I.SHULKER_SHELL, n: 2 }] }
};

function _mat(hex) { return new THREE.MeshLambertMaterial({ color: hex }); }

class Mob {
  constructor(type, x, y, z, game) {
    this.type = type;
    this.cfg = MOB_TYPES[type];
    this.game = game;
    this.pos = { x: x, y: y, z: z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.kbx = 0; this.kbz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.moveYaw = this.yaw;
    this.hp = this.cfg.hp;
    this.onGround = false;
    this.dead = false;
    this.attackCD = 0;
    this.shootCD = 1 + Math.random();
    this.fuse = 1.5;
    this.flash = 0;
    this.fireTimer = 0;
    this._burnAcc = 0;
    this.levitationUntil = 0;
    this.wanderT = 0;
    this.fleeT = 0;
    this.action = 'idle';
    this.walkIntent = false;
    this.phase = 0;
    this.parts = [];
    this.legs = [];
    this.arms = [];
    this.group = new THREE.Group();
    this._build();
    game.scene.add(this.group);
  }

  _part(w, h, d, hex, px, py, pz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), _mat(hex));
    m.position.set(px, py, pz);
    m.userData.base = hex;
    this.parts.push(m);
    this.group.add(m);
    return m;
  }

  _build() {
    const t = this.type;
    if (t === 'pig') {
      // body
      this._part(0.62, 0.52, 0.92, 0xefa0a8, 0, 0.5, 0);
      // body dark patches
      this._part(0.42, 0.12, 0.36, 0xd07880, 0, 0.78, -0.1);
      // head
      this._part(0.46, 0.44, 0.42, 0xefa0a8, 0, 0.6, 0.6);
      // snout
      this._part(0.24, 0.18, 0.16, 0xd98088, 0, 0.54, 0.84);
      // nostrils
      this._part(0.04, 0.04, 0.02, 0x3a2424, -0.07, 0.54, 0.93);
      this._part(0.04, 0.04, 0.02, 0x3a2424, 0.07, 0.54, 0.93);
      // eyes
      this._part(0.06, 0.06, 0.04, 0x1a1a1a, -0.13, 0.72, 0.78);
      this._part(0.06, 0.06, 0.04, 0x1a1a1a, 0.13, 0.72, 0.78);
      // ears
      this._part(0.08, 0.1, 0.06, 0xd98088, -0.18, 0.84, 0.5);
      this._part(0.08, 0.1, 0.06, 0xd98088, 0.18, 0.84, 0.5);
      // curly tail
      this._part(0.06, 0.16, 0.06, 0xd98088, 0, 0.62, -0.5);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.18, 0.32, 0.18, 0xd98088, sx * 0.2, 0.16, sz * 0.32));
    } else if (t === 'cow') {
      // body brown
      this._part(0.66, 0.6, 1.0, 0x4a3526, 0, 0.72, 0);
      // white patches on body
      this._part(0.68, 0.22, 0.4, 0xeae0c8, 0, 0.86, -0.15);
      this._part(0.18, 0.22, 0.2, 0xeae0c8, 0.34, 0.6, 0.2);
      // head
      this._part(0.46, 0.46, 0.44, 0x6b5238, 0, 0.86, 0.66);
      // snout (lighter)
      this._part(0.32, 0.22, 0.12, 0xb89a70, 0, 0.78, 0.86);
      // nostrils
      this._part(0.04, 0.04, 0.02, 0x2a2018, -0.07, 0.76, 0.93);
      this._part(0.04, 0.04, 0.02, 0x2a2018, 0.07, 0.76, 0.93);
      // eyes
      this._part(0.06, 0.06, 0.04, 0x1a1a1a, -0.14, 0.96, 0.86);
      this._part(0.06, 0.06, 0.04, 0x1a1a1a, 0.14, 0.96, 0.86);
      // horns
      this._part(0.1, 0.16, 0.1, 0xeee0c0, -0.2, 1.1, 0.66);
      this._part(0.1, 0.16, 0.1, 0xeee0c0, 0.2, 1.1, 0.66);
      // ears
      this._part(0.1, 0.06, 0.1, 0x6b5238, -0.27, 0.98, 0.62);
      this._part(0.1, 0.06, 0.1, 0x6b5238, 0.27, 0.98, 0.62);
      // udder
      this._part(0.18, 0.12, 0.18, 0xefa0a8, 0, 0.42, -0.18);
      // tail
      this._part(0.08, 0.34, 0.08, 0x3a2a1c, 0, 0.78, -0.52);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.2, 0.44, 0.2, 0x3a2a1c, sx * 0.22, 0.22, sz * 0.34));
    } else if (t === 'sheep') {
      // fluffy wool body (multiple stacked cubes)
      this._part(0.84, 0.7, 1.04, 0xeeeeee, 0, 0.78, 0);
      this._part(0.66, 0.34, 0.4, 0xf4f4f4, 0, 1.1, -0.12);
      this._part(0.7, 0.36, 0.34, 0xf4f4f4, 0, 0.94, 0.3);
      this._part(0.5, 0.28, 0.34, 0xfafafa, 0, 1.18, 0.16);
      // head (skin)
      this._part(0.4, 0.4, 0.4, 0xe8d8c0, 0, 0.78, 0.62);
      // snout
      this._part(0.18, 0.12, 0.1, 0xd0c0a0, 0, 0.7, 0.84);
      // eyes
      this._part(0.05, 0.06, 0.04, 0x1a1a1a, -0.12, 0.86, 0.8);
      this._part(0.05, 0.06, 0.04, 0x1a1a1a, 0.12, 0.86, 0.8);
      // ears
      this._part(0.08, 0.06, 0.1, 0xd0c0a0, -0.22, 0.86, 0.58);
      this._part(0.08, 0.06, 0.1, 0xd0c0a0, 0.22, 0.86, 0.58);
      // tail
      this._part(0.16, 0.16, 0.12, 0xeeeeee, 0, 0.86, -0.5);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.18, 0.4, 0.18, 0x4a4038, sx * 0.22, 0.2, sz * 0.3));
    } else if (t === 'chicken') {
      // body
      this._part(0.34, 0.4, 0.42, 0xf2f2f2, 0, 0.4, 0);
      // wing details
      this._part(0.06, 0.26, 0.32, 0xdadada, -0.2, 0.42, 0.02);
      this._part(0.06, 0.26, 0.32, 0xdadada, 0.2, 0.42, 0.02);
      // tail feathers
      this._part(0.26, 0.22, 0.1, 0xf6f6f6, 0, 0.5, -0.24);
      // head
      this._part(0.24, 0.26, 0.24, 0xf6f6f6, 0, 0.62, 0.18);
      // beak
      this._part(0.1, 0.08, 0.14, 0xe8a020, 0, 0.6, 0.36);
      // eyes
      this._part(0.04, 0.06, 0.04, 0x1a1a1a, -0.08, 0.68, 0.28);
      this._part(0.04, 0.06, 0.04, 0x1a1a1a, 0.08, 0.68, 0.28);
      // comb (red crest)
      this._part(0.06, 0.12, 0.18, 0xd03030, 0, 0.78, 0.16);
      // wattle
      this._part(0.06, 0.08, 0.04, 0xd03030, 0, 0.5, 0.3);
      for (const [sx] of [[-1], [1]])
        this.legs.push(this._part(0.08, 0.22, 0.08, 0xe8a020, sx * 0.1, 0.11, 0));
    } else if (t === 'villager') {
      // robe body (brown)
      this._part(0.5, 0.94, 0.32, 0x5e4630, 0, 1.17, 0);
      // robe stripe
      this._part(0.52, 0.08, 0.34, 0x7a5a3c, 0, 1.0, 0);
      // head (tan)
      this._part(0.44, 0.44, 0.44, 0xc09078, 0, 1.78, 0);
      // signature unibrow
      this._part(0.32, 0.04, 0.02, 0x3a2418, 0, 1.94, 0.22);
      // big nose
      this._part(0.14, 0.22, 0.2, 0xa07050, 0, 1.74, 0.22);
      // eyes
      this._part(0.06, 0.06, 0.02, 0x1a1a1a, -0.12, 1.86, 0.22);
      this._part(0.06, 0.06, 0.02, 0x1a1a1a, 0.12, 1.86, 0.22);
      // beard line
      this._part(0.2, 0.06, 0.02, 0x3a2418, 0, 1.62, 0.22);
      // arms folded across stomach
      this.arms.push(this._part(0.18, 0.4, 0.5, 0x4a3424, -0.18, 1.3, 0.05));
      this.arms.push(this._part(0.18, 0.4, 0.5, 0x4a3424, 0.18, 1.3, 0.05));
      // legs
      this.legs.push(this._part(0.2, 0.6, 0.22, 0x3a2418, -0.12, 0.3, 0));
      this.legs.push(this._part(0.2, 0.6, 0.22, 0x3a2418, 0.12, 0.3, 0));
    } else if (t === 'zombie') {
      // torso (rotten cloth)
      this._part(0.5, 0.62, 0.28, 0x2c5a3a, 0, 1.18, 0);
      // torn shirt accents
      this._part(0.52, 0.08, 0.3, 0x1f4028, 0, 0.9, 0);
      // head
      this._part(0.42, 0.42, 0.42, 0x4a8a3a, 0, 1.7, 0);
      // glowing eyes
      this._part(0.08, 0.08, 0.02, 0x202020, -0.12, 1.74, 0.22);
      this._part(0.08, 0.08, 0.02, 0x202020, 0.12, 1.74, 0.22);
      // mouth
      this._part(0.22, 0.04, 0.02, 0x1a1a1a, 0, 1.58, 0.22);
      // teeth
      this._part(0.04, 0.06, 0.01, 0xeeeeee, -0.06, 1.6, 0.225);
      this._part(0.04, 0.06, 0.01, 0xeeeeee, 0.06, 1.6, 0.225);
      // arms stretched forward
      this.arms.push(this._part(0.18, 0.62, 0.22, 0x3a6a4a, -0.34, 1.42, 0.18));
      this.arms.push(this._part(0.18, 0.62, 0.22, 0x3a6a4a, 0.34, 1.42, 0.18));
      // hands
      this._part(0.16, 0.1, 0.16, 0x4a8a3a, -0.34, 1.14, 0.32);
      this._part(0.16, 0.1, 0.16, 0x4a8a3a, 0.34, 1.14, 0.32);
      this.legs.push(this._part(0.2, 0.6, 0.24, 0x33337a, -0.13, 0.3, 0));
      this.legs.push(this._part(0.2, 0.6, 0.24, 0x33337a, 0.13, 0.3, 0));
    } else if (t === 'skeleton') {
      // ribcage torso
      this._part(0.4, 0.62, 0.22, 0xdadada, 0, 1.18, 0);
      this._part(0.42, 0.06, 0.24, 0x9a9a9a, 0, 1.36, 0);
      this._part(0.42, 0.06, 0.24, 0x9a9a9a, 0, 1.16, 0);
      this._part(0.42, 0.06, 0.24, 0x9a9a9a, 0, 0.96, 0);
      // spine
      this._part(0.08, 0.5, 0.08, 0x9a9a9a, 0, 1.18, -0.08);
      // skull
      this._part(0.4, 0.4, 0.4, 0xeeeeee, 0, 1.68, 0);
      // eye sockets
      this._part(0.1, 0.08, 0.02, 0x000000, -0.1, 1.72, 0.22);
      this._part(0.1, 0.08, 0.02, 0x000000, 0.1, 1.72, 0.22);
      // teeth row
      this._part(0.18, 0.04, 0.02, 0x222222, 0, 1.58, 0.22);
      // nose hole
      this._part(0.04, 0.06, 0.02, 0x444444, 0, 1.66, 0.22);
      // bow-arms (one raised)
      this.arms.push(this._part(0.12, 0.6, 0.12, 0xcfcfcf, -0.28, 1.42, 0));
      this.arms.push(this._part(0.12, 0.6, 0.12, 0xcfcfcf, 0.28, 1.42, 0));
      this.legs.push(this._part(0.13, 0.6, 0.13, 0xcfcfcf, -0.12, 0.3, 0));
      this.legs.push(this._part(0.13, 0.6, 0.13, 0xcfcfcf, 0.12, 0.3, 0));
    } else if (t === 'creeper') {
      // tall body
      this._part(0.5, 0.78, 0.34, 0x4ca050, 0, 0.92, 0);
      // mossy patches
      this._part(0.52, 0.18, 0.36, 0x3f8c43, 0, 1.1, 0);
      this._part(0.4, 0.12, 0.36, 0x5fb058, 0, 0.7, 0);
      // head
      this._part(0.44, 0.44, 0.44, 0x57b45a, 0, 1.45, 0);
      // iconic creeper face: vertical eye slits
      this._part(0.1, 0.14, 0.02, 0x101010, -0.12, 1.48, 0.22);
      this._part(0.1, 0.14, 0.02, 0x101010, 0.12, 1.48, 0.22);
      // mouth — center square + 2 lower flanks
      this._part(0.1, 0.1, 0.02, 0x101010, 0, 1.36, 0.22);
      this._part(0.1, 0.1, 0.02, 0x101010, -0.12, 1.24, 0.22);
      this._part(0.1, 0.1, 0.02, 0x101010, 0.12, 1.24, 0.22);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.22, 0.3, 0.22, 0x3f8c43, sx * 0.16, 0.15, sz * 0.18));
    } else if (t === 'blaze') {
      // core body — orange glow
      this._part(0.45, 0.6, 0.45, 0xffa820, 0, 1.0, 0);
      // rotating rod cluster
      for (const [px, pz] of [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]]) {
        this._part(0.12, 0.5, 0.12, 0xffd24a, px, 1.0, pz);
      }
      for (const [px, py, pz] of [[0, 1.4, 0], [-0.2, 0.6, 0], [0.2, 0.6, 0]]) {
        this._part(0.12, 0.4, 0.12, 0xffd24a, px, py, pz);
      }
      // head
      this._part(0.4, 0.4, 0.4, 0xfff7a0, 0, 1.5, 0);
      // eyes (glowing)
      this._part(0.08, 0.08, 0.04, 0xff4020, -0.1, 1.55, 0.21);
      this._part(0.08, 0.08, 0.04, 0xff4020, 0.1, 1.55, 0.21);
    } else if (t === 'enderman') {
      // tall thin body
      this._part(0.36, 1.2, 0.32, 0x141022, 0, 1.4, 0);
      // long legs
      this.legs.push(this._part(0.18, 1.0, 0.2, 0x0a0816, -0.1, 0.5, 0));
      this.legs.push(this._part(0.18, 1.0, 0.2, 0x0a0816, 0.1, 0.5, 0));
      // long arms
      this.arms.push(this._part(0.16, 1.1, 0.18, 0x0a0816, -0.28, 1.5, 0));
      this.arms.push(this._part(0.16, 1.1, 0.18, 0x0a0816, 0.28, 1.5, 0));
      // head
      this._part(0.42, 0.42, 0.4, 0x141022, 0, 2.45, 0);
      // glowing purple eyes
      this._part(0.1, 0.06, 0.04, 0xb46cf0, -0.1, 2.5, 0.22);
      this._part(0.1, 0.06, 0.04, 0xb46cf0, 0.1, 2.5, 0.22);
      // jaw
      this._part(0.36, 0.08, 0.04, 0x080414, 0, 2.3, 0.22);
    } else if (t === 'ender_dragon') {
      // massive winged body — built as a flying boss
      // body
      this._part(2.4, 1.4, 4.0, 0x1a0a26, 0, 1.2, 0);
      // neck
      this._part(1.2, 1.0, 1.6, 0x1a0a26, 0, 1.6, 2.4);
      // head
      this._part(1.6, 1.0, 1.4, 0x2a1438, 0, 1.6, 3.7);
      // jaw
      this._part(1.4, 0.4, 1.2, 0x080412, 0, 1.2, 3.8);
      // glowing eyes
      this._part(0.3, 0.3, 0.1, 0xff20a0, -0.5, 1.95, 4.3);
      this._part(0.3, 0.3, 0.1, 0xff20a0, 0.5, 1.95, 4.3);
      // wings
      this._part(0.2, 0.3, 3.6, 0x2a1438, -1.6, 1.6, 0);
      this._part(0.2, 0.3, 3.6, 0x2a1438, 1.6, 1.6, 0);
      // wing membranes
      this._part(2.6, 0.06, 2.8, 0x140820, -1.6, 1.78, 0);
      this._part(2.6, 0.06, 2.8, 0x140820, 1.6, 1.78, 0);
      // tail
      this._part(1.0, 0.8, 2.0, 0x1a0a26, 0, 1.2, -2.4);
      this._part(0.6, 0.5, 1.4, 0x2a1438, 0, 1.2, -3.6);
      this._part(0.3, 0.3, 0.6, 0x2a1438, 0, 1.2, -4.4);
      // legs
      this.legs.push(this._part(0.4, 0.6, 0.4, 0x080412, -0.9, 0.5, 1.0));
      this.legs.push(this._part(0.4, 0.6, 0.4, 0x080412, 0.9, 0.5, 1.0));
      this.legs.push(this._part(0.5, 0.6, 0.5, 0x080412, -0.9, 0.5, -1.0));
      this.legs.push(this._part(0.5, 0.6, 0.5, 0x080412, 0.9, 0.5, -1.0));
    } else if (t === 'end_crystal') {
      // Pink/magenta crystal cube, rotates in air
      this._part(0.7, 0.7, 0.7, 0xff80ff, 0, 0.9, 0);
      // inner glow
      this._part(0.4, 0.4, 0.4, 0xffd0ff, 0, 0.9, 0);
      // floating ring beneath
      this._part(0.9, 0.05, 0.9, 0xa040c0, 0, 0.4, 0);
    } else if (t === 'rabbit') {
      // small fluffy body
      this._part(0.3, 0.3, 0.4, 0xd6c0a0, 0, 0.25, 0);
      this._part(0.28, 0.16, 0.16, 0xd6c0a0, 0, 0.45, 0.18);  // head
      this._part(0.06, 0.18, 0.04, 0xd6c0a0, -0.08, 0.62, 0.12);  // ear
      this._part(0.06, 0.18, 0.04, 0xd6c0a0, 0.08, 0.62, 0.12);   // ear
      this._part(0.04, 0.04, 0.02, 0x1a1a1a, -0.08, 0.46, 0.27);  // eye
      this._part(0.04, 0.04, 0.02, 0x1a1a1a, 0.08, 0.46, 0.27);   // eye
      this._part(0.08, 0.06, 0.04, 0xeeeeee, 0, 0.18, -0.22);     // fluffy tail
      for (const [sx, sz] of [[-1, 1], [1, 1]])
        this.legs.push(this._part(0.1, 0.14, 0.1, 0xb89880, sx * 0.1, 0.07, sz * 0.14));
      for (const [sx, sz] of [[-1, -1], [1, -1]])  // bigger hind legs
        this.legs.push(this._part(0.12, 0.22, 0.18, 0xb89880, sx * 0.1, 0.11, sz * 0.12));
    } else if (t === 'lizard') {
      // long thin body, low to ground
      this._part(0.4, 0.18, 0.7, 0x3a8a32, 0, 0.16, 0);   // body
      this._part(0.3, 0.16, 0.3, 0x4ea53a, 0, 0.18, 0.45); // head
      this._part(0.04, 0.04, 0.02, 0xffd24a, -0.1, 0.22, 0.58); // eye
      this._part(0.04, 0.04, 0.02, 0xffd24a, 0.1, 0.22, 0.58);  // eye
      // tongue
      this._part(0.04, 0.02, 0.08, 0xd84040, 0, 0.16, 0.62);
      // tail (3 segments tapering)
      this._part(0.18, 0.12, 0.3, 0x3a8a32, 0, 0.14, -0.5);
      this._part(0.12, 0.08, 0.25, 0x4ea53a, 0, 0.12, -0.78);
      this._part(0.06, 0.05, 0.2, 0x4ea53a, 0, 0.1, -1.0);
      // 4 splayed legs
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.08, 0.1, 0.08, 0x2c6a26, sx * 0.22, 0.05, sz * 0.22));
    } else if (t === 'sloth') {
      // round brown body
      this._part(0.7, 0.6, 0.5, 0x6e4a2c, 0, 0.6, 0);
      this._part(0.42, 0.4, 0.4, 0x8a6a40, 0, 1.0, 0);     // head
      // face mask (lighter)
      this._part(0.32, 0.16, 0.04, 0xc4a070, 0, 0.98, 0.21);
      this._part(0.06, 0.08, 0.04, 0x2a1a14, -0.1, 1.04, 0.21); // eye
      this._part(0.06, 0.08, 0.04, 0x2a1a14, 0.1, 1.04, 0.21);  // eye
      // dark stripes from eyes
      this._part(0.04, 0.12, 0.02, 0x2a1a14, -0.1, 0.92, 0.21);
      this._part(0.04, 0.12, 0.02, 0x2a1a14, 0.1, 0.92, 0.21);
      // smiley nose
      this._part(0.06, 0.04, 0.02, 0x1a1a1a, 0, 0.94, 0.22);
      // long arms (hanging)
      this.arms.push(this._part(0.16, 0.7, 0.18, 0x5a3a22, -0.36, 0.6, 0));
      this.arms.push(this._part(0.16, 0.7, 0.18, 0x5a3a22, 0.36, 0.6, 0));
      // claws
      this._part(0.18, 0.08, 0.2, 0x2a1a10, -0.36, 0.22, 0);
      this._part(0.18, 0.08, 0.2, 0x2a1a10, 0.36, 0.22, 0);
      // stubby legs
      for (const [sx] of [[-1], [1]])
        this.legs.push(this._part(0.14, 0.18, 0.18, 0x5a3a22, sx * 0.16, 0.09, -0.05));
    } else if (t === 'fox') {
      // body
      this._part(0.4, 0.32, 0.62, 0xd6824a, 0, 0.38, 0);
      // white belly
      this._part(0.42, 0.12, 0.5, 0xeeeeee, 0, 0.26, 0);
      // head (triangular look — bigger snout, smaller face)
      this._part(0.34, 0.28, 0.3, 0xd6824a, 0, 0.52, 0.4);
      this._part(0.18, 0.14, 0.16, 0xeeeeee, 0, 0.46, 0.55); // snout white
      this._part(0.06, 0.04, 0.04, 0x1a1a1a, 0, 0.5, 0.64);  // nose
      this._part(0.05, 0.06, 0.02, 0x1a1a1a, -0.09, 0.58, 0.52); // eye
      this._part(0.05, 0.06, 0.02, 0x1a1a1a, 0.09, 0.58, 0.52);  // eye
      // pointed ears
      this._part(0.06, 0.14, 0.06, 0xd6824a, -0.13, 0.7, 0.36);
      this._part(0.06, 0.14, 0.06, 0xd6824a, 0.13, 0.7, 0.36);
      // bushy tail (multi-segment with white tip)
      this._part(0.18, 0.2, 0.28, 0xd6824a, 0, 0.38, -0.42);
      this._part(0.14, 0.16, 0.18, 0xeeeeee, 0, 0.42, -0.62);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.1, 0.22, 0.1, 0x3a2418, sx * 0.13, 0.11, sz * 0.2));
    } else if (t === 'wolf') {
      // body grey
      this._part(0.42, 0.36, 0.66, 0xa0a0a0, 0, 0.5, 0);
      this._part(0.44, 0.12, 0.5, 0xeeeeee, 0, 0.34, 0);   // light belly
      // head
      this._part(0.38, 0.34, 0.32, 0xa0a0a0, 0, 0.66, 0.42);
      this._part(0.2, 0.18, 0.18, 0xc0c0c0, 0, 0.6, 0.58);  // snout
      this._part(0.06, 0.04, 0.04, 0x1a1a1a, 0, 0.64, 0.68); // nose
      this._part(0.05, 0.06, 0.02, 0xd03030, -0.1, 0.72, 0.54); // angry red eye
      this._part(0.05, 0.06, 0.02, 0xd03030, 0.1, 0.72, 0.54);  // angry red eye
      // ears triangular
      this._part(0.08, 0.14, 0.06, 0xa0a0a0, -0.14, 0.84, 0.36);
      this._part(0.08, 0.14, 0.06, 0xa0a0a0, 0.14, 0.84, 0.36);
      // teeth
      this._part(0.04, 0.04, 0.02, 0xeeeeee, -0.06, 0.54, 0.66);
      this._part(0.04, 0.04, 0.02, 0xeeeeee, 0.06, 0.54, 0.66);
      // bushy tail
      this._part(0.14, 0.18, 0.28, 0xa0a0a0, 0, 0.62, -0.42);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        this.legs.push(this._part(0.12, 0.32, 0.12, 0x707070, sx * 0.14, 0.16, sz * 0.22));
    } else if (t === 'frog') {
      // squat green body
      this._part(0.4, 0.22, 0.42, 0x6abf5a, 0, 0.2, 0);
      // domed back stripes
      this._part(0.04, 0.06, 0.34, 0x4a9c3a, -0.12, 0.34, 0);
      this._part(0.04, 0.06, 0.34, 0x4a9c3a, 0.12, 0.34, 0);
      // big bulgy eyes
      this._part(0.14, 0.14, 0.14, 0xfff7a0, -0.1, 0.4, 0.18);
      this._part(0.14, 0.14, 0.14, 0xfff7a0, 0.1, 0.4, 0.18);
      this._part(0.06, 0.06, 0.02, 0x1a1a1a, -0.1, 0.4, 0.25); // pupil
      this._part(0.06, 0.06, 0.02, 0x1a1a1a, 0.1, 0.4, 0.25);  // pupil
      // wide mouth
      this._part(0.3, 0.04, 0.04, 0x2a4a20, 0, 0.18, 0.22);
      // legs (powerful jumpers)
      for (const [sx, sz] of [[-1, 1], [1, 1]])
        this.legs.push(this._part(0.08, 0.1, 0.08, 0x4a9c3a, sx * 0.12, 0.06, sz * 0.16));
      for (const [sx, sz] of [[-1, -1], [1, -1]])
        this.legs.push(this._part(0.12, 0.2, 0.2, 0x4a9c3a, sx * 0.13, 0.1, sz * 0.16));
    } else if (t === 'warden') {
      // Dark monolithic body with bioluminescent cyan accents
      this._part(1.1, 1.8, 0.7, 0x141822, 0, 1.5, 0);     // torso
      this._part(0.8, 0.7, 0.6, 0x1a1f2e, 0, 2.65, 0);    // head
      // Big glowing antenna/horns
      this._part(0.14, 0.6, 0.14, 0x5af0ff, -0.32, 3.2, 0);
      this._part(0.14, 0.6, 0.14, 0x5af0ff, 0.32, 3.2, 0);
      _p_glow_eyes:
      // No eyes — sensory ridge
      this._part(0.5, 0.06, 0.04, 0x5af0ff, 0, 2.7, 0.31);
      // Chest sculk veins (glowing patches)
      this._part(0.12, 0.16, 0.04, 0x5af0ff, -0.3, 1.8, 0.36);
      this._part(0.12, 0.16, 0.04, 0x5af0ff, 0.3, 1.8, 0.36);
      this._part(0.16, 0.2, 0.04, 0x5af0ff, 0, 1.4, 0.36);
      // Huge arms (longer than torso)
      this.arms.push(this._part(0.32, 1.6, 0.32, 0x141822, -0.66, 1.5, 0));
      this.arms.push(this._part(0.32, 1.6, 0.32, 0x141822, 0.66, 1.5, 0));
      // Massive clawed hands
      this._part(0.4, 0.3, 0.4, 0x0a0a14, -0.66, 0.55, 0);
      this._part(0.4, 0.3, 0.4, 0x0a0a14, 0.66, 0.55, 0);
      // Legs
      this.legs.push(this._part(0.4, 0.7, 0.4, 0x141822, -0.25, 0.35, 0));
      this.legs.push(this._part(0.4, 0.7, 0.4, 0x141822, 0.25, 0.35, 0));
    } else if (t === 'shulker') {
      // Box-shaped purple shell with a small yellow head poking up
      this._part(0.9, 0.9, 0.9, 0x6a4a82, 0, 0.5, 0);      // bottom shell box
      this._part(0.84, 0.16, 0.84, 0x3a2452, 0, 0.96, 0);   // shell lid lip
      this._part(0.5, 0.4, 0.5, 0xd2b870, 0, 1.2, 0);       // head poking out
      this._part(0.08, 0.08, 0.04, 0x1a1a1a, -0.12, 1.28, 0.25); // eye L
      this._part(0.08, 0.08, 0.04, 0x1a1a1a, 0.12, 1.28, 0.25);  // eye R
      // shell pattern accents
      this._part(0.06, 0.06, 0.92, 0x4a3068, -0.42, 0.5, 0);
      this._part(0.06, 0.06, 0.92, 0x4a3068, 0.42, 0.5, 0);
      this._part(0.92, 0.06, 0.06, 0x4a3068, 0, 0.5, -0.42);
      this._part(0.92, 0.06, 0.06, 0x4a3068, 0, 0.5, 0.42);
    } else if (t === 'spider') {
      // abdomen
      this._part(0.7, 0.4, 0.8, 0x2a2230, 0, 0.42, -0.1);
      // bristle dots on abdomen
      this._part(0.06, 0.06, 0.06, 0x1a1422, -0.2, 0.5, -0.2);
      this._part(0.06, 0.06, 0.06, 0x1a1422, 0.2, 0.5, -0.2);
      this._part(0.06, 0.06, 0.06, 0x1a1422, 0, 0.58, -0.3);
      // head
      this._part(0.44, 0.38, 0.42, 0x352b3c, 0, 0.46, 0.5);
      // 4 main red eyes
      this._part(0.08, 0.08, 0.02, 0xd03030, -0.13, 0.56, 0.7);
      this._part(0.08, 0.08, 0.02, 0xd03030, 0.13, 0.56, 0.7);
      this._part(0.06, 0.06, 0.02, 0xd03030, -0.18, 0.46, 0.7);
      this._part(0.06, 0.06, 0.02, 0xd03030, 0.18, 0.46, 0.7);
      // 4 smaller eyes
      this._part(0.04, 0.04, 0.02, 0x8a1818, -0.06, 0.48, 0.72);
      this._part(0.04, 0.04, 0.02, 0x8a1818, 0.06, 0.48, 0.72);
      this._part(0.04, 0.04, 0.02, 0x8a1818, -0.06, 0.36, 0.72);
      this._part(0.04, 0.04, 0.02, 0x8a1818, 0.06, 0.36, 0.72);
      // fangs
      this._part(0.06, 0.08, 0.04, 0xeeeeee, -0.06, 0.3, 0.72);
      this._part(0.06, 0.08, 0.04, 0xeeeeee, 0.06, 0.3, 0.72);
      for (let i = 0; i < 4; i++) {
        const z = -0.25 + i * 0.18;
        this.legs.push(this._part(0.7, 0.08, 0.08, 0x1c1622, -0.5, 0.4, z));
        this.legs.push(this._part(0.7, 0.08, 0.08, 0x1c1622, 0.5, 0.4, z));
      }
    }
  }

  takeDamage(dmg, kx, kz, game) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.18;
    for (const p of this.parts) p.material.color.setHex(0xff5050);
    const L = Math.hypot(kx, kz) || 1;
    this.kbx += (kx / L) * 6; this.kbz += (kz / L) * 6;
    this.vel.y = Math.max(this.vel.y, 5);
    if (!this.cfg.hostile) { this.fleeT = 6; }
    // Endermen teleport when hurt
    if (this.cfg.teleport && this.hp > 0) this._teleportRandom(game);
    if (this.hp <= 0) this.die(game);
  }

  // Tuliaspekti / liekki: sytytä mobi palamaan annetuksi ajaksi (sekunteina)
  ignite(seconds) {
    if (this.dead) return;
    this.fireTimer = Math.max(this.fireTimer, seconds);
  }

  // Leijunta (shulker-kilven efekti): mobi nousee ylös annetuksi ajaksi
  levitate(seconds) {
    if (this.dead) return;
    this.levitationUntil = Math.max(this.levitationUntil || 0, Date.now() + seconds * 1000);
  }

  // Näytä/piilota liekit palavan mobin ympärillä
  _showFlames(on) {
    if (on) {
      if (!this._flames) {
        this._flames = [];
        const h = this.cfg.h || 1.5, hw = this.cfg.hw || 0.4;
        const spots = [[0, 0], [hw * 0.7, hw * 0.5], [-hw * 0.6, -hw * 0.5], [hw * 0.5, -hw * 0.6]];
        for (let i = 0; i < spots.length; i++) {
          const m = new THREE.Mesh(Entities.fireGeo, i % 2 ? Entities.fireMatB : Entities.fireMatA);
          m.position.set(spots[i][0], 0.25 + (i % 2) * 0.35, spots[i][1]);
          m.userData.baseY = m.position.y;
          this.group.add(m);
          this._flames.push(m);
        }
      }
      // välkyntä: satunnainen skaalaus
      for (const m of this._flames) {
        const s = 0.7 + Math.random() * 0.6;
        m.scale.set(1, s, 1);
        m.position.y = m.userData.baseY + (s - 1) * 0.2;
      }
    } else if (this._flames) {
      for (const m of this._flames) this.group.remove(m);
      this._flames = null;
    }
  }

  _teleportRandom(game) {
    const r = 8 + Math.random() * 6;
    const ang = Math.random() * Math.PI * 2;
    const nx = this.pos.x + Math.cos(ang) * r;
    const nz = this.pos.z + Math.sin(ang) * r;
    // find ground at new position
    for (let y = Math.floor(this.pos.y) + 5; y > 4; y--) {
      if (isSolid(game.world.getBlock(Math.floor(nx), y, Math.floor(nz)))) {
        const above1 = game.world.getBlock(Math.floor(nx), y + 1, Math.floor(nz));
        const above2 = game.world.getBlock(Math.floor(nx), y + 2, Math.floor(nz));
        if (above1 === B.AIR && above2 === B.AIR) {
          this.pos.x = nx; this.pos.y = y + 1; this.pos.z = nz;
          this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
          return;
        }
      }
    }
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    // Looting bonus from sword held by player
    const heldByPlayer = game.player.currentItem();
    const looting = enchantLevel(heldByPlayer, 'looting');
    // Jos eläin kuolee palaessaan → raaka liha paistuu valmiiksi
    const onFire = this.fireTimer > 0;
    const COOKED = {
      [I.RAW_PORK]: I.COOKED_PORK, [I.RAW_BEEF]: I.COOKED_BEEF,
      [I.RAW_CHICKEN]: I.COOKED_CHICKEN, [I.RAW_MUTTON]: I.COOKED_MUTTON,
      [I.RAW_FISH]: I.COOKED_FISH
    };
    for (const d of this.cfg.drops) {
      const n = (typeof d.n === 'number') ? d.n : d.n;
      let count = 1 + Math.floor(Math.random() * Math.max(1, n));
      if (looting > 0) count += Math.floor(Math.random() * (looting + 1));
      if (Math.random() < 0.85 || d.id === this.cfg.drops[0].id) {
        const dropId = (onFire && COOKED[d.id] !== undefined) ? COOKED[d.id] : d.id;
        game.spawnDrop(dropId, count, this.pos.x, this.pos.y + 0.4, this.pos.z);
      }
    }
    // XP drop: 1-3 for normal mobs, 5-7 for hostile, 50+ for boss
    if (this.cfg.hostile) {
      const xp = (this.type === 'ender_dragon') ? 100 : (5 + Math.floor(Math.random() * 3));
      game.player.addXP(xp);
    } else {
      game.player.addXP(1 + Math.floor(Math.random() * 3));
    }
    game.scene.remove(this.group);
    for (const p of this.parts) p.geometry.dispose();
    // Boss kill → victory
    if (this.cfg.boss && game.onBossDefeated) game.onBossDefeated(this);
  }

  _exposed(world) {
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y + this.cfg.h) + 1; y < WORLD_H; y++)
      if (isOpaqueCube(world.getBlock(x, y, z))) return false;
    return true;
  }

  // Line-of-sight from mob's eye to player's eye — blocked by any opaque cube
  _canSeePlayer(world, player) {
    const ox = this.pos.x, oy = this.pos.y + this.cfg.h * 0.85, oz = this.pos.z;
    const tx = player.pos.x, ty = player.pos.y + player.eye, tz = player.pos.z;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.4) return true;
    const step = 0.25;
    const n = Math.ceil(len / step);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = Math.floor(ox + dx * t);
      const y = Math.floor(oy + dy * t);
      const z = Math.floor(oz + dz * t);
      if (isOpaqueCube(world.getBlock(x, y, z))) return false;
    }
    return true;
  }

  // True only when mob's bounding box overlaps the player's (actual touch)
  _isTouchingPlayer(player) {
    const hd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (hd > this.cfg.hw + player.hw + 0.18) return false;
    if (player.pos.y > this.pos.y + this.cfg.h + 0.15) return false;
    if (player.pos.y + player.height + 0.15 < this.pos.y) return false;
    return true;
  }

  _wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1.5 + Math.random() * 3.5;
      this.action = Math.random() < 0.55 ? 'walk' : 'idle';
      if (Math.random() < 0.7) this.yaw = Math.random() * Math.PI * 2;
    }
    this.moveYaw = this.yaw;
    this.walkIntent = this.action === 'walk';
    this.spd = this.cfg.speed;
  }

  update(dt, game) {
    if (this.dead) return;
    const world = game.world, player = game.player;
    this.attackCD = Math.max(0, this.attackCD - dt);
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) for (const p of this.parts) p.material.color.setHex(this.fireTimer > 0 ? 0xff7820 : p.userData.base);
    }
    // Tuliaspekti / liekki: vahinko ajan myötä + hehkuva oranssi ulkoasu + liekit
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      this._burnAcc += dt;
      while (this._burnAcc >= 0.5) {
        this._burnAcc -= 0.5;
        this.hp -= 1;
        if (this.hp <= 0) { this.die(game); return; }
      }
      if (this.flash <= 0) {
        const hex = this.fireTimer > 0 ? 0xff7820 : null;
        for (const p of this.parts) p.material.color.setHex(hex !== null ? hex : p.userData.base);
      }
      this._showFlames(true);
    } else {
      this._showFlames(false);
    }
    // Stationary entities (e.g. end_crystal, shulker): no movement, just animate + accept damage
    if (this.cfg.stationary) {
      if (this.type === 'shulker') {
        // Track player, lob shulker bullets occasionally
        const sdx = player.pos.x - this.pos.x, sdz = player.pos.z - this.pos.z;
        const sdy = player.pos.y - this.pos.y;
        const sdist = Math.hypot(sdx, sdy, sdz);
        if (this.cfg.hostile && this.cfg.ranged && sdist < this.cfg.detect && player.alive) {
          this.yaw = Math.atan2(sdx, sdz);
          this.shootCD -= dt;
          if (this.shootCD <= 0 && this._canSeePlayer(world, player)) {
            const L = sdist || 1;
            // Shulker-ammus: vähän vahinkoa + 5 s leijunta
            game.spawnArrow(this.pos.x, this.pos.y + 0.9, this.pos.z,
              sdx / L * 14, (sdy + 0.6) / L * 14 + 3, sdz / L * 14, 'mob', 2, 0, true);
            this.shootCD = 2.5 + Math.random();
          }
        }
        this.group.rotation.y = this.yaw;
      } else {
        this.group.rotation.y += dt * 1.5;
      }
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      return;
    }
    // Dragon: heal while any end_crystal is alive
    if (this.type === 'ender_dragon' && this.hp < this.cfg.hp) {
      for (const m of game.mobs) {
        if (m.dead || m === this) continue;
        if (m.type === 'end_crystal') {
          this.hp = Math.min(this.cfg.hp, this.hp + 4 * dt);
          break;
        }
      }
    }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    if (this.cfg.hostile) {
      this.yaw = Math.atan2(dx, dz);
      if (this.cfg.burn && game.isDaylight() && this._exposed(world) && this.flash <= 0) {
        this.hp -= dt * 3.5;
        if (this.hp <= 0) { this.die(game); return; }
      }
      const sees = dist < this.cfg.detect && player.alive && this._canSeePlayer(world, player);
      if (sees) {
        if (this.cfg.ranged) {
          this.moveYaw = dist > 9 ? this.yaw : (dist < 5 ? this.yaw + Math.PI : this.yaw);
          this.walkIntent = dist > 9 || dist < 5;
          this.shootCD -= dt;
          if (this.shootCD <= 0 && dist < 18) {
            const L = Math.hypot(dx, dz, player.pos.y - this.pos.y) || 1;
            game.spawnArrow(this.pos.x, this.pos.y + 1.4, this.pos.z,
              dx / L * 22, (player.pos.y + 0.9 - (this.pos.y + 1.4)) / L * 22 + 4, dz / L * 22, 'mob');
            this.shootCD = 1.9;
          }
        } else if (this.cfg.explode) {
          this.moveYaw = this.yaw;
          this.walkIntent = !this._isTouchingPlayer(player);
          if (this._isTouchingPlayer(player)) {
            this.fuse -= dt;
            for (const p of this.parts) p.material.color.setHex(((Date.now() / 90) | 0) % 2 ? 0xffffff : p.userData.base);
            if (this.fuse <= 0) { game.explode(this.pos.x, this.pos.y + 0.6, this.pos.z, 3.4); this.dead = true; game.scene.remove(this.group); return; }
          } else { this.fuse = 1.5; }
        } else {
          this.moveYaw = this.yaw;
          this.walkIntent = !this._isTouchingPlayer(player);
          if (this._isTouchingPlayer(player) && this.attackCD <= 0) {
            const mobNames = { zombie: 'Zombie', skeleton: 'Luuranko', spider: 'Hämähäkki', creeper: 'Creeper', enderman: 'Endermies', blaze: 'Liekkimies' };
            game.hurtPlayer(this.cfg.dmg, this.pos.x, this.pos.z, mobNames[this.type] || this.type, this);
            this.attackCD = 1.0;
          }
        }
        this.spd = this.cfg.speed;
      } else {
        this._wander(dt);
      }
    } else {
      if (this.fleeT > 0) {
        this.fleeT -= dt;
        this.yaw = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
        this.moveYaw = this.yaw;
        this.walkIntent = true;
        this.spd = this.cfg.speed * 1.7;
      } else {
        this._wander(dt);
      }
    }

    // physics
    if (this.levitationUntil && this.levitationUntil > Date.now() && !this.cfg.fly) {
      // Leijunta (shulker-kilven efekti): mobi nousee ylöspäin
      this.vel.y = 3.0;
    } else if (!this.cfg.fly) {
      this.vel.y -= 26 * dt;
      if (this.type === 'chicken' && this.vel.y < -4) this.vel.y = -4;
      const inWater = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.cfg.h * 0.4), Math.floor(this.pos.z)) === B.WATER;
      if (inWater) { this.vel.y += 32 * dt; if (this.vel.y > 4) this.vel.y = 4; }
    } else {
      // Flying mobs hover. Boss dives in a wave pattern; others maintain altitude above ground.
      this.phase += dt * 1.2;
      if (this.type === 'ender_dragon') {
        // swoop: alternate between high (out of reach) and low (dive to bite player)
        const swoop = Math.sin(this.phase * 0.5);
        const targetY = player.pos.y + (swoop > 0 ? 2 + swoop * 6 : swoop * 2 + 1);
        const clamped = Math.max(44, targetY);
        const dy = clamped - this.pos.y;
        this.vel.y = clamp(dy * 1.5, -10, 10);
      } else {
        // hover at player level if visible/close, else just drift
        const targetY = player.pos.y + 1.5;
        const dy = targetY - this.pos.y;
        this.vel.y = clamp(dy * 0.6, -3, 3);
      }
    }

    let mvx = 0, mvz = 0;
    if (this.walkIntent) {
      const s = this.spd || this.cfg.speed;
      mvx = Math.sin(this.moveYaw) * s;
      mvz = Math.cos(this.moveYaw) * s;
    }
    this.vel.x = mvx + this.kbx;
    this.vel.z = mvz + this.kbz;
    this.kbx *= 0.85; this.kbz *= 0.85;

    const res = moveAndCollide(world, this.pos, this.vel, this.cfg.hw, this.cfg.h, dt);
    this.onGround = res.onGround;
    if ((res.hitX || res.hitZ) && this.onGround && this.walkIntent) this.vel.y = 8.2;
    if (this.cfg.climb && (res.hitX || res.hitZ)) this.vel.y = Math.max(this.vel.y, 3.2);

    if (this.pos.y < -10) { this.dead = true; game.scene.remove(this.group); return; }

    // model
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    const moving = this.walkIntent && this.onGround;
    if (moving) this.phase += dt * 9;
    const swing = moving ? Math.sin(this.phase) * 0.7 : 0;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = swing * ((i % 2) ? 1 : -1);
    }
    for (let i = 0; i < this.arms.length; i++) {
      this.arms[i].rotation.x = swing * ((i % 2) ? -1 : 1);
    }
  }
}

/* ---------------- dropped item ---------------- */
class DroppedItem {
  constructor(id, count, x, y, z, game) {
    this.id = id; this.count = count;
    this.pos = { x, y, z };
    this.vel = { x: (Math.random() - 0.5) * 2, y: 3, z: (Math.random() - 0.5) * 2 };
    this.dead = false;
    this.pickupDelay = 0.6;
    this.life = 240;
    this.mesh = Entities.makeItemMesh(id);
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    this.pickupDelay -= dt;
    if (this.life <= 0) { this.dead = true; game.scene.remove(this.mesh); this.mesh.geometry.dispose(); return; }
    this.vel.y -= 22 * dt;
    moveAndCollide(game.world, this.pos, this.vel, 0.15, 0.3, dt);
    this.vel.x *= 0.7; this.vel.z *= 0.7;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.2 + Math.sin(this.life * 3) * 0.06, this.pos.z);
    this.mesh.rotation.y += dt * 1.6;
    if (this.pickupDelay <= 0 && game.player.alive) {
      const p = game.player.pos;
      if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z) < 1.7) {
        if (this.data) {
          // Erikoisdata (esim. shulker-laatikon sisältö) — sijoitetaan kokonaisena stackina
          const stack = Object.assign({ id: this.id, count: this.count }, this.data);
          if (game.player.giveStack(stack)) { this.dead = true; game.scene.remove(this.mesh); this.mesh.geometry.dispose(); game.ui.refresh(); }
          return;
        }
        const left = game.player.give(this.id, this.count);
        if (left <= 0) { this.dead = true; game.scene.remove(this.mesh); this.mesh.geometry.dispose(); game.ui.refresh(); }
        else { this.count = left; }
      }
    }
  }
}

/* ---------------- arrow ---------------- */
/* ---------------- Eye of Ender (thrown locator) ---------------- */
class EyeOfEnder {
  constructor(x, y, z, target, game, opts) {
    this.pos = { x, y, z };
    this.target = target; // { x, y, z } target position
    this.life = 7;
    this.dead = false;
    const isSkulk = opts && opts.skulk;
    this.dropItemId = isSkulk ? I.EYE_OF_SCULK : I.EYE_OF_ENDER;
    const col = isSkulk ? 0x1ad0ee : 0xb4ff5a;
    const glowCol = isSkulk ? 0x0a90b0 : 0x7eb04a;
    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: col });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
    // glow trail
    this.glowGeo = new THREE.SphereGeometry(0.32, 8, 8);
    this.glowMat = new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.45 });
    this.glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    game.scene.add(this.glow);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this._die(game, true); return; }
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const horizDist = Math.hypot(dx, dz);
    const speed = 16;
    if (horizDist > 2.5) {
      // fly toward stronghold horizontally, hover at safe altitude
      const yTarget = Math.max(this.pos.y, game.player.pos.y + 8);
      const dy = yTarget - this.pos.y;
      const norm = horizDist || 1;
      this.pos.x += (dx / norm) * speed * dt;
      this.pos.z += (dz / norm) * speed * dt;
      this.pos.y += clamp(dy, -2 * dt, 2 * dt);
    } else {
      // above the stronghold — descend straight down
      this.pos.y -= 14 * dt;
    }
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.glow.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (this.pos.y < 1) this._die(game, true);
  }
  _die(game, dropItem) {
    if (this.dead) return;
    this.dead = true;
    game.scene.remove(this.mesh); this.mesh.geometry.dispose();
    game.scene.remove(this.glow); this.glow.geometry.dispose();
    // Eye of Ender: 50% returns. Eye of Sculk: always returns.
    const isSkulk = (this.dropItemId === I.EYE_OF_SCULK);
    if (dropItem && (isSkulk || Math.random() < 0.5)) {
      game.spawnDrop(this.dropItemId, 1, this.pos.x, Math.max(2, this.pos.y), this.pos.z);
    }
  }
}

/* ---------------- Ender Pearl (thrown teleporter) ---------------- */
class EnderPearl {
  constructor(x, y, z, vx, vy, vz, game) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.dead = false;
    this.life = 8;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xc3ffd0 })
    );
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this._kill(game); return; }
    this.vel.y -= 14 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    // Voidiin tippuessa pearl menee läpi eikä teleportoi
    if (this.pos.y < 0) { this._kill(game); return; }
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y), bz = Math.floor(this.pos.z);
    const bid = game.world.getBlock(bx, by, bz);
    if (isSolid(bid)) {
      this._teleport(game, bx, by, bz);
      this._kill(game);
      return;
    }
  }
  _teleport(game, bx, by, bz) {
    const p = game.player;
    // Etsi 2-blokin korkuinen ilmatila osumakohdan päältä
    let ty = by + 1;
    for (let i = 0; i < 200; i++) {
      const a = game.world.getBlock(bx, ty, bz);
      const b = game.world.getBlock(bx, ty + 1, bz);
      if (!isSolid(a) && !isSolid(b)) break;
      ty++;
    }
    p.pos.x = bx + 0.5;
    p.pos.y = ty;
    p.pos.z = bz + 0.5;
    p.vel.x = 0; p.vel.y = 0; p.vel.z = 0;
    p.peakY = ty;
    if (typeof Music !== 'undefined') Music.sfx('place');
  }
  _kill(game) {
    if (this.dead) return;
    this.dead = true;
    game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

/* ---------------- Warden Sonic Beam ---------------- */
class WardenBeam {
  constructor(x, y, z, vx, vy, vz, owner, game, opts) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.owner = owner;
    this.dead = false;
    this.life = 2.0;
    opts = opts || {};
    this.dmg = opts.dmg || 40;
    this.drillR = opts.drillR || 2;
    this.kbMul = opts.kbMul || 1;
    this.pierce = opts.pierce || 0;     // remaining pass-throughs allowed
    this.fire = opts.fire || 0;         // Tuliaspekti-taso: > 0 sytyttää osuman palamaan
    this.hitMobs = new Set();           // mobs already damaged (prevents double-hit while piercing)
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5af0ff, transparent: true, opacity: 0.8 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
    // Glow halo
    const glowGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8);
    glowGeo.rotateX(Math.PI / 2);
    this.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xa0ffff, transparent: true, opacity: 0.35 }));
    this.glow.position.set(x, y, z);
    game.scene.add(this.glow);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this._kill(game); return; }
    // No gravity — straight line, fast
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.glow.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    this.glow.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    // Hit check on mobs
    if (this.owner === 'player') {
      for (const m of game.mobs) {
        if (m.dead || this.hitMobs.has(m)) continue;
        if (Math.hypot(m.pos.x - this.pos.x, m.pos.y + m.cfg.h * 0.5 - this.pos.y, m.pos.z - this.pos.z) < m.cfg.hw + 0.8) {
          // Apply knockback-multiplied direction
          m.takeDamage(this.dmg, this.vel.x * this.kbMul, this.vel.z * this.kbMul, game);
          if (this.fire > 0) m.ignite(this.fire * 3 + 1);
          this.hitMobs.add(m);
          if (this.pierce > 0) { this.pierce--; }
          else { this._kill(game); return; }
        }
      }
    }
    // Hit block: drill a configurable spherical hole
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y), bz = Math.floor(this.pos.z);
    if (isSolid(game.world.getBlock(bx, by, bz))) {
      const R = this.drillR;
      let sculkHit = 0;
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dy * dy + dz * dz > R * R) continue;
        const id = game.world.getBlock(bx + dx, by + dy, bz + dz);
        if (id !== B.AIR && id !== B.BEDROCK && id !== B.WATER) {
          if (id === B.SCULK) sculkHit++;
          game.world.setBlock(bx + dx, by + dy, bz + dz, B.AIR);
          if (game.mp && game.mp.worldId) game._mpSend({ type: 'edit', x: bx + dx, y: by + dy, z: bz + dz, b: B.AIR, d: game.dimension });
        }
      }
      // Säde palauttaa panokset suoraan reppuun jokaisesta tuhotusta sculk-lohkosta
      if (sculkHit > 0 && this.owner === 'player') {
        const ammo = sculkHit * 5;
        const leftover = game.player.give(I.SCULK_AMMO, ammo);
        if (leftover > 0) game.spawnDrop(I.SCULK_AMMO, leftover, bx + 0.5, by + 0.5, bz + 0.5);
        if (typeof UI !== 'undefined') UI.refresh();
      }
      this._kill(game); return;
    }
  }
  _kill(game) {
    if (this.dead) return;
    this.dead = true;
    game.scene.remove(this.mesh); this.mesh.geometry.dispose();
    game.scene.remove(this.glow); this.glow.geometry.dispose();
  }
}

class Arrow {
  constructor(x, y, z, vx, vy, vz, owner, game, dmg, fire, levitate) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.owner = owner;
    this.dmg = (typeof dmg === 'number') ? dmg : 5;
    this.fire = fire || 0;            // Tuliaspekti-taso: > 0 sytyttää osuman palamaan
    this.levitate = levitate || 0;    // shulker-ammus: sytyttää leijunnan osumasta
    this.dead = false;
    this.life = 8;
    this.stuck = false;
    this._ownMat = this.fire > 0 ? new THREE.MeshBasicMaterial({ color: 0xff7820 }) : null;
    this.mesh = new THREE.Mesh(Entities.arrowGeo, this._ownMat || Entities.arrowMat);
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this._kill(game); return; }
    if (!this.stuck) {
      this.vel.y -= 20 * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.pos.z += this.vel.z * dt;
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
      if (isSolid(game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)))) {
        this.stuck = true; this.life = Math.min(this.life, 3);
        return;
      }
      if (this.owner === 'player') {
        for (const m of game.mobs) {
          if (m.dead) continue;
          if (Math.hypot(m.pos.x - this.pos.x, m.pos.y + m.cfg.h * 0.5 - this.pos.y, m.pos.z - this.pos.z) < m.cfg.hw + 0.5) {
            m.takeDamage(this.dmg, this.vel.x, this.vel.z, game);
            if (this.fire > 0) m.ignite(this.fire * 3 + 1);
            this._kill(game); return;
          }
        }
      } else {
        const p = game.player;
        if (p.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.y + 0.9 - this.pos.y, p.pos.z - this.pos.z) < 0.7) {
          // Shield deflection: bounce arrow back
          const defl = game._shieldDeflection();
          if (defl > 0) {
            const damping = 0.5 + defl * 0.2;
            this.vel.x = -this.vel.x * damping;
            this.vel.z = -this.vel.z * damping;
            this.vel.y = Math.max(this.vel.y, 1.5);
            this.owner = 'player';
            game.ui.toast('↩ Kimmotus!');
            return;
          }
          game.hurtPlayer(this.dmg, this.pos.x - this.vel.x, this.pos.z - this.vel.z, this.levitate ? 'shulker-ammus' : 'nuoli');
          if (this.levitate) game.player.levitate(5);
          this._kill(game); return;
        }
      }
    }
  }
  _kill(game) { this.dead = true; game.scene.remove(this.mesh); if (this._ownMat) this._ownMat.dispose(); }
}

/* ---------------- wind charge ---------------- */
class WindCharge {
  constructor(x, y, z, vx, vy, vz, game) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.dead = false;
    this.life = 3;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xcdeef7 }));
    this.mesh.position.set(x, y, z);
    game.scene.add(this.mesh);
  }
  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this._burst(game); return; }
    this.vel.y -= 4 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.x += dt * 9; this.mesh.rotation.y += dt * 7;
    if (isSolid(game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)))) {
      this._burst(game); return;
    }
    for (const m of game.mobs) {
      if (m.dead) continue;
      if (Math.hypot(m.pos.x - this.pos.x, m.pos.y + m.cfg.h * 0.5 - this.pos.y, m.pos.z - this.pos.z) < m.cfg.hw + 0.55) {
        this._burst(game); return;
      }
    }
  }
  _burst(game) {
    if (this.dead) return;
    this.dead = true;
    game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const r = 3.8;
    for (const m of game.mobs) {
      if (m.dead) continue;
      const dx = m.pos.x - this.pos.x, dy = m.pos.y - this.pos.y, dz = m.pos.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < r) {
        const f = (r - d) / r, L = Math.hypot(dx, dz) || 1;
        m.kbx += dx / L * 16 * f; m.kbz += dz / L * 16 * f;
        m.vel.y = 8 * f + 4;
      }
    }
    const p = game.player;
    if (p && p.alive) {
      const dx = p.pos.x - this.pos.x, dy = p.pos.y - this.pos.y, dz = p.pos.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < r + 1) {
        const f = (r + 1 - d) / (r + 1), L = Math.hypot(dx, dz) || 1;
        p.kbx += dx / L * 11 * f; p.kbz += dz / L * 11 * f;
        p.vel.y = Math.max(p.vel.y, 8.5 * f + (dy >= -0.4 ? 6 : 0));
        p.peakY = p.pos.y;
      }
    }
    if (typeof Music !== 'undefined') Music.sfx('wind');
  }
}
