/* CopyCraft — main game: accounts, save/load, rendering, input, simulation */
'use strict';

const DAY_LENGTH = 600;     // seconds for a full day/night cycle

function makeVillagerTrades(seed) {
  const r = makeRNG(seed);
  const ALL = [
    { give: [{ id: I.LEATHER, n: 5 }], get: I.EMERALD, count: 1 },
    { give: [{ id: I.PAPER, n: 3 }], get: I.EMERALD, count: 1 },
    { give: [{ id: B.COBBLE, n: 12 }], get: I.EMERALD, count: 1 },
    { give: [{ id: I.COAL, n: 8 }], get: I.EMERALD, count: 1 },
    { give: [{ id: B.SUGAR_CANE, n: 4 }], get: I.EMERALD, count: 1 },
    { give: [{ id: I.EMERALD, n: 1 }], get: I.APPLE, count: 4 },
    { give: [{ id: I.EMERALD, n: 4 }], get: I.COOKED_BEEF, count: 6 },
    { give: [{ id: I.EMERALD, n: 5 }], get: I.IRON_PICKAXE, count: 1 },
    { give: [{ id: I.EMERALD, n: 12 }], get: I.DIAMOND, count: 1 },
    { give: [{ id: I.EMERALD, n: 3 }], get: I.LAPIS, count: 4 },
    { give: [{ id: I.EMERALD, n: 2 }], get: I.BOOK, count: 1 },
    { give: [{ id: I.EMERALD, n: 8 }], get: I.UPGRADE_TEMPLATE, count: 1 },
    { give: [{ id: I.EMERALD, n: 6 }], get: I.ENDER_PEARL, count: 1 }
  ];
  const out = [];
  const used = new Set();
  while (out.length < 4 && used.size < ALL.length) {
    const i = (r() * ALL.length) | 0;
    if (used.has(i)) continue;
    used.add(i);
    out.push(ALL[i]);
  }
  return out;
}

const Game = {
  state: 'account',
  worldType: 'normal',
  mode: 'survival',
  worldId: null, worldName: 'Maailma',
  mobs: [], drops: [], arrows: [], winds: [], eyes: [], beams: [],
  noiseCount: 0, lastNoiseTs: 0,
  keys: {},
  isTouch: false, _tcRoot: null, _touchSprintLock: false,
  touch: { fwd: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false },
  time: 0.04, dayCount: 1,
  leftHeld: false, rightHeld: false,
  mineTarget: null, mineProg: 0,
  bowCD: 0, spawnTimer: 2, spawnerTimer: 0, attackSwing: 0,
  saveTimer: 45, lastT: 0, loadedExisting: false,
  dimension: 'overworld', overworld: null, nether: null,
  netherReturn: null, portalTimer: 0, portalCooldown: 0,
  _loadDone: null, _teleportBuild: false, _lastSpace: 0,
  _lastW: 0, _wSprint: false,

  init() {
    Tex.build();
    Entities.init();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    document.body.insertBefore(this.renderer.domElement, document.body.firstChild);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 1000);
    this.scene.add(this.camera);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.7);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0x9fc6e8, 0x5a4a36, 0.4);
    this.scene.add(this.hemi);

    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.003, 1.003, 1.003));
    this.selBox = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.selBox.visible = false;
    this.scene.add(this.selBox);

    this.heldGroup = new THREE.Group();
    this.heldGroup.position.set(0.62, -0.5, -0.9);
    this.camera.add(this.heldGroup);
    this.heldId = -1;
    this.offhandGroup = new THREE.Group();
    this.offhandGroup.position.set(-0.62, -0.5, -0.9);
    this.camera.add(this.offhandGroup);
    this.offhandId = -1;

    this._initMenuScene();
    this._initSkyObjects();
    this._initParticles();
    this._initChat();
    this._initMultiplayer();

    UI.init(this);
    this.ui = UI;

    this._wireUI();
    this._wireInput();
    Music.init();
    this._updateMusicLabels();

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    window.addEventListener('beforeunload', () => {
      if (this.state === 'play' || this.state === 'inventory' || this.state === 'pause') {
        try { this._saveBeacon(); } catch (e) {}
      }
    });

    Accounts.restore().then((ok) => {
      if (ok) {
        this.showWorlds();
        Accounts._heartbeat();
        setInterval(() => Accounts._heartbeat(), 30_000);
      } else {
        this.showAccount();
      }
    });

    this.lastT = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  },

  /* ---------------- screens ---------------- */
  _hideMenus() {
    for (const id of ['account', 'worlds', 'menu', 'loading'])
      document.getElementById(id).classList.add('hidden');
  },
  showAccount() {
    this._hideMenus();
    document.getElementById('account').classList.remove('hidden');
    document.getElementById('accError').textContent = '';
    this.state = 'account';
  },
  showWorlds() {
    this._hideMenus();
    document.getElementById('worlds').classList.remove('hidden');
    document.getElementById('welcome').textContent = 'Tervetuloa, ' + (Accounts.currentName || Accounts.current) + '!';
    this._renderWorldList();
    this.state = 'worlds';
  },
  showMenu() {
    this._hideMenus();
    document.getElementById('menu').classList.remove('hidden');
    this.state = 'menu';
  },

  async _renderWorldList() {
    const list = document.getElementById('worldList');
    list.innerHTML = '<div class="nolist">Ladataan maailmoja…</div>';
    const worlds = await Accounts.worlds();
    list.innerHTML = '';
    if (worlds.length === 0) {
      const d = document.createElement('div');
      d.className = 'nolist';
      d.textContent = 'Ei vielä maailmoja — luo uusi alapuolelta!';
      list.appendChild(d);
      return;
    }
    for (const w of worlds) {
      const card = document.createElement('div');
      card.className = 'worldcard';
      const info = document.createElement('div');
      info.className = 'winfo';
      const nm = document.createElement('div');
      nm.className = 'wname'; nm.textContent = w.name || 'Maailma';
      const meta = document.createElement('div');
      meta.className = 'wmeta';
      meta.textContent = (WORLD_TYPES[w.type] || w.type) + ' · '
        + (w.mode === 'creative' ? 'Creative' : 'Selviytyminen');
      info.appendChild(nm); info.appendChild(meta);
      card.appendChild(info);
      const del = document.createElement('div');
      del.className = 'wdel'; del.textContent = 'Poista';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Poistetaanko maailma "' + (w.name || '') + '" pysyvästi?')) {
          await Accounts.deleteWorld(w.id);
          this._renderWorldList();
        }
      });
      card.appendChild(del);
      card.addEventListener('click', () => this.loadExistingWorld(w.id));
      list.appendChild(card);
    }
  },

  _updateMusicLabels() {
    const t = 'Musiikki: ' + (Music.enabled ? 'päällä' : 'pois');
    for (const id of ['musicBtn', 'musicBtn2']) {
      const e = document.getElementById(id);
      if (e) e.textContent = t;
    }
  },

  /* ---------------- UI wiring ---------------- */
  _wireUI() {
    const accErr = (m) => { document.getElementById('accError').textContent = m || ''; };
    const gesture = () => { Music.init(); Music.resume(); };

    const suggestAlternatives = (u, p, prefix) => {
      const errEl = document.getElementById('accError');
      errEl.innerHTML = '';
      const msg = document.createElement('div');
      msg.textContent = prefix;
      errEl.appendChild(msg);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;justify-content:center;';
      const tried = new Set();
      for (let i = 0; i < 3; i++) {
        let candidate;
        for (let attempt = 0; attempt < 20; attempt++) {
          const suffix = (100 + Math.floor(Math.random() * 900));
          candidate = u.trim() + suffix;
          if (!tried.has(candidate)) { tried.add(candidate); break; }
        }
        const btn = document.createElement('div');
        btn.className = 'btn';
        btn.style.cssText = 'background:#3a7ac0;font-size:13px;padding:6px 12px;margin:0;flex:1;min-width:80px;';
        btn.textContent = candidate;
        btn.addEventListener('click', async () => {
          accErr('Luodaan tiliä "' + candidate + '"…');
          const ce = await Accounts.create(candidate, p);
          if (ce) { accErr(ce); return; }
          const le = await Accounts.login(candidate, p);
          if (le) { accErr(le); return; }
          accErr(''); this.showWorlds(); Music.startMusic();
        });
        wrap.appendChild(btn);
      }
      errEl.appendChild(wrap);
    };

    const tryLogin = async () => {
      gesture();
      const u = document.getElementById('accUser').value;
      const p = document.getElementById('accPass').value;
      accErr('Kirjautuu…');
      let err = await Accounts.login(u, p);
      if (err === 'Tiliä ei löydy') {
        const cerr = await Accounts.create(u, p);
        if (cerr) { accErr(cerr); return; }
        err = await Accounts.login(u, p);
      }
      if (err === 'Väärä salasana') {
        suggestAlternatives(u, p, 'Nimi "' + (u || '').trim() + '" on jo olemassa eikä salasana täsmää. Luo oma uudella nimellä:');
        return;
      }
      if (err) accErr(err);
      else { accErr(''); this.showWorlds(); Music.startMusic(); }
    };
    document.getElementById('loginBtn').addEventListener('click', tryLogin);
    document.getElementById('createBtn').addEventListener('click', async () => {
      gesture();
      const u = document.getElementById('accUser').value;
      const p = document.getElementById('accPass').value;
      accErr('Luodaan tiliä…');
      const err = await Accounts.create(u, p);
      if (err === 'Tili on jo olemassa') {
        suggestAlternatives(u, p, 'Nimi "' + (u || '').trim() + '" on varattu. Valitse vapaa nimi:');
        return;
      }
      if (err) { accErr(err); return; }
      const lerr = await Accounts.login(u, p);
      if (lerr) { accErr(lerr); return; }
      accErr(''); this.showWorlds(); Music.startMusic();
    });
    document.getElementById('accUser').addEventListener('keydown', (e) => {
      if (e.code === 'Enter') document.getElementById('accPass').focus();
    });
    document.getElementById('accPass').addEventListener('keydown', (e) => {
      if (e.code === 'Enter') tryLogin();
    });

    document.getElementById('newWorldBtn').addEventListener('click', () => this.showMenu());
    document.getElementById('logoutBtn').addEventListener('click', () => {
      Accounts.logout(); this.showAccount();
    });
    document.getElementById('musicBtn2').addEventListener('click', () => {
      Music.toggle(); this._updateMusicLabels();
    });
    document.getElementById('friendsBtn').addEventListener('click', () => this.openFriendsPanel());
    document.getElementById('friendsCloseBtn').addEventListener('click', () => {
      document.getElementById('friendsPanel').classList.add('hidden');
    });
    document.getElementById('friendSearchBtn').addEventListener('click', () => this._friendSearch());
    document.getElementById('friendSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._friendSearch();
    });
    document.getElementById('friendsRefreshBtn').addEventListener('click', () => this.openFriendsPanel());
    document.getElementById('joinWorldIdBtn').addEventListener('click', () => {
      const wid = document.getElementById('joinWorldIdInput').value.trim();
      if (wid) this.joinFriendWorld(wid);
    });
    document.getElementById('joinWorldIdInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('joinWorldIdBtn').click();
    });

    const wc = document.getElementById('worldChoices');
    wc.addEventListener('click', (e) => {
      const c = e.target.closest('.choice'); if (!c) return;
      wc.querySelectorAll('.choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active'); this.worldType = c.dataset.world;
    });
    const mc = document.getElementById('modeChoices');
    mc.addEventListener('click', (e) => {
      const c = e.target.closest('.choice'); if (!c) return;
      mc.querySelectorAll('.choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active'); this.mode = c.dataset.mode;
    });
    document.getElementById('startBtn').addEventListener('click', () => this.startNewWorld());
    document.getElementById('backBtn').addEventListener('click', () => this.showWorlds());

    document.getElementById('resumeBtn').addEventListener('click', () => {
      if (this.state === 'pause' || this.state === 'victory') {
        this._hideOverlay(); this.state = 'play'; this._lock();
      } else if (this.state === 'dead') {
        this._respawnToOverworld();
      }
    });
    document.getElementById('musicBtn').addEventListener('click', () => {
      Music.toggle(); this._updateMusicLabels();
    });
    document.getElementById('mpToggleBtn').addEventListener('click', () => {
      if (!this.mp || !this.worldId) return;
      if (this.mp.openToFriends) this.closeWorldFromFriends();
      else this.openWorldToFriends();
      this._updateMpToggleBtn();
    });
    document.getElementById('voiceToggleBtn').addEventListener('click', () => this._toggleVoice());
    document.getElementById('spectatorToggleBtn').addEventListener('click', () => this._toggleSpectator());
    document.getElementById('mpStatusCopy').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.worldId) {
        try { navigator.clipboard.writeText(this.worldId); UI.toast('📋 ID kopioitu'); } catch (err) {}
      }
    });
    document.getElementById('menuBtn').addEventListener('click', async () => {
      // Save BEFORE reloading — wait for the promise so progress isn't lost
      const btn = document.getElementById('menuBtn');
      const orig = btn.textContent;
      btn.textContent = 'Tallennetaan…';
      try {
        if (this.world && this.player) await this.saveCurrent(true);
        if (this.mp && this.mp.worldId) {
          await Accounts.leaveWorld(this.mp.worldId);
          if (this.mp.openToFriends) await Accounts.markWorldClosed(this.mp.worldId);
        }
        if (this.voice && this.voice.enabled) this._voiceStop();
      } catch (e) { console.warn('save before exit failed', e); }
      btn.textContent = orig;
      location.reload();
    });
  },

  /* ---------------- world creation / loading ---------------- */
  startNewWorld() {
    let seedStr = document.getElementById('seedInput').value.trim();
    let seed;
    if (!seedStr) seed = (Math.random() * 0xffffffff) >>> 0;
    else if (/^\d+$/.test(seedStr)) seed = parseInt(seedStr, 10) >>> 0;
    else { seed = 0; for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0; }

    const nm = document.getElementById('nameInput').value.trim();
    this.worldName = nm || 'Maailma';
    this.worldId = Accounts.newWorldId();
    this.seed = seed;
    this.time = 0.04; this.dayCount = 1;
    this.loadedExisting = false;

    this.overworld = new World(seed, this.worldType, this.scene);
    this.nether = null;
    this.end = null;
    this.dimension = 'overworld';
    this.netherReturn = null;
    this.endReturn = null;
    this.dragonDefeated = false;
    this.endStructuresBuilt = false;
    this.world = this.overworld;
    const spawn = this.world.findSpawn();
    this.player = new Player(spawn, this.mode);
    this._enterWorld();
  },

  async loadExistingWorld(id) {
    document.getElementById('worlds').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    const s = await Accounts.loadWorld(id);
    if (!s) {
      document.getElementById('loading').classList.add('hidden');
      this.showWorlds();
      alert('Maailman lataus epäonnistui.');
      return;
    }
    this.worldId = s.id; this.worldName = s.name || 'Maailma';
    this.worldType = s.type; this.mode = s.mode; this.seed = s.seed;
    this.time = s.time || 0.04; this.dayCount = s.dayCount || 1;
    this.loadedExisting = true;

    this.overworld = new World(s.seed, s.type, this.scene);
    this.overworld.loadEdits(s.edits || {});
    const fixContainer = (c) => {
      if (!c) return c;
      if (c.type === 'chest' || c.type === 'shulker') {
        // Firebase pudottaa pelkkiä null-arvoja sisältävän taulukon kokonaan pois,
        // joten tyhjän arkun slots voi olla undefined tai objekti — korjataan aina 27-taulukoksi.
        const arr = new Array(27).fill(null);
        if (c.slots && typeof c.slots === 'object') {
          for (let i = 0; i < 27; i++) arr[i] = c.slots[i] || c.slots[String(i)] || null;
        }
        c.slots = arr;
      }
      return c;
    };
    if (s.containers) for (const k in s.containers) this.overworld.containers.set(k, fixContainer(s.containers[k]));
    this.nether = null;
    if (s.netherVisited) {
      this.nether = new World((s.seed ^ 0x9e3a) >>> 0, 'nether', this.scene);
      this.nether.loadEdits(s.netherEdits || {});
      if (s.netherContainers) for (const k in s.netherContainers) this.nether.containers.set(k, fixContainer(s.netherContainers[k]));
    }
    this.end = null;
    if (s.endVisited) {
      this.end = new World((s.seed ^ 0xe71d) >>> 0, 'end', this.scene);
      this.end.loadEdits(s.endEdits || {});
      if (s.endContainers) for (const k in s.endContainers) this.end.containers.set(k, fixContainer(s.endContainers[k]));
    }
    this.dimension = (s.dimension === 'nether' && this.nether) ? 'nether'
      : (s.dimension === 'end' && this.end) ? 'end'
      : 'overworld';
    this.netherReturn = s.netherReturn || null;
    this.endReturn = s.endReturn || null;
    this.dragonDefeated = !!s.dragonDefeated;
    this.endStructuresBuilt = !!s.endStructuresBuilt;
    this.world = this.dimension === 'nether' ? this.nether
      : this.dimension === 'end' ? this.end
      : this.overworld;

    const sp = s.player;
    this.player = new Player({ x: sp.x, y: sp.y, z: sp.z }, s.mode);
    const p = this.player;
    p.yaw = sp.yaw || 0; p.pitch = sp.pitch || 0;
    p.health = sp.health; p.hunger = sp.hunger;
    p.selected = sp.selected || 0;
    // Firebase RTDB compresses sparse arrays to objects keyed by index — handle both
    const invSrc = sp.inv;
    if (invSrc && typeof invSrc === 'object') {
      for (let i = 0; i < 36; i++) p.inv[i] = invSrc[i] || invSrc[String(i)] || null;
    }
    if (sp.armor) p.armor = { head: sp.armor.head || null, chest: sp.armor.chest || null, legs: sp.armor.legs || null, feet: sp.armor.feet || null };
    p.offhand = sp.offhand || null;
    if (sp.spawn) p.spawn = sp.spawn;
    p.home = sp.home || null;
    p.homeSet = !!sp.homeSet;
    p.xp = sp.xp || 0; p._recalcXP();
    p.absorption = sp.absorption || 0;
    p.resistanceUntil = sp.resistanceUntil || 0;
    p.fireResUntil = sp.fireResUntil || 0;
    p.regenUntil = sp.regenUntil || 0;
    p.swiftnessUntil = sp.swiftnessUntil || 0;
    p.strengthUntil = sp.strengthUntil || 0;
    // Backwards compat: legacy worlds get a Home Button if they don't have one and haven't set home
    if (!p.homeSet) {
      let has = false;
      for (let i = 0; i < 36; i++) { const s = p.inv[i]; if (s && s.id === I.HOME_BUTTON) { has = true; break; } }
      if (!has) p.give(I.HOME_BUTTON, 1);
    }
    this._enterWorld();
  },

  _enterWorld() {
    this._hideMenus();
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('overlay').classList.add('hidden');
    this.scene.add(this.world.group);
    this.mobs = []; this.drops = []; this.arrows = []; this.winds = []; this.eyes = []; this.pearls = []; this.beams = [];
    this.mineTarget = null; this.mineProg = 0;
    this.portalTimer = 0; this.portalCooldown = 3;
    this.saveTimer = 45;
    this._loadDone = null;
    this.state = 'loading';
    Music.startMusic();
    this._loadStep();
  },

  _loadStep() {
    const p = this.player;
    let done = false;
    for (let i = 0; i < 3; i++) done = this.world.update(p.pos.x, p.pos.z, 6, 4) || done;
    let gen = 0;
    for (const c of this.world.chunks.values()) if (c.generated) gen++;
    const frac = Math.min(1, gen / this.world.offsets.length);
    document.getElementById('loadFill').style.width = (frac * 100) + '%';
    if (done) {
      const cb = this._loadDone; this._loadDone = null;
      if (cb) cb(); else this._beginPlay();
      return;
    }
    requestAnimationFrame(() => this._loadStep());
  },

  _beginPlay() {
    const p = this.player;
    if (!this.loadedExisting) {
      let y = WORLD_H - 1;
      while (y > 1 && !isSolid(this.world.getBlock(Math.floor(p.pos.x), y, Math.floor(p.pos.z)))) y--;
      p.pos.y = y + 1; p.spawn = { x: p.pos.x, y: y + 1, z: p.pos.z }; p.peakY = y + 1;
    }
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'play';
    UI.refresh();
    if (!this.loadedExisting) {
      for (let i = 0; i < 6; i++) this._trySpawn(false, 8, 22);
      UI.toast('Tervetuloa! Louhi puuta ja tee työpöytä.');
      try { this.saveCurrent(true); } catch (e) {}
    } else {
      UI.toast('Maailma ladattu — tervetuloa takaisin!');
    }
    this._lock();
  },

  /* ---------------- saving ---------------- */
  serialize() {
    const p = this.player;
    const cont = (w) => { const o = {}; if (w) for (const [k, c] of w.containers) o[k] = c; return o; };
    return {
      id: this.worldId, name: this.worldName, seed: this.overworld.seed,
      type: this.overworld.type, mode: p.mode, played: Date.now(),
      time: this.time, dayCount: this.dayCount, dimension: this.dimension,
      player: {
        x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch,
        health: p.health, hunger: p.hunger, selected: p.selected,
        inv: p.inv, armor: p.armor, offhand: p.offhand, spawn: p.spawn,
        home: p.home, homeSet: p.homeSet, xp: p.xp,
        absorption: p.absorption, resistanceUntil: p.resistanceUntil, fireResUntil: p.fireResUntil, regenUntil: p.regenUntil,
        swiftnessUntil: p.swiftnessUntil, strengthUntil: p.strengthUntil
      },
      edits: this.overworld.exportEdits(), containers: cont(this.overworld),
      netherVisited: !!this.nether,
      netherEdits: this.nether ? this.nether.exportEdits() : {},
      netherContainers: cont(this.nether),
      netherReturn: this.netherReturn,
      dragonDefeated: !!this.dragonDefeated,
      endReturn: this.endReturn || null,
      endVisited: !!this.end,
      endEdits: this.end ? this.end.exportEdits() : {},
      endContainers: cont(this.end),
      endStructuresBuilt: !!this.endStructuresBuilt
    };
  },
  saveCurrent(silent) {
    if (!this.world || !this.player) return Promise.resolve();
    const data = this.serialize();
    return Accounts.saveWorld(data).then(() => {
      if (!silent) UI.toast('Peli tallennettu pilveen ☁');
    }).catch((e) => {
      console.warn('saveCurrent failed:', e);
      if (!silent) UI.toast('Tallennus epäonnistui — yhteys?');
    });
  },

  _saveBeacon() {
    if (!this.world || !this.player || !Accounts.current) return;
    const data = this.serialize();
    data.owner = Accounts.current;
    data.played = Date.now();
    const body = JSON.stringify(data);
    try {
      // fetch keepalive lets the request complete after the page unloads
      fetch(FIREBASE_DB_URL + '/bettercraft/worlds/' + data.id + '.json',
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      fetch(FIREBASE_DB_URL + '/bettercraft/users/' + Accounts.current + '/worldIds/' + data.id + '.json',
        { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name, type: data.type, mode: data.mode, played: data.played }),
          keepalive: true });
    } catch (e) {}
  },

  /* Pyydä hiiren lukitus — ei tee mitään kosketuslaitteilla */
  _lock() { if (this.isTouch || !this.canvas) return; const fn = this.canvas.requestPointerLock; try { fn.call(this.canvas); } catch (e) {} },

  /* ---------------- input ---------------- */
  _wireInput() {
    const GAME_KEYS = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyM',
      'Space', 'Tab',
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'
    ]);
    addEventListener('keydown', (e) => {
      const inGame = (this.state === 'play' || this.state === 'inventory' || this.state === 'pause' || this.state === 'dead');
      // Prevent browser shortcuts that conflict with gameplay (Ctrl+W closes tab!)
      if (inGame && GAME_KEYS.has(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (!inGame) return;
      if (e.code === 'KeyM') { Music.toggle(); this._updateMusicLabels(); UI.toast('Musiikki ' + (Music.enabled ? 'päällä' : 'pois')); }
      if (e.code === 'Space' && !e.repeat && this.state === 'play' && this.player && this.player.mode === 'creative') {
        const now = performance.now();
        if (now - this._lastSpace < 300) {
          this.player.flying = !this.player.flying;
          this.player.vel.y = 0;
          UI.toast(this.player.flying ? '✈ Lento päällä' : 'Lento pois');
          this._lastSpace = 0;
        } else {
          this._lastSpace = now;
        }
      }
      if (e.code === 'Escape') {
        if (this.state === 'inventory') UI.closeScreen();
        else if (this.state === 'play') { this.state = 'pause'; this._showOverlay('Tauko', false); document.exitPointerLock(); try { this.saveCurrent(true); } catch (e) {} }
        else if (this.state === 'pause') { this._hideOverlay(); this.state = 'play'; this._lock(); }
      }
      if (e.code === 'KeyE') {
        if (this.state === 'play') { UI.openInventory('inv'); document.exitPointerLock(); }
        else if (this.state === 'inventory') UI.closeScreen();
      }
      if (e.code === 'KeyT' && this.state === 'play' && !e.repeat) {
        // open chat input (T = team/text chat)
        this._openChatInput();
        e.preventDefault();
      }
      if (this.state === 'play' && e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) { this.player.selected = n - 1; UI.refresh(); }
      }
      if (e.code === 'KeyQ' && this.state === 'play' && !e.repeat && this.player) {
        const all = !!(this.keys.ControlLeft || this.keys.ControlRight);
        this._dropCurrentItem(all ? 64 : 1);
      }
      if (e.code === 'KeyW' && this.state === 'play' && !e.repeat) {
        const now = performance.now();
        if (now - this._lastW < 300) this._wSprint = true;
        this._lastW = now;
      }
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyW') this._wSprint = false;
    });
    addEventListener('blur', () => { this.keys = {}; this.leftHeld = this.rightHeld = false; });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.isTouch) return; // kosketuslaitteilla käytetään touch-käsittelijöitä
      Music.resume();
      if (this.state === 'pause') { this._hideOverlay(); this.state = 'play'; this._lock(); return; }
      if (this.state !== 'play') return;
      if (document.pointerLockElement !== this.canvas) { this._lock(); return; }
      if (e.button === 0) { this.leftHeld = true; this._onLeftClick(); }
      if (e.button === 2) { this.rightHeld = true; this._onRightClick(); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.leftHeld = false; this.mineTarget = null; this.mineProg = 0; }
      if (e.button === 2) this.rightHeld = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (this.state === 'play' && document.pointerLockElement === this.canvas) {
        this.player.yaw -= e.movementX * 0.0023;
        this.player.pitch -= e.movementY * 0.0023;
        this.player.pitch = clamp(this.player.pitch, -1.54, 1.54);
      }
    });
    addEventListener('wheel', (e) => {
      if (this.state !== 'play') return;
      const p = this.player;
      p.selected = (p.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
      UI.refresh();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.isTouch) return; // ei automaattista taukoa kosketuslaitteilla
      if (document.pointerLockElement !== this.canvas && this.state === 'play') {
        this.state = 'pause'; this._showOverlay('Tauko', false);
      }
    });

    this._initTouchControls();
  },

  /* ---------------- kosketusohjaus (puhelin/tabletti) ---------------- */
  _initTouchControls() {
    const ua = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '');
    const coarse = !!(navigator.maxTouchPoints > 0 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.isTouch = ua || coarse;
    const root = document.getElementById('touchControls');
    this._tcRoot = root;
    if (!this.isTouch || !root) return;

    // --- Katselu: veto avoimella alueella ---
    const look = document.getElementById('tcLook');
    let lookId = null, lastX = 0, lastY = 0;
    look.addEventListener('touchstart', (e) => {
      if (this.state !== 'play') return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lastX = t.clientX; lastY = t.clientY;
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchmove', (e) => {
      if (lookId === null || this.state !== 'play' || !this.player) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        this.player.yaw -= dx * 0.005;
        this.player.pitch = clamp(this.player.pitch - dy * 0.005, -1.54, 1.54);
      }
      e.preventDefault();
    }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    look.addEventListener('touchend', endLook);
    look.addEventListener('touchcancel', endLook);

    // --- Liikkumissauva ---
    const move = document.getElementById('tcMove'), stick = document.getElementById('tcStick');
    let moveId = null, cx = 0, cy = 0, R = 60;
    const setMove = (nx, ny) => {
      const tt = this.touch;
      tt.left = nx < -0.3; tt.right = nx > 0.3;
      tt.fwd = ny < -0.3; tt.back = ny > 0.3;
      tt.sprint = (nx * nx + ny * ny) > 0.7; // työnnä reunaan = juoksu
    };
    move.addEventListener('touchstart', (e) => {
      const r = move.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2;
      moveId = e.changedTouches[0].identifier;
      e.preventDefault();
    }, { passive: false });
    move.addEventListener('touchmove', (e) => {
      if (moveId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== moveId) continue;
        const dx = t.clientX - cx, dy = t.clientY - cy;
        const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, R);
        stick.style.transform = 'translate(' + (dx / len * cl) + 'px,' + (dy / len * cl) + 'px)';
        setMove(dx / R, dy / R);
      }
      e.preventDefault();
    }, { passive: false });
    const endMove = (e) => {
      for (const t of e.changedTouches) if (t.identifier === moveId) {
        moveId = null; stick.style.transform = 'translate(0,0)';
        const tt = this.touch; tt.fwd = tt.back = tt.left = tt.right = tt.sprint = false;
      }
    };
    move.addEventListener('touchend', endMove);
    move.addEventListener('touchcancel', endMove);

    // --- Pohjaan painettavat napit ---
    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('on'); on(); }, { passive: false });
      const up = (e) => { e.preventDefault(); el.classList.remove('on'); off(); };
      el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    };
    hold('tcMine', () => { if (this.state === 'play') { this.leftHeld = true; this._onLeftClick(); } },
                  () => { this.leftHeld = false; this.mineTarget = null; this.mineProg = 0; });
    hold('tcPlace', () => { if (this.state === 'play') { this.rightHeld = true; this._onRightClick(); } },
                    () => { this.rightHeld = false; });
    hold('tcJump', () => { this.touch.jump = true; }, () => { this.touch.jump = false; });
    hold('tcSneak', () => { this.touch.sneak = true; }, () => { this.touch.sneak = false; });

    // Tuplanapautus hyppyyn = lento päälle/pois (creative)
    let lastJump = 0;
    document.getElementById('tcJump').addEventListener('touchstart', () => {
      if (!this.player || this.player.mode !== 'creative') return;
      const now = performance.now();
      if (now - lastJump < 320) {
        this.player.flying = !this.player.flying; this.player.vel.y = 0;
        UI.toast(this.player.flying ? '✈ Lento päällä' : 'Lento pois'); lastJump = 0;
      } else lastJump = now;
    });

    // --- Napautusnapit ---
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(el); }, { passive: false });
    };
    tap('tcSprint', (el) => { this._touchSprintLock = !this._touchSprintLock; el.classList.toggle('on', this._touchSprintLock); });
    tap('tcInv', () => { if (this.state === 'play') UI.openInventory('inv'); else if (this.state === 'inventory') UI.closeScreen(); });
    tap('tcDrop', () => { if (this.state === 'play' && this.player) this._dropCurrentItem(1); });
    tap('tcPause', () => {
      if (this.state === 'play') { this.state = 'pause'; this._showOverlay('Tauko', false); try { this.saveCurrent(true); } catch (e) {} }
      else if (this.state === 'pause') { this._hideOverlay(); this.state = 'play'; }
    });
  },

  _showOverlay(title, isDeath) {
    const el = document.getElementById('overlayTitle');
    el.textContent = title;
    el.style.whiteSpace = 'pre-line';
    el.style.color = isDeath ? '#e23b3b' : '#fff';
    this._updateMpToggleBtn();
    this._updateVoiceBtn();
    this._updateSpectatorBtn();
    // Hide MP & voice toggle during death
    const mpBtn = document.getElementById('mpToggleBtn');
    const vcBtn = document.getElementById('voiceToggleBtn');
    const specBtn = document.getElementById('spectatorToggleBtn');
    if (mpBtn) mpBtn.style.display = isDeath ? 'none' : '';
    if (vcBtn) vcBtn.style.display = isDeath ? 'none' : '';
    // Spectator toggle only visible to creative/spectator players
    if (specBtn) {
      const mode = this.player && this.player.mode;
      specBtn.style.display = (!isDeath && (mode === 'creative' || mode === 'spectator')) ? '' : 'none';
    }
    document.getElementById('resumeBtn').textContent = isDeath ? 'Synny uudelleen' : 'Jatka peliä';
    document.getElementById('menuBtn').textContent = isDeath ? 'Palaa valikkoon' : 'Tallenna ja lopeta';
    document.getElementById('overlay').classList.remove('hidden');
  },
  _hideOverlay() { document.getElementById('overlay').classList.add('hidden'); },

  /* ---------------- raycasting ---------------- */
  _raycast() {
    const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    let prev = null, block = null, place = null, bdist = 99;
    for (let t = 0; t < 5.5; t += 0.04) {
      const x = Math.floor(o.x + d.x * t), y = Math.floor(o.y + d.y * t), z = Math.floor(o.z + d.z * t);
      const id = this.world.getBlock(x, y, z);
      // Laava ja tuli eivät estä kohdistusta — niiden läpi voi louhia takana olevia lohkoja
      if (id !== B.AIR && id !== B.WATER && id !== B.LAVA && id !== B.FIRE) { block = { x, y, z }; place = prev; bdist = t; break; }
      prev = { x, y, z };
    }
    let mob = null, mdist = 99;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = this._rayMob(o, d, m);
      if (t !== null && t < 4.4 && t < mdist) { mdist = t; mob = m; }
    }
    return { block, place, bdist, mob, mdist };
  },
  _raycastLiquid() {
    const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    for (let t = 0; t < 5.5; t += 0.04) {
      const x = Math.floor(o.x + d.x * t), y = Math.floor(o.y + d.y * t), z = Math.floor(o.z + d.z * t);
      const id = this.world.getBlock(x, y, z);
      if (id === B.WATER || id === B.LAVA) return { block: { x, y, z }, id };
      if (id !== B.AIR) return null;
    }
    return null;
  },

  _rayMob(o, d, m) {
    const hw = m.cfg.hw + 0.15, h = m.cfg.h;
    const min = [m.pos.x - hw, m.pos.y, m.pos.z - hw];
    const max = [m.pos.x + hw, m.pos.y + h, m.pos.z + hw];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let tmin = 0, tmax = 6;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-6) { if (oo[i] < min[i] || oo[i] > max[i]) return null; }
      else {
        let t1 = (min[i] - oo[i]) / dd[i], t2 = (max[i] - oo[i]) / dd[i];
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  },

  /* ---------------- actions ---------------- */
  _hitRemotePlayer() {
    if (!this.mp || this.mp.others.size === 0) return null;
    const p = this.player;
    const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    let best = null, bestDist = 5; // 5 block reach
    for (const [uid, rec] of this.mp.others) {
      const dx = rec.pos.x - o.x, dy = rec.pos.y + 1.0 - o.y, dz = rec.pos.z - o.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > bestDist) continue;
      // Normalize and check alignment with camera direction
      const inv = 1 / dist;
      const dot = (dx * inv) * d.x + (dy * inv) * d.y + (dz * inv) * d.z;
      if (dot < 0.9) continue; // within ~25° of crosshair
      best = { uid, rec, dist };
      bestDist = dist;
    }
    return best;
  },

  _onLeftClick() {
    const rc = this._raycast();
    // Check if hitting a remote player (PvP)
    const hit = this._hitRemotePlayer();
    if (hit && (!rc.mob || hit.dist < (rc.mdist || 999)) && (!rc.block || hit.dist < (rc.bdist || 999))) {
      const p = this.player;
      const it = p.currentItem();
      const def = it ? defOf(it.id) : null;
      let dmg = 1;
      if (def && def.type === 'tool') dmg = def.damage;
      // Apply local enchantment bonuses
      const sharp = enchantLevel(it, 'sharpness');
      if (sharp > 0 && def && def.type === 'tool' && (def.kind === 'sword' || def.kind === 'axe')) dmg += 0.5 * sharp + 0.5;
      const dens = enchantLevel(it, 'density');
      if (dens > 0 && def && def.kind === 'mace') dmg += dens + 0.5;
      const spikes = enchantLevel(it, 'spikes');
      if (spikes > 0 && def && def.kind === 'bat') dmg += spikes * 3;
      // Mace-murskaisku myös pelaajiin: mitä korkeammalta lyö, sitä enemmän (rajatta)
      if (def && def.kind === 'mace' && !p.onGround && p.vel.y < -0.5) {
        const fall = Math.max(0, p.peakY - p.pos.y);
        const bonus = fall * 3.2;
        dmg += bonus;
        p.peakY = p.pos.y;
        if (bonus > 3) UI.toast('💥 Murskaisku!');
      }
      // Bat knockback multiplier — send to recipient for stronger pushback
      const kbBat = enchantLevel(it, 'bat_knockback');
      const kbMul = (def && def.kind === 'bat') ? (1 + kbBat * 1.5) : 1;
      // Send damage over DataChannel (instant) — falls back silently if not connected
      this._mpSendTo(hit.uid, {
        type: 'damage', dmg: Math.round(dmg), fromName: Accounts.currentName,
        fx: p.pos.x, fz: p.pos.z, kbMul,
        axe: !!(def && def.kind === 'axe'), fromUid: Accounts.current
      });
      // Wind Burst (mace enchant): launches the ATTACKER upward, like mob-hit case
      const wb = enchantLevel(it, 'wind_burst');
      if (wb > 0 && def && def.kind === 'mace') {
        p.vel.y = Math.max(p.vel.y, 7 + wb * 2.5);
        p.windJump = true;
        this.spawnWind(p.pos.x, p.pos.y + 0.4, p.pos.z, 0, 6, 0);
        UI.toast('🌪 Tuulipuuska!');
      }
      Music.sfx('hit');
      this.attackSwing = 1;
      UI.toast('⚔ -' + Math.round(dmg) + ' → ' + (hit.rec.name || hit.uid.slice(0, 8)));
      return;
    }
    if (rc.mob && (!rc.block || rc.mdist < rc.bdist)) {
      const p = this.player;
      const it = p.currentItem();
      const def = it ? defOf(it.id) : null;
      let dmg = 1;
      if (def && def.type === 'tool') dmg = def.damage;
      else if (def && def.type === 'bow') dmg = 2;
      // Strength potion: tuplavahinko
      if (p.strengthUntil > Date.now()) dmg = Math.floor(dmg * 2);
      // Sharpness adds bonus damage on melee
      const sharp = enchantLevel(it, 'sharpness');
      if (sharp > 0 && def && def.type === 'tool' && (def.kind === 'sword' || def.kind === 'axe')) {
        dmg += 0.5 * sharp + 0.5;
      }
      // Density: mace damage bonus (matches Sharpness role but for mace)
      const dens = enchantLevel(it, 'density');
      if (dens > 0 && def && def.kind === 'mace') {
        dmg += dens + 0.5;
      }
      // Spikes (bat): +3 damage per level
      const spikes = enchantLevel(it, 'spikes');
      if (spikes > 0 && def && def.kind === 'bat') {
        dmg += spikes * 3;
      }
      if (def && def.kind === 'mace' && !p.onGround && p.vel.y < -0.5) {
        const fall = Math.max(0, p.peakY - p.pos.y);
        // Ei kattoa: mitä korkeammalta lyö, sitä enemmän damagea (rajatta)
        const bonus = fall * 3.2;
        dmg += bonus;
        p.peakY = p.pos.y;
        for (const m of this.mobs) {
          if (m.dead || m === rc.mob) continue;
          if (Math.hypot(m.pos.x - rc.mob.pos.x, m.pos.z - rc.mob.pos.z) < 3.2)
            m.takeDamage(bonus * 0.4 + 2, m.pos.x - rc.mob.pos.x, m.pos.z - rc.mob.pos.z, this);
        }
        if (bonus > 3) UI.toast('💥 Murskaisku!');
      }
      // Bat knockback: scale the impulse vector
      const kbBat = enchantLevel(it, 'bat_knockback');
      const kbMul = (def && def.kind === 'bat') ? (1 + kbBat * 1.5) : 1;
      rc.mob.takeDamage(dmg, (rc.mob.pos.x - p.pos.x) * kbMul, (rc.mob.pos.z - p.pos.z) * kbMul, this);
      // Fire Aspect (sword/mace): sytyttää osuman palamaan
      const fireAsp = enchantLevel(it, 'fire_aspect');
      if (fireAsp > 0 && def && (def.kind === 'sword' || def.kind === 'mace')) {
        rc.mob.ignite(fireAsp * 3 + 1);
      }
      Music.sfx('hit');
      this.attackSwing = 1;
      // Wind Burst (mace enchant): launches the player upward on hit
      const wb = enchantLevel(it, 'wind_burst');
      if (wb > 0 && def && def.kind === 'mace') {
        p.vel.y = Math.max(p.vel.y, 7 + wb * 2.5);
        p.windJump = true;
        this.spawnWind(p.pos.x, p.pos.y + 0.4, p.pos.z, 0, 6, 0);
        UI.toast('🌪 Tuulipuuska!');
      }
    }
  },

  _onRightClick() {
    const p = this.player, rc = this._raycast();
    const it = p.currentItem();
    // Right-click villager → open trade UI
    if (rc.mob && rc.mob.type === 'villager' && (!rc.block || rc.mdist < rc.bdist)) {
      if (!rc.mob.trades) rc.mob.trades = makeVillagerTrades((Math.floor(rc.mob.pos.x) * 31 + Math.floor(rc.mob.pos.z) * 127) >>> 0);
      UI.openInventory('trade', { trades: rc.mob.trades });
      document.exitPointerLock();
      return;
    }
    // Auto-equip held armor/elytra with right-click — only if not aimed at an interactable block.
    // Shield is intentionally excluded here: right-click on shield triggers blocking instead.
    if (it) {
      const bidNow = rc.block ? this.world.getBlock(rc.block.x, rc.block.y, rc.block.z) : 0;
      const targetIsInteract = rc.block && BLOCKS[bidNow] && BLOCKS[bidNow].interact;
      if (!targetIsInteract) {
        const def = defOf(it.id);
        if (def && def.type === 'armor' && def.slot) {
          const cur = p.armor[def.slot] || null;
          p.armor[def.slot] = it;
          p.inv[p.selected] = cur;
          UI.refresh();
          if (typeof Music !== 'undefined') Music.sfx('place');
          return;
        }
      }
    }
    if (rc.block && !this.keys.ShiftLeft) {
      const bid = this.world.getBlock(rc.block.x, rc.block.y, rc.block.z);
      const bdef = BLOCKS[bid];
      if (bdef && bdef.interact) {
        if (bdef.interact === 'sleep') { this._sleep(); return; }
        if (bdef.interact === 'endframe') { this._tryActivateEndPortal(rc.block, it); return; }
        if (bdef.interact === 'craft') UI.openInventory('craft');
        else if (bdef.interact === 'furnace') UI.openInventory('furnace', this.world.getContainer(rc.block.x, rc.block.y, rc.block.z));
        else if (bdef.interact === 'chest') UI.openInventory('chest', this.world.getContainer(rc.block.x, rc.block.y, rc.block.z));
        else if (bdef.interact === 'shulker') UI.openInventory('shulker', this.world.getContainer(rc.block.x, rc.block.y, rc.block.z));
        else if (bdef.interact === 'enchant') {
          const bs = this._countBookshelves(rc.block.x, rc.block.y, rc.block.z);
          UI.openInventory('enchant', { bookshelves: bs });
        }
        else if (bdef.interact === 'grindstone') UI.openInventory('grindstone', { left: null, right: null });
        else if (bdef.interact === 'anvil') UI.openInventory('anvil', { left: null, right: null });
        else if (bdef.interact === 'smithing') UI.openInventory('smithing', { template: null, left: null, right: null });
        else if (bdef.interact === 'brewing') UI.openInventory('brewing', this.world.getContainer(rc.block.x, rc.block.y, rc.block.z));
        else if (bdef.interact === 'sculkbench') UI.openInventory('sculkbench', { input: null });
        document.exitPointerLock();
        return;
      }
      // Step on END_PORTAL to teleport to The End
      if (bid === B.END_PORTAL) { this._teleportEnd(); return; }
    }
    if (!it) return;
    const def = defOf(it.id);
    if (def && def.type === 'igniter') {
      // Light TNT if aimed at one
      if (rc.block) {
        const bx = rc.block.x, by = rc.block.y, bz = rc.block.z;
        if (this.world.getBlock(bx, by, bz) === B.TNT) {
          if (this.world.tntFuses) this.world.tntFuses.set(bx + ',' + by + ',' + bz, 3.0);
          UI.toast('💥 TNT syttyi!'); Music.sfx('place');
          this.attackSwing = 1;
          return;
        }
      }
      if (rc.place && this.world.lightPortal(rc.place.x, rc.place.y, rc.place.z)) {
        UI.toast('Portaali syttyi! 🔥'); Music.sfx('place');
        this.attackSwing = 1;
        return;
      }
      // Sytytä tuli maahan: aseta TULI-lohko kohdistettuun ilmatilaan kiinteän lohkon viereen
      if (rc.block && rc.place && isSolid(this.world.getBlock(rc.block.x, rc.block.y, rc.block.z))
          && this.world.getBlock(rc.place.x, rc.place.y, rc.place.z) === B.AIR) {
        this.world.setBlock(rc.place.x, rc.place.y, rc.place.z, B.FIRE);
        // Helvetinkiven päällä tuli palaa ikuisesti — muuten se sammuu ajan myötä
        const below = this.world.getBlock(rc.place.x, rc.place.y - 1, rc.place.z);
        if (below !== B.NETHERRACK) {
          this.world.fireTimers = this.world.fireTimers || new Map();
          this.world.fireTimers.set(rc.place.x + ',' + rc.place.y + ',' + rc.place.z, 5 + Math.random() * 7);
        }
        if (this.mp && this.mp.worldId) this._mpSend({ type: 'edit', x: rc.place.x, y: rc.place.y, z: rc.place.z, b: B.FIRE, d: this.dimension });
        Music.sfx('place');
        this.attackSwing = 1;
        UI.toast('🔥 Tuli syttyi!');
        return;
      }
      UI.toast('Tarvitaan 4×5 obsidiaanikehys tai kiinteä alusta');
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'golden_apple') {
      p.feed(def.food); p.heal(4);
      p.absorption = Math.max(p.absorption, 4);
      p.regenUntil = Math.max(p.regenUntil, Date.now() + 5_000);
      if (p.mode !== 'creative') p.consumeSelected(1);
      Music.sfx('eat'); UI.refresh();
      UI.toast('🍎 Kultainen omena: +4 absorption, regen 5s');
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'fishing_rod') {
      // 1) Look for a mob/player along crosshair within ~12 blocks → pull them
      const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      const REACH = 12;
      let bestMob = null, bestMobDist = REACH + 1;
      for (const m of this.mobs) {
        if (m.dead) continue;
        const dx = m.pos.x - o.x, dy = m.pos.y + m.cfg.h * 0.5 - o.y, dz = m.pos.z - o.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > REACH) continue;
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
        if (dot < 0.92) continue;
        if (dist < bestMobDist) { bestMobDist = dist; bestMob = m; }
      }
      let bestPlayer = null, bestPlayerDist = REACH + 1;
      if (this.mp && this.mp.others) {
        for (const [uid, rec] of this.mp.others) {
          const dx = rec.pos.x - o.x, dy = rec.pos.y + 1 - o.y, dz = rec.pos.z - o.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > REACH) continue;
          const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
          if (dot < 0.92) continue;
          if (dist < bestPlayerDist) { bestPlayerDist = dist; bestPlayer = { uid, rec }; }
        }
      }
      // Pick whichever is closer
      const mobFirst = bestMob && bestMobDist <= bestPlayerDist;
      if (mobFirst) {
        const m = bestMob;
        const dx = p.pos.x - m.pos.x, dy = p.pos.y - m.pos.y, dz = p.pos.z - m.pos.z;
        const L = Math.hypot(dx, dy, dz) || 1;
        const speed = 12;
        m.vel.x = dx / L * speed;
        m.vel.z = dz / L * speed;
        // Vedä kohti pelaajaa todellisessa suunnassa + pieni hyppy reunojen yli
        m.vel.y = dy / L * speed + 2;
        UI.toast('🪝 Vedit ' + m.type + 'in lähelle!');
        Music.sfx('place'); this.attackSwing = 1;
        return;
      }
      if (bestPlayer) {
        // Send pull event to remote player via DataChannel
        this._mpSendTo(bestPlayer.uid, { type: 'pull', fx: p.pos.x, fy: p.pos.y, fz: p.pos.z });
        UI.toast('🪝 Vedit ' + (bestPlayer.rec.name || 'pelaajan') + ' lähelle!');
        Music.sfx('place'); this.attackSwing = 1;
        return;
      }
      // 2) Already casting? cancel
      if (this._fishingT) { clearTimeout(this._fishingT); this._fishingT = null; UI.toast('🎣 Peruttu'); return; }
      const liq = this._raycastLiquid();
      if (!liq || liq.id !== B.WATER) { UI.toast('Tähtää veteen tai mobiin/pelaajaan!'); return; }
      const lure = enchantLevel(it, 'lure');
      const luck = enchantLevel(it, 'luck_of_the_sea');
      const baseDelay = 8000 - lure * 1500; // 8s base, -1.5s per lure level
      const delay = baseDelay + Math.random() * 4000;
      UI.toast('🎣 Kalastat... (~' + Math.round(delay / 1000) + 's)');
      this._fishingT = setTimeout(() => {
        this._fishingT = null;
        if (!this.player.alive) return;
        // Roll loot
        const roll = Math.random();
        let result;
        const treasureChance = 0.05 + luck * 0.10;
        const junkChance = 0.10 - luck * 0.03;
        if (roll < treasureChance) {
          const treasure = [I.ENCHANTED_BOOK, I.NAUTILUS_SHELL || I.GOLD_INGOT, I.SADDLE || I.IRON_INGOT, I.DIAMOND][(Math.random() * 4) | 0];
          result = { id: treasure, count: 1 };
          UI.toast('🎁 Aarre: ' + (defOf(result.id).name || ''));
        } else if (roll < treasureChance + junkChance) {
          const junk = [I.STICK, I.STRING, I.BONE, B.LEAVES][(Math.random() * 4) | 0];
          result = { id: junk, count: 1 };
          UI.toast('🌿 Jätettä: ' + (defOf(result.id).name || ''));
        } else {
          result = { id: I.RAW_FISH, count: 1 };
          UI.toast('🐟 Sait kalan!');
        }
        const left = this.player.give(result.id, result.count);
        if (left > 0) this.spawnDrop(result.id, left, this.player.pos.x, this.player.pos.y + 1, this.player.pos.z);
        UI.refresh();
        Music.sfx('eat');
      }, delay);
      Music.sfx('place'); this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'glass_bottle') {
      // Right-click water source with glass bottle → water bottle
      const liq = this._raycastLiquid();
      if (liq && liq.id === B.WATER) {
        if (it.count > 1) { it.count--; p.give(I.WATER_BOTTLE, 1); }
        else p.inv[p.selected] = { id: I.WATER_BOTTLE, count: 1 };
        Music.sfx('place'); this.attackSwing = 1; UI.refresh();
      } else UI.toast('Ei vettä — kohdista vesilähteeseen');
      return;
    }
    if (def && def.type === 'water_bottle') {
      // Drink water → just give back glass bottle
      if (p.mode !== 'creative') p.inv[p.selected] = { id: I.GLASS_BOTTLE, count: 1 };
      Music.sfx('eat'); UI.refresh();
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'potion') {
      this._applyPotion(def.potion);
      if (p.mode !== 'creative') p.inv[p.selected] = { id: I.GLASS_BOTTLE, count: 1 };
      Music.sfx('eat'); UI.refresh();
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'enchanted_golden_apple') {
      p.feed(def.food); p.heal(p.maxHealth);
      p.absorption = Math.max(p.absorption, 8);
      p.regenUntil = Math.max(p.regenUntil, Date.now() + 30_000);
      p.resistanceUntil = Math.max(p.resistanceUntil, Date.now() + 300_000);
      p.fireResUntil = Math.max(p.fireResUntil, Date.now() + 300_000);
      if (p.mode !== 'creative') p.consumeSelected(1);
      Music.sfx('eat'); UI.refresh();
      UI.toast('✨ Lumottu omena: +8 absorption, regen 30s, resistance + fireres 5min');
      this.attackSwing = 1;
      return;
    }
    if (def && def.food && p.hunger < p.maxHunger) {
      p.feed(def.food); p.heal(1);
      p.consumeSelected(1); Music.sfx('eat'); UI.refresh();
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'windcharge') {
      // launch the player straight up
      p.vel.y = 21;
      p.windJump = true;
      p.onGround = false;
      this.spawnWind(p.pos.x, p.pos.y + 0.4, p.pos.z, 0, 24, 0);
      if (p.mode !== 'creative') p.consumeSelected(1);
      this.attackSwing = 1; Music.sfx('wind'); UI.refresh();
      return;
    }
    if (def && def.type === 'home') {
      if (!p.homeSet) {
        p.home = { x: p.pos.x, y: p.pos.y, z: p.pos.z, dim: this.dimension };
        p.homeSet = true;
        UI.toast('🏠 Koti asetettu pysyvästi: (' + Math.floor(p.pos.x) + ', ' + Math.floor(p.pos.y) + ', ' + Math.floor(p.pos.z) + ')');
        if (typeof Music !== 'undefined') Music.sfx('place');
      } else {
        if (p.home.dim !== this.dimension) {
          UI.toast('Koti on ' + (p.home.dim === 'nether' ? 'Netherissä' : 'ylämaailmassa') + ' — käytä portaalia ensin');
        } else {
          p.pos.x = p.home.x; p.pos.y = p.home.y; p.pos.z = p.home.z;
          p.vel = { x: 0, y: 0, z: 0 };
          p.peakY = p.pos.y;
          UI.toast('🏠 Teleporttasit kotiin');
          if (typeof Music !== 'undefined') Music.sfx('place');
        }
      }
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'endeye') {
      const sh = this.world.findNearestStronghold ? this.world.findNearestStronghold(p.pos.x, p.pos.z) : null;
      if (!sh) {
        UI.toast('Ei löytynyt strongholdia lähistöltä');
        return;
      }
      const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
      this.eyes.push(new EyeOfEnder(o.x, o.y + 0.4, o.z, sh, this));
      if (p.mode !== 'creative') p.consumeSelected(1);
      const d = Math.round(sh.dist);
      UI.toast('🌟 Silmä lentää kohti strongholdia (' + d + ' lohkoa)');
      Music.sfx('place');
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'warden_blaster') {
      // Conservation-lumous: mahdollisuus ohittaa panoskulutus
      const cons = enchantLevel(it, 'conservation');
      const skipAmmo = p.mode === 'creative' || (cons > 0 && Math.random() < cons * 0.25);
      if (!skipAmmo && !this._takeItem(I.SCULK_AMMO, 1)) {
        UI.toast('⚠ Tarvitset sculk-panoksen! Louhi sculk-lohkoja saadaksesi lisää.');
        return;
      }
      const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
      const sp = 80;
      const sonic = enchantLevel(it, 'sonic_power');
      const drill = enchantLevel(it, 'drill');
      const kb = enchantLevel(it, 'beam_knockback');
      const pierce = enchantLevel(it, 'piercing');
      const flame = enchantLevel(it, 'flame');
      const opts = {
        dmg: 40 + sonic * 15,
        drillR: 2 + drill,           // 2..5
        kbMul: 1 + kb * 1.5,         // 1..5.5
        pierce: pierce,              // # of mob hits before dying (0 = stop on first)
        fire: flame                  // Tuliaspekti-taso: sytyttää osuman palamaan
      };
      this.beams.push(new WardenBeam(o.x + d.x, o.y + d.y, o.z + d.z, d.x * sp, d.y * sp, d.z * sp, 'player', this, opts));
      Music.sfx('hurt');
      this.attackSwing = 1;
      UI.refresh();
      UI.toast(skipAmmo ? '💥 Warden-piimi (säästö)!' : '💥 Warden-piimi laukaistu!');
      // Shockwave enchantment: 15%×L chance to also blast all nearby mobs
      const shock = enchantLevel(it, 'shockwave');
      if (shock > 0 && Math.random() < shock * 0.15) {
        const R = 12;
        let hits = 0;
        for (const m of this.mobs) {
          if (m.dead) continue;
          const dx = m.pos.x - p.pos.x, dy = m.pos.y - p.pos.y, dz = m.pos.z - p.pos.z;
          if (Math.hypot(dx, dy, dz) > R) continue;
          m.takeDamage(opts.dmg, dx * 2, dz * 2, this);
          if (opts.fire > 0) m.ignite(opts.fire * 3 + 1);
          hits++;
        }
        // Visual: spawn wind charges in ring
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * Math.PI * 2;
          this.spawnWind(p.pos.x, p.pos.y + 0.5, p.pos.z, Math.cos(ang) * 8, 1, Math.sin(ang) * 8);
        }
        UI.toast('🌊 Säde-aalto osui ' + hits + ' mobiin!');
      }
      return;
    }
    if (def && def.type === 'sculkeye') {
      if (this.dimension !== 'overworld') { UI.toast('Sculk-silmä toimii vain ylämaailmassa'); return; }
      const ac = this.world.findNearestAncientCity ? this.world.findNearestAncientCity(p.pos.x, p.pos.z) : null;
      if (!ac) { UI.toast('Ei löytynyt Ancient Cityä lähistöltä'); return; }
      const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
      this.eyes.push(new EyeOfEnder(o.x, o.y + 0.4, o.z, ac, this, { skulk: true }));
      if (p.mode !== 'creative') p.consumeSelected(1);
      UI.toast('🌀 Sculk-silmä lentää kohti Ancient Cityä (' + Math.round(ac.dist) + ' lohkoa)');
      Music.sfx('place');
      this.attackSwing = 1;
      return;
    }
    if (def && def.type === 'bucket_empty') {
      const liq = this._raycastLiquid();
      if (liq) {
        const newId = liq.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET;
        this.world.setBlock(liq.block.x, liq.block.y, liq.block.z, B.AIR);
        if (p.mode === 'creative') p.give(newId, 1);
        else if (it.count > 1) { it.count--; p.give(newId, 1); }
        else p.inv[p.selected] = { id: newId, count: 1 };
        Music.sfx('place'); this.attackSwing = 1; UI.refresh();
      } else {
        UI.toast('Ei vettä eikä laavaa edessä');
      }
      return;
    }
    if (def && (def.type === 'bucket_water' || def.type === 'bucket_lava')) {
      if (rc.place) {
        const fluid = def.type === 'bucket_water' ? B.WATER : B.LAVA;
        this.world.setBlock(rc.place.x, rc.place.y, rc.place.z, fluid);
        if (p.mode !== 'creative') p.inv[p.selected] = { id: I.BUCKET, count: 1 };
        Music.sfx('place'); this.attackSwing = 1; UI.refresh();
      }
      return;
    }
    if (def && def.type === 'bow') {
      if (this.bowCD > 0) return;
      if (p.mode === 'creative' || this._takeItem(I.ARROW, 1)) {
        const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
        const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
        const power = enchantLevel(it, 'power');
        const arrowDmg = 5 + power * 1.5;
        const flame = enchantLevel(it, 'flame');
        this.spawnArrow(o.x + d.x, o.y + d.y, o.z + d.z, d.x * 34, d.y * 34 + 2, d.z * 34, 'player', arrowDmg, flame);
        this.bowCD = 0.5; this.attackSwing = 1; UI.refresh();
      } else UI.toast('Ei nuolia!');
      return;
    }
    if (def && def.type === 'enderpearl') {
      const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
      this.pearls.push(new EnderPearl(o.x + d.x * 0.6, o.y + d.y * 0.6, o.z + d.z * 0.6,
        d.x * 18, d.y * 18 + 1.5, d.z * 18, this));
      if (p.mode !== 'creative') p.consumeSelected(1);
      Music.sfx('place');
      this.attackSwing = 1; UI.refresh();
      return;
    }
    if (isBlockId(it.id) && rc.place) {
      if (!this._canPlaceAt(rc.place.x, rc.place.y, rc.place.z, it.id)) return;
      this.world.setBlock(rc.place.x, rc.place.y, rc.place.z, it.id);
      // Shulker-laatikon sisältö palautetaan uuteen laatikkoon (kestää myös objekti-muodon Firebasen jäljiltä)
      if (it.id === B.SHULKER_BOX && it.shulker) {
        const cont = this.world.getContainer(rc.place.x, rc.place.y, rc.place.z);
        if (cont) {
          const src = it.shulker;
          const arr = new Array(27).fill(null);
          for (let i = 0; i < 27; i++) {
            const s = Array.isArray(src) ? src[i] : (src[i] || src[String(i)]);
            arr[i] = s ? { id: s.id, count: s.count, ench: s.ench } : null;
          }
          cont.slots = arr;
        }
      }
      if (this.mp && this.mp.worldId) this._mpSend({ type: 'edit', x: rc.place.x, y: rc.place.y, z: rc.place.z, b: it.id, d: this.dimension });
      if (p.mode !== 'creative') p.consumeSelected(1);
      Music.sfx('place');
      this.attackSwing = 1;
      UI.refresh();
    }
  },

  _canPlaceAt(x, y, z, id) {
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER) return false;
    const def = BLOCKS[id];
    if (def && def.solid) {
      const p = this.player;
      if (x + 1 > p.pos.x - p.hw && x < p.pos.x + p.hw &&
        z + 1 > p.pos.z - p.hw && z < p.pos.z + p.hw &&
        y + 1 > p.pos.y && y < p.pos.y + p.height) return false;
    }
    return true;
  },

  _takeItem(id, n) {
    const inv = this.player.inv;
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = inv[i];
      if (s && s.id === id) { const d = Math.min(s.count, n); s.count -= d; n -= d; if (s.count <= 0) inv[i] = null; }
    }
    return n <= 0;
  },

  _mineTick(dt, rc) {
    const mw = document.getElementById('minebarWrap');
    if (!this.leftHeld || !rc.block || (rc.mob && rc.mdist < rc.bdist)) {
      this.mineTarget = null; this.mineProg = 0;
      mw.style.display = 'none';
      return;
    }
    const b = rc.block;
    const bid = this.world.getBlock(b.x, b.y, b.z);
    const bdef = BLOCKS[bid];
    if (!bdef || (bdef.hardness === Infinity && this.player.mode !== 'creative')) { mw.style.display = 'none'; return; }
    if (!this.mineTarget || this.mineTarget.x !== b.x || this.mineTarget.y !== b.y || this.mineTarget.z !== b.z) {
      this.mineTarget = { x: b.x, y: b.y, z: b.z }; this.mineProg = 0;
    }
    const it = this.player.currentItem();
    const toolId = it ? it.id : 0;
    const need = this.player.mode === 'creative' ? 0.001 : miningTime(bid, it);
    this.mineProg += dt;
    this.attackSwing = Math.max(this.attackSwing, 0.5);
    mw.style.display = 'block';
    document.getElementById('minebar').style.width = Math.min(100, this.mineProg / need * 100) + '%';
    if (this.mineProg >= need) {
      this._breakBlock(b.x, b.y, b.z, bid, toolId);
      this.mineTarget = null; this.mineProg = 0;
      mw.style.display = 'none';
    }
  },

  _breakBlock(x, y, z, bid, toolId) {
    const bdef = BLOCKS[bid];
    // Shulker-laatikko: säilyttää sisältönsä — pudottaa laatikon, jonka sisällä tavarat ovat (kuten Minecraftissa)
    if (bid === B.SHULKER_BOX) {
      const cont = this.world.getContainer(x, y, z);
      const slots = (cont && Array.isArray(cont.slots)) ? cont.slots : null;
      const contents = slots ? slots.map((s) => (s ? { id: s.id, count: s.count, ench: s.ench } : null)) : null;
      const hasItems = contents && contents.some((s) => s);
      this.world.containers.delete(x + ',' + y + ',' + z);
      this.world.setBlock(x, y, z, B.AIR);
      this.spawnBlockParticles(x + 0.5, y + 0.5, z + 0.5, bid, 10);
      if (this.mp && this.mp.worldId) this._mpSend({ type: 'edit', x, y, z, b: B.AIR, d: this.dimension });
      Music.sfx('dig'); this._registerNoise();
      // Pudotetaan AINA (myös creativessa) jottei sisältö katoa
      const stack = { id: B.SHULKER_BOX, count: 1 };
      if (hasItems) stack.shulker = contents;
      this.spawnDropStack(stack, x + 0.5, y + 0.5, z + 0.5);
      const n = hasItems ? contents.filter((s) => s).length : 0;
      UI.toast('📦 Shulker-laatikko (' + n + ' tavaraa sisällä)');
      return;
    }
    if (bid === B.CHEST || bid === B.FURNACE) {
      const cont = this.world.getContainer(x, y, z);
      if (cont) {
        const all = (cont.type === 'chest') ? cont.slots : [cont.input, cont.fuel, cont.output];
        if (Array.isArray(all)) for (const s of all) if (s) this.spawnDrop(s.id, s.count, x + 0.5, y + 0.5, z + 0.5);
      }
      this.world.containers.delete(x + ',' + y + ',' + z);
    }
    this.world.setBlock(x, y, z, B.AIR);
    this.spawnBlockParticles(x + 0.5, y + 0.5, z + 0.5, bid, 10);
    if (this.mp && this.mp.worldId) this._mpSend({ type: 'edit', x, y, z, b: B.AIR, d: this.dimension });
    Music.sfx('dig');
    this._registerNoise();
    if (this.player.mode === 'creative') return;
    // Pickaxe gate must happen even for special-drop blocks
    if (bdef.tool === 'pickaxe' && !canHarvest(bid, toolId)) return;
    // Hakun lumoukset: Sulatus (smelter) ja Silkkikosketus (silk_touch)
    const heldTool = this.player.currentItem();
    // Sulatus: malmi sulatetaan suoraan louhittaessa (rautamalmi → rautaharkko jne.)
    if (enchantLevel(heldTool, 'smelter') > 0) {
      const SMELTED = { [B.IRON_ORE]: I.IRON_INGOT, [B.GOLD_ORE]: I.GOLD_INGOT, [B.ANCIENT_DEBRIS]: I.NETHERITE_SCRAP };
      const out = SMELTED[bid];
      if (out !== undefined) {
        this.spawnDrop(out, 1, x + 0.5, y + 0.5, z + 0.5);
        this.player.addXP(1 + Math.floor(Math.random() * 2));
        return;
      }
    }
    // Silkkikosketus: pickaxe-lohko pudottaa itsensä (kivi → kivi, malmi → malmilohko)
    if (enchantLevel(heldTool, 'silk_touch') > 0 && bdef.tool === 'pickaxe'
        && bid !== B.BEDROCK && bid !== B.SPAWNER
        && bid !== B.CHEST && bid !== B.FURNACE && bid !== B.SHULKER_BOX) {
      this.spawnDrop(bid, 1, x + 0.5, y + 0.5, z + 0.5);
      return;
    }
    // Special drops with counts (sugar cane / bookshelf / lapis / ancient debris)
    if (bid === B.SUGAR_CANE) { this.spawnDrop(B.SUGAR_CANE, 1, x + 0.5, y + 0.5, z + 0.5); return; }
    if (bid === B.BOOKSHELF) { this.spawnDrop(I.BOOK, 3, x + 0.5, y + 0.5, z + 0.5); return; }
    if (bid === B.ANCIENT_DEBRIS) { this.spawnDrop(B.ANCIENT_DEBRIS, 1, x + 0.5, y + 0.5, z + 0.5); this.player.addXP(8 + Math.floor(Math.random() * 5)); return; }
    if (bid === B.EMERALD_ORE) {
      const fortune = enchantLevel(this.player.currentItem(), 'fortune');
      let count = 1;
      if (fortune > 0 && Math.random() < fortune / (fortune + 2)) count += 1 + Math.floor(Math.random() * fortune);
      this.spawnDrop(I.EMERALD, count, x + 0.5, y + 0.5, z + 0.5);
      this.player.addXP(3 + Math.floor(Math.random() * 5));
      return;
    }
    if (bid === B.LAPIS_ORE) {
      const fortune = enchantLevel(this.player.currentItem(), 'fortune');
      const base = 4 + Math.floor(Math.random() * 5); // 4-8
      const count = base * (1 + (fortune > 0 ? Math.floor(Math.random() * (fortune + 1)) : 0));
      this.spawnDrop(I.LAPIS, count, x + 0.5, y + 0.5, z + 0.5);
      this.player.addXP(2 + Math.floor(Math.random() * 4));
      return;
    }
    let dropId = bdef.drop !== undefined ? bdef.drop : bid;
    if (dropId === -1) return;
    if (bid === B.GRAVEL && Math.random() < 0.4) dropId = I.FLINT;
    if (bid === B.LEAVES) {
      const r = Math.random();
      if (r < 0.06) dropId = I.APPLE;
      else if (r < 0.14) dropId = I.STICK;
      else return;
    }
    // Fortune multiplier for ore-style single drops (coal, diamond)
    let count = 1;
    if (bid === B.COAL_ORE || bid === B.DIAMOND_ORE) {
      const fortune = enchantLevel(this.player.currentItem(), 'fortune');
      if (fortune > 0 && Math.random() < fortune / (fortune + 2)) count += 1 + Math.floor(Math.random() * fortune);
    }
    // Sculk-lohko muuntuu suoraan panoksiksi pelaajan reppuun — ei pöytää tai pudotusta
    if (bid === B.SCULK) {
      const leftover = this.player.give(I.SCULK_AMMO, 5);
      if (leftover > 0) this.spawnDrop(I.SCULK_AMMO, leftover, x + 0.5, y + 0.5, z + 0.5);
      UI.refresh();
      return;
    }
    this.spawnDrop(dropId, count, x + 0.5, y + 0.5, z + 0.5);
    // XP from mining ores
    const oreXP = { [B.COAL_ORE]: 1, [B.DIAMOND_ORE]: 5, [B.IRON_ORE]: 1, [B.GOLD_ORE]: 1, [B.QUARTZ_ORE]: 1 };
    if (oreXP[bid]) this.player.addXP(oreXP[bid] + Math.floor(Math.random() * 2));
  },

  _tryActivateEndPortal(block, it) {
    if (!it || it.id !== I.EYE_OF_ENDER) {
      UI.toast('Käytä Loppusilmää (Eye of Ender) — laita kehykseen');
      return;
    }
    // place eye in this frame
    this.world.setBlock(block.x, block.y, block.z, B.END_PORTAL_FRAME_LIT);
    if (this.player.mode !== 'creative') this.player.consumeSelected(1);
    Music.sfx('place');
    UI.refresh();
    // Check if all 12 frames around a 3×3 well are lit; find the well's center
    // Search nearby 12-frame ring patterns (within 4 blocks)
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const cx = block.x + dx, cy = block.y, cz = block.z + dz;
      if (this._isFullEndPortalRing(cx, cy, cz)) {
        // Light up portal in the 3×3 center
        for (let lx = -1; lx <= 1; lx++) for (let lz = -1; lz <= 1; lz++) {
          this.world.setBlock(cx + lx, cy, cz + lz, B.END_PORTAL);
        }
        UI.toast('🌌 Loppuportaali aktivoitui — astu sisään päästäksesi Loppuun!');
        Music.sfx('place');
        return;
      }
    }
    UI.toast('Silmä asetettu — täytä loput kehykset (' + this._countLitFramesNear(block) + '/12)');
  },

  _isFullEndPortalRing(cx, cy, cz) {
    // Pattern: frames at (cx±2, cy, cz-1..+1) and (cx-1..+1, cy, cz±2), 12 total
    for (let lx = -1; lx <= 1; lx++) {
      if (this.world.getBlock(cx + lx, cy, cz - 2) !== B.END_PORTAL_FRAME_LIT) return false;
      if (this.world.getBlock(cx + lx, cy, cz + 2) !== B.END_PORTAL_FRAME_LIT) return false;
    }
    for (let lz = -1; lz <= 1; lz++) {
      if (this.world.getBlock(cx - 2, cy, cz + lz) !== B.END_PORTAL_FRAME_LIT) return false;
      if (this.world.getBlock(cx + 2, cy, cz + lz) !== B.END_PORTAL_FRAME_LIT) return false;
    }
    return true;
  },

  _countLitFramesNear(block) {
    let n = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -3; dz <= 3; dz++) {
      if (this.world.getBlock(block.x + dx, block.y + dy, block.z + dz) === B.END_PORTAL_FRAME_LIT) n++;
    }
    return n;
  },

  _teleportEnd() {
    const p = this.player;
    for (const m of this.mobs) this.scene.remove(m.group);
    for (const d of this.drops) this.scene.remove(d.mesh);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    for (const w of this.winds) this.scene.remove(w.mesh);
    for (const pe of this.pearls) this.scene.remove(pe.mesh);
    for (const bm of this.beams) { this.scene.remove(bm.mesh); this.scene.remove(bm.glow); }
    this.mobs = []; this.drops = []; this.arrows = []; this.winds = []; this.eyes = []; this.pearls = []; this.beams = [];
    this.mineTarget = null; this.leftHeld = false; this.rightHeld = false;
    this.scene.remove(this.world.group);

    if (this.dimension === 'end') {
      // return from End to wherever we came from
      const r = this.endReturn || { x: 0.5, y: 60, z: 0.5, dim: 'overworld' };
      this.dimension = r.dim || 'overworld';
      this.world = this.dimension === 'nether' ? this.nether : this.overworld;
      p.pos = { x: r.x, y: r.y, z: r.z };
    } else {
      if (!this.end) this.end = new World((this.overworld.seed ^ 0xe71d) >>> 0, 'end', this.scene);
      this.endReturn = { x: p.pos.x, y: p.pos.y, z: p.pos.z, dim: this.dimension };
      this.dimension = 'end';
      this.world = this.end;
      p.pos = { x: 0.5, y: 44, z: 0.5 };
    }
    p.vel = { x: 0, y: 0, z: 0 };
    p.peakY = p.pos.y;
    this.portalTimer = 0;
    this.portalCooldown = 6;
    this.scene.add(this.world.group);
    document.getElementById('loadFill').style.width = '0%';
    document.getElementById('loading').classList.remove('hidden');
    this.state = 'loading';
    this._loadDone = () => this._finishEndTeleport();
    this._loadStep();
  },

  _finishEndTeleport() {
    document.getElementById('loading').classList.add('hidden');
    this.state = 'play';
    UI.refresh();
    if (this.dimension === 'end') {
      UI.toast('Tervetuloa Loppuun. Tuhoa kristallit ensin, sitten tapa Ender-lohikäärme! 🐉');
      const w = this.world;
      // Build crystal towers + permanent return portal ONLY once per world so player builds aren't overwritten
      if (!this.endStructuresBuilt) {
        const N = 6;
        for (let i = 0; i < N; i++) {
          const ang = (i / N) * Math.PI * 2;
          const tx = Math.round(Math.cos(ang) * 35);
          const tz = Math.round(Math.sin(ang) * 35);
          this._buildCrystalTower(w, tx, tz);
        }
        this._buildEndReturnPortal(w, 15, 43, 0);
        this.endStructuresBuilt = true;
      }
      // Dragon + crystals (entities, not blocks) respawn each visit until dragon is defeated
      if (!this.dragonDefeated) {
        const dragon = new Mob('ender_dragon', 0.5, 70, 30.5, this);
        this.mobs.push(dragon);
        const N = 6;
        for (let i = 0; i < N; i++) {
          const ang = (i / N) * Math.PI * 2;
          const tx = Math.round(Math.cos(ang) * 35);
          const tz = Math.round(Math.sin(ang) * 35);
          this.mobs.push(new Mob('end_crystal', tx + 0.5, 51, tz + 0.5, this));
        }
      }
      // Spawn shulkers around End cities
      this._spawnEndCityShulkers();
    } else {
      UI.toast('Palasit ' + (this.dimension === 'nether' ? 'Netheriin' : 'ylämaailmaan') + '!');
    }
    this._lock();
  },

  _buildEndReturnPortal(w, cx, cy, cz) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      w.setBlock(cx + dx, cy, cz + dz, B.OBSIDIAN);
    }
    w.setBlock(cx, cy + 1, cz, B.END_PORTAL);
    // light-up purpur frame so player can find it
    for (const [ox, oz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      w.setBlock(cx + ox, cy + 1, cz + oz, B.PURPUR_BLOCK);
      w.setBlock(cx + ox, cy + 2, cz + oz, B.GLOWSTONE);
    }
  },

  _spawnEndCityShulkers() {
    if (!this.world || !this.world.endCities) return;
    const p = this.player;
    for (const c of this.world.endCities) {
      const dist = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      // Salli uudelleenkutu kun pelaaja on kaukana (muuten ne eivät palaa jos ne ehtivät kadota)
      if (c.shulkersSpawned && dist > 150) { c.shulkersSpawned = false; continue; }
      if (c.shulkersSpawned) continue;
      // spawn when the player is reasonably near so we don't dump entities all over the world
      if (dist > 90) continue;
      const positions = [[c.x - 10, 52, c.z - 10], [c.x + 10, 52, c.z - 10], [c.x - 10, 52, c.z + 10], [c.x + 10, 52, c.z + 10], [c.x, 52, c.z]];
      for (const [sx, sy, sz] of positions) {
        this.mobs.push(new Mob('shulker', sx + 0.5, sy, sz + 0.5, this));
      }
      c.shulkersSpawned = true;
    }
  },

  _buildCrystalTower(world, x, z) {
    // 7-block obsidian pillar from y=43 to y=49 with iron bar-like cage on top
    for (let y = 43; y <= 49; y++) world.setBlock(x, y, z, B.OBSIDIAN);
    // base block for the crystal
    world.setBlock(x, 50, z, B.END_CRYSTAL_BASE);
  },

  onBossDefeated(boss) {
    if (boss.type !== 'ender_dragon') return;
    this.dragonDefeated = true;
    // Build the return portal of bedrock with a portal in middle
    const w = this.world;
    const cx = 0, cy = 43, cz = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      w.setBlock(cx + dx, cy, cz + dz, B.OBSIDIAN);
    }
    w.setBlock(cx, cy + 1, cz, B.END_PORTAL);
    // Show victory overlay
    this.state = 'victory';
    document.getElementById('overlayTitle').textContent = '🎉 Voitit pelin! 🎉';
    document.getElementById('overlayTitle').style.color = '#ffd24a';
    document.getElementById('resumeBtn').textContent = 'Jatka tutkimista';
    document.getElementById('menuBtn').textContent = 'Palaa valikkoon';
    document.getElementById('overlay').classList.remove('hidden');
    document.exitPointerLock();
    UI.toast('Onneksi olkoon — Ender-lohikäärme on kukistettu! Loppuportaali avautui keskelle.');
    if (typeof Music !== 'undefined') Music.sfx('levelup');
  },

  _sleep() {
    if (this.dimension === 'nether') { UI.toast('Netherissä ei voi nukkua'); return; }
    if (this.isDaylight()) { UI.toast('Voit nukkua vain yöllä'); return; }
    this.time = 0.04;
    this.dayCount++;
    this.player.heal(20);
    for (const m of this.mobs) if (m.cfg.hostile) { m.dead = true; this.scene.remove(m.group); }
    this.mobs = this.mobs.filter((m) => !m.dead);
    const p = this.player;
    p.spawn = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    UI.toast('Hyvät unet — aamu koitti ☀');
    if (typeof Music !== 'undefined') Music.sfx('eat');
    this.attackSwing = 1;
    UI.refresh();
  },

  _isVillageArea(x, z) {
    if (!this.world || !this.world.villageCenters) return false;
    for (const k of this.world.villageCenters) {
      const pp = k.split(',');
      const vx = +pp[0], vz = +pp[1];
      if (Math.hypot(vx - x, vz - z) < 48) return true;
    }
    return false;
  },

  /* ---------------- spawning ---------------- */
  spawnDrop(id, count, x, y, z) { if (count > 0) this.drops.push(new DroppedItem(id, count, x, y, z, this)); },
  spawnDropStack(stack, x, y, z) {
    if (!stack || stack.count <= 0) return;
    const di = new DroppedItem(stack.id, stack.count, x, y, z, this);
    if (stack.shulker) di.data = { shulker: stack.shulker };
    if (stack.ench) di.data = Object.assign(di.data || {}, { ench: stack.ench });
    this.drops.push(di);
  },

  _dropCurrentItem(n) {
    const p = this.player;
    const it = p.currentItem();
    if (!it) return;
    const drop = Math.min(n, it.count);
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    const x = p.pos.x + d.x * 0.5;
    const y = p.pos.y + p.eye - 0.4;
    const z = p.pos.z + d.z * 0.5;
    const di = new DroppedItem(it.id, drop, x, y, z, this);
    di.vel = { x: d.x * 7, y: 2.4 + d.y * 4, z: d.z * 7 };
    di.pickupDelay = 1.2;
    this.drops.push(di);
    it.count -= drop;
    if (it.count <= 0) p.inv[p.selected] = null;
    UI.refresh();
    if (typeof Music !== 'undefined') Music.sfx('place');
  },
  spawnArrow(x, y, z, vx, vy, vz, owner, dmg, fire, levitate) { this.arrows.push(new Arrow(x, y, z, vx, vy, vz, owner, this, dmg, fire, levitate)); },
  spawnWind(x, y, z, vx, vy, vz) { this.winds.push(new WindCharge(x, y, z, vx, vy, vz, this)); },

  hurtPlayer(dmg, fromX, fromZ, cause, attacker) {
    if (!this.player.alive) return;
    // Shield blocking: damage reduction depends on shield tier (voi torjua kokonaan)
    if (this._isBlocking()) {
      // Shulker-kilpi: lyöjä alkaa leijua 5 s
      const sh = this._activeShieldItem();
      if (sh && defOf(sh.id) && defOf(sh.id).shulkerShield && attacker && attacker.levitate) {
        attacker.levitate(5);
      }
      dmg = Math.floor(dmg * this._shieldMul());
      if (dmg <= 0) {
        // Täysi torjunta — ei vahinkoa
        Music.sfx('hurt');
        const hf0 = document.getElementById('hitflash');
        if (hf0) { hf0.style.opacity = '0.2'; setTimeout(() => { hf0.style.opacity = '0'; }, 90); }
        return;
      }
      if (cause) cause = cause + ' (kilpi torjui)';
    }
    this.player.hurt(dmg, fromX, fromZ, cause);
    Music.sfx('hurt');
    const hf = document.getElementById('hitflash');
    hf.style.opacity = '0.55';
    setTimeout(() => { hf.style.opacity = '0'; }, 130);
    if (!this.player.alive) {
      this.state = 'dead';
      const cz = this.player.lastDamageCause || 'tuntematon';
      const px = Math.floor(this.player.pos.x), py = Math.floor(this.player.pos.y), pz = Math.floor(this.player.pos.z);
      this._showOverlay('Kuolit! 💀\nSyy: ' + cz + '\nPaikka: (' + px + ', ' + py + ', ' + pz + ')', true);
      document.exitPointerLock();
    }
  },

  explode(x, y, z, r) {
    const ri = Math.ceil(r);
    for (let dx = -ri; dx <= ri; dx++) for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const id = this.world.getBlock(bx, by, bz);
      if (id === B.TNT) {
        // chain reaction: light the TNT instead of destroying it
        if (this.world.tntFuses) this.world.tntFuses.set(bx + ',' + by + ',' + bz, 0.4 + Math.random() * 0.6);
      } else if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK) {
        this.world.setBlock(bx, by, bz, B.AIR);
      }
    }
    const pd = Math.hypot(this.player.pos.x - x, this.player.pos.y - y, this.player.pos.z - z);
    if (pd < r + 2) this.hurtPlayer(Math.ceil((r + 2 - pd) * 3), x, z, 'räjähdys');
    for (const m of this.mobs) {
      if (m.dead) continue;
      const md = Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z);
      if (md < r + 1.5) m.takeDamage((r + 1.5 - md) * 5, m.pos.x - x, m.pos.z - z, this);
    }
  },
  isDaylight() { return this.dimension !== 'nether' && Math.sin(this.time * Math.PI * 2) > 0.02; },

  /* ---------------- nether teleport ---------------- */
  _teleport() {
    const p = this.player;
    this.portalTimer = 0;
    for (const m of this.mobs) this.scene.remove(m.group);
    for (const d of this.drops) this.scene.remove(d.mesh);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    for (const w of this.winds) this.scene.remove(w.mesh);
    for (const pe of this.pearls) this.scene.remove(pe.mesh);
    for (const bm of this.beams) { this.scene.remove(bm.mesh); this.scene.remove(bm.glow); }
    this.mobs = []; this.drops = []; this.arrows = []; this.winds = []; this.eyes = []; this.pearls = []; this.beams = [];
    this.mineTarget = null; this.leftHeld = false; this.rightHeld = false;
    this.scene.remove(this.world.group);

    if (this.dimension === 'overworld') {
      this.netherReturn = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      if (!this.nether) this.nether = new World((this.overworld.seed ^ 0x9e3a) >>> 0, 'nether', this.scene);
      this.dimension = 'nether';
      this.world = this.nether;
      p.pos = { x: Math.round(p.pos.x / 6) + 0.5, y: 58, z: Math.round(p.pos.z / 6) + 0.5 };
      this._teleportBuild = true;
    } else {
      this.dimension = 'overworld';
      this.world = this.overworld;
      const r = this.netherReturn || { x: 0.5, y: 50, z: 0.5 };
      p.pos = { x: r.x, y: r.y, z: r.z };
      this._teleportBuild = false;
    }
    this.scene.add(this.world.group);
    p.vel = { x: 0, y: 0, z: 0 };
    this.portalCooldown = 6;
    document.getElementById('loadFill').style.width = '0%';
    document.getElementById('loading').classList.remove('hidden');
    this.state = 'loading';
    this._loadDone = () => this._finishTeleport();
    this._loadStep();
  },

  _respawnToOverworld() {
    const p = this.player;
    const wasOtherDim = this.dimension !== 'overworld';
    for (const m of this.mobs) if (m.cfg.hostile) { m.dead = true; this.scene.remove(m.group); }
    this.mobs = this.mobs.filter((m) => !m.dead);
    this.mineTarget = null; this.mineProg = 0;
    this.leftHeld = this.rightHeld = false;
    this._hideOverlay();
    if (wasOtherDim) {
      this.drops = []; this.arrows = []; this.winds = []; this.eyes = []; this.pearls = [];
      this.scene.remove(this.world.group);
      this.dimension = 'overworld';
      this.world = this.overworld;
      this.scene.add(this.world.group);
      p.respawn();
      this.portalCooldown = 6;
      document.getElementById('loadFill').style.width = '0%';
      document.getElementById('loading').classList.remove('hidden');
      this.state = 'loading';
      this._loadDone = () => {
        document.getElementById('loading').classList.add('hidden');
        this.state = 'play';
        UI.refresh();
        UI.toast('Takaisin ylämaailmaan!');
        this._lock();
      };
      this._loadStep();
    } else {
      p.respawn();
      this.state = 'play';
      UI.refresh();
      this._lock();
    }
  },

  _finishTeleport() {
    const p = this.player, w = this.world;
    if (this._teleportBuild) {
      const tx = Math.floor(p.pos.x), tz = Math.floor(p.pos.z);
      const ty = this._findPortalY(w, tx, tz);
      this._buildArrivalPortal(w, tx, ty, tz);
      p.pos = { x: tx + 0.5, y: ty + 1, z: tz + 0.5 };
    }
    p.vel = { x: 0, y: 0, z: 0 };
    p.peakY = p.pos.y;
    this.portalCooldown = 6;
    document.getElementById('loading').classList.add('hidden');
    this.state = 'play';
    UI.refresh();
    UI.toast(this.dimension === 'nether' ? 'Tervetuloa Netheriin! 🔥' : 'Takaisin ylämaailmaan!');
    this._lock();
  },

  _findPortalY(w, x, z) {
    for (let y = WORLD_H - 9; y > 8; y--) {
      const b = w.getBlock(x, y, z);
      if (b !== B.AIR && b !== B.LAVA && isSolid(b)) {
        let clear = true;
        for (let k = 1; k <= 5; k++) if (isSolid(w.getBlock(x, y + k, z))) { clear = false; break; }
        if (clear) return y;
      }
    }
    return 40;
  },

  _buildArrivalPortal(w, x, y, z) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
      w.setBlock(x + dx, y, z + dz, B.NETHERRACK);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
      for (let dy = 1; dy <= 6; dy++)
        if (w.getBlock(x + dx, y + dy, z + dz) !== B.AIR) w.setBlock(x + dx, y + dy, z + dz, B.AIR);
    const oy = y + 1;
    for (let dz = -1; dz <= 2; dz++) { w.setBlock(x, oy - 1, z + dz, B.OBSIDIAN); w.setBlock(x, oy + 3, z + dz, B.OBSIDIAN); }
    for (let dy = 0; dy <= 2; dy++) { w.setBlock(x, oy + dy, z - 1, B.OBSIDIAN); w.setBlock(x, oy + dy, z + 2, B.OBSIDIAN); }
    for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 2; dy++) w.setBlock(x, oy + dy, z + dz, B.PORTAL);
  },

  _trySpawn(hostile, rmin, rmax) {
    if (!this.world) return;
    const p = this.player;
    const ang = Math.random() * Math.PI * 2;
    const r = rmin + Math.random() * (rmax - rmin);
    const x = Math.floor(p.pos.x + Math.cos(ang) * r);
    const z = Math.floor(p.pos.z + Math.sin(ang) * r);
    const ch = this.world.getChunk(Math.floor(x / CH), Math.floor(z / CH));
    if (!ch || !ch.generated) return;
    let y = WORLD_H - 3;
    while (y > 2 && !isSolid(this.world.getBlock(x, y, z))) y--;
    if (this.world.getBlock(x, y, z) === B.WATER || y <= SEA - 3) return;
    if (this.world.getBlock(x, y + 1, z) !== B.AIR || this.world.getBlock(x, y + 2, z) !== B.AIR) return;
    let type;
    if (this.dimension === 'end') return; // only dragon in End
    if (this.dimension === 'nether') {
      if (!hostile) return; // no passive mobs in nether
      type = ['blaze', 'zombie'][(Math.random() * 2) | 0];
    } else if (hostile) {
      type = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'][(Math.random() * 5) | 0];
    } else if (this._isVillageArea(x, z) && Math.random() < 0.65) {
      type = 'villager';
    } else {
      type = ['pig', 'cow', 'sheep', 'chicken', 'rabbit', 'lizard', 'sloth', 'fox', 'wolf', 'frog'][(Math.random() * 10) | 0];
    }
    this.mobs.push(new Mob(type, x + 0.5, y + 1, z + 0.5, this));
  },

  _spawnTick(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.5;
    if (this.dimension === 'end') { this._spawnEndCityShulkers(); return; }
    let animals = 0, monsters = 0;
    for (const m of this.mobs) { if (m.dead) continue; if (m.cfg.hostile) monsters++; else animals++; }
    const night = !this.isDaylight() || this.dimension === 'nether';
    if (night && monsters < 14) this._trySpawn(true, 14, 30);
    if (!night && animals < 9 && this.dimension !== 'nether') this._trySpawn(false, 14, 34);
  },

  _sculkAutoConvert() {
    // Sculk-lohkot ja -panokset eivät saa jäädä reppuun (sculk-lohko) tai kursoriin.
    //   sculk-lohko → 5 panosta lohkoa kohden suoraan reppuun
    //   sculk-panos kursorissa → siirry reppuun
    // Ei koskaan kierrätetä sculkkia takaisin (estää ikuisen silmukan kun reppu on täynnä).
    const p = this.player;
    if (!p) return;
    let totalSculk = 0;
    for (let i = 0; i < 36; i++) {
      const s = p.inv[i];
      if (s && s.id === B.SCULK) { totalSculk += s.count; p.inv[i] = null; }
    }
    if (UI.cursor && UI.cursor.id === B.SCULK) {
      totalSculk += UI.cursor.count;
      UI.cursor = null;
    }
    let changed = false;
    if (totalSculk > 0) {
      const ammoCount = totalSculk * 5;
      const leftover = p.give(I.SCULK_AMMO, ammoCount);
      if (leftover > 0 && this.player.pos) {
        // Reppu täynnä → tiputetaan ylimäärä maahan ammuksina (ei sculkkina)
        this.spawnDrop(I.SCULK_AMMO, leftover, p.pos.x, p.pos.y + 0.4, p.pos.z);
      }
      changed = true;
    }
    // HUOM: sculk-panoksia EI enää siirretä pois kursorista — muuten niitä ei voi
    // laittaa arkkuun (kursorissa pitäminen on normaalia tavaroiden siirtoa).
    if (changed) UI.refresh();
  },

  _tntTick(dt) {
    if (!this.world || !this.world.tntFuses || this.world.tntFuses.size === 0) return;
    const ready = [];
    for (const [k, t] of this.world.tntFuses) {
      const nt = t - dt;
      if (nt <= 0) ready.push(k);
      else this.world.tntFuses.set(k, nt);
    }
    for (const k of ready) {
      const [x, y, z] = k.split(',').map(Number);
      this.world.tntFuses.delete(k);
      if (this.world.getBlock(x, y, z) === B.TNT) {
        this.world.setBlock(x, y, z, B.AIR);
        this.explode(x + 0.5, y + 0.5, z + 0.5, 4);
        Music.sfx('hurt');
      }
    }
  },

  _fireTick(dt) {
    if (!this.world || !this.world.fireTimers || this.world.fireTimers.size === 0) return;
    const done = [];
    for (const [k, t] of this.world.fireTimers) {
      const nt = t - dt;
      if (nt <= 0) done.push(k);
      else this.world.fireTimers.set(k, nt);
    }
    for (const k of done) {
      this.world.fireTimers.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (this.world.getBlock(x, y, z) !== B.FIRE) continue;
      // Helvetinkiven päällä tuli ei sammu — muuten se häviää
      if (this.world.getBlock(x, y - 1, z) === B.NETHERRACK) continue;
      this.world.setBlock(x, y, z, B.AIR);
      if (this.mp && this.mp.worldId) this._mpSend({ type: 'edit', x, y, z, b: B.AIR, d: this.dimension });
    }
  },

  _spawnerTick(dt) {
    if (this.dimension !== 'nether' || !this.world) return;
    this.spawnerTimer -= dt;
    if (this.spawnerTimer > 0) return;
    this.spawnerTimer = 3.0;
    const p = this.player;
    const range = 16, range2 = range * range;
    for (const key of this.world.spawners) {
      const parts = key.split(',');
      const sx = +parts[0], sy = +parts[1], sz = +parts[2];
      // Verify block still exists (was not mined)
      if (this.world.getBlock(sx, sy, sz) !== B.SPAWNER) { this.world.spawners.delete(key); continue; }
      const dx = sx + 0.5 - p.pos.x, dz = sz + 0.5 - p.pos.z, dy = sy - p.pos.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > range2) continue;
      // Cap nearby blazes per spawner
      let nearBlaze = 0;
      for (const m of this.mobs) {
        if (m.dead || m.type !== 'blaze') continue;
        const ex = m.pos.x - (sx + 0.5), ez = m.pos.z - (sz + 0.5), ey = m.pos.y - sy;
        if (ex * ex + ey * ey + ez * ez < 14 * 14) nearBlaze++;
      }
      if (nearBlaze >= 4) continue;
      // Find an open spot adjacent to the spawner
      const offsets = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1]];
      for (const o of offsets) {
        const bx = sx + o[0], bz = sz + o[2];
        if (this.world.getBlock(bx, sy, bz) !== B.AIR) continue;
        if (this.world.getBlock(bx, sy + 1, bz) !== B.AIR) continue;
        this.mobs.push(new Mob('blaze', bx + 0.5, sy, bz + 0.5, this));
        break;
      }
    }
  },

  /* ---------------- main loop ---------------- */
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (this.isTouch && this._tcRoot) this._tcRoot.classList.toggle('hidden', this.state !== 'play');
    if (this.state === 'play') this._step(dt);
    if ((this.state === 'play' || this.state === 'inventory') && this.world) {
      for (const c of this.world.containers.values()) {
        if (c.type === 'furnace') this._tickFurnace(c, dt);
        else if (c.type === 'brewing') this._tickBrewing(c, dt);
      }
      this._sculkAutoConvert();
    }
    if (this.state === 'inventory') UI.tickFurnaceUI();
    this._updateParticles(dt);
    const inGame = this.state === 'play' || this.state === 'inventory' || this.state === 'pause' || this.state === 'dead';
    if (inGame && this.world) this._render();
    else this._renderMenu(dt);
  },

  _step(dt) {
    const p = this.player;
    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) { this.time -= 1; this.dayCount++; }

    const t = this.touch;
    const input = {
      fwd: !!this.keys.KeyW || t.fwd, back: !!this.keys.KeyS || t.back,
      left: !!this.keys.KeyA || t.left, right: !!this.keys.KeyD || t.right,
      jump: !!this.keys.Space || t.jump, sneak: !!(this.keys.ShiftLeft || this.keys.ShiftRight) || t.sneak,
      sprint: !!(this.keys.ControlLeft || this.keys.ControlRight || (this._wSprint && this.keys.KeyW)) || t.sprint || this._touchSprintLock
    };
    p.update(dt, input, this);
    if (!p.alive) {
      this.state = 'dead';
      const cz = this.player.lastDamageCause || 'tuntematon';
      const px = Math.floor(this.player.pos.x), py = Math.floor(this.player.pos.y), pz = Math.floor(this.player.pos.z);
      this._showOverlay('Kuolit! 💀\nSyy: ' + cz + '\nPaikka: (' + px + ', ' + py + ', ' + pz + ')', true);
      document.exitPointerLock();
      return;
    }

    this.camera.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();

    this.world.update(p.pos.x, p.pos.z, 2, 2);

    // nether portal
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const blockHere = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.9), Math.floor(p.pos.z));
    const inPortal = blockHere === B.PORTAL;
    const inEnd = blockHere === B.END_PORTAL;
    if (inPortal && this.portalCooldown <= 0) {
      this.portalTimer += dt;
      if (this.portalTimer >= 1.0) { this._teleport(); return; }
    } else if (inEnd && this.portalCooldown <= 0) {
      this.portalTimer += dt;
      if (this.portalTimer >= 0.5) { this._teleportEnd(); return; }
    } else if (!inPortal && !inEnd) this.portalTimer = 0;

    const rc = this._raycast();
    if (rc.block) {
      this.selBox.visible = true;
      this.selBox.position.set(rc.block.x + 0.5, rc.block.y + 0.5, rc.block.z + 0.5);
    } else this.selBox.visible = false;
    this._mineTick(dt, rc);
    this.bowCD = Math.max(0, this.bowCD - dt);

    for (const m of this.mobs) m.update(dt, this);
    for (const d of this.drops) d.update(dt, this);
    for (const a of this.arrows) a.update(dt, this);
    for (const w of this.winds) w.update(dt, this);
    for (const ey of this.eyes) ey.update(dt, this);
    for (const pe of this.pearls) pe.update(dt, this);
    for (const bm of this.beams) bm.update(dt, this);
    for (const m of this.mobs) {
      if (m.dead) continue;
      const md = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      // Shulkerit ovat paikallaan pysyviä End Cityjen vartijoita — ei karsita lähietäisyydellä
      if (m.type === 'shulker') { if (md > 120) { m.dead = true; this.scene.remove(m.group); } }
      else if (m.cfg.hostile && (md > 56 || (this.isDaylight() && md > 34))) { m.dead = true; this.scene.remove(m.group); }
      else if (!m.cfg.hostile && md > 88) { m.dead = true; this.scene.remove(m.group); }
    }
    this.mobs = this.mobs.filter((m) => !m.dead);
    this.drops = this.drops.filter((d) => !d.dead);
    this.arrows = this.arrows.filter((a) => !a.dead);
    this.winds = this.winds.filter((w) => !w.dead);
    this.eyes = this.eyes.filter((e) => !e.dead);
    this.pearls = this.pearls.filter((pe) => !pe.dead);
    this.beams = this.beams.filter((b) => !b.dead);
    this._spawnTick(dt);
    this._spawnerTick(dt);
    this._tntTick(dt);
    this._fireTick(dt);
    if (UI.setBurning) UI.setBurning(p.fireTimer > 0 && p.alive);

    this._updateSky();
    this._updateHeld(dt);

    UI.refresh();
    UI.setClock(this.dayCount, this.isDaylight(), this.time);
    UI.setCoords(p.pos.x, p.pos.y, p.pos.z);
    // Boss bar: show whenever there's a live boss in this dimension
    let boss = null;
    for (const m of this.mobs) { if (!m.dead && m.cfg.boss) { boss = m; break; } }
    UI.setBoss(boss);

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 45; this.saveCurrent(true); }
  },

  _tickBrewing(b, dt) {
    // Polttoaine (liekkijauhe) ei ole enää pakollinen — sen kanssa haudutus on nopeampi
    const ready = b.water && b.ingredient && BREWING[b.ingredient.id] !== undefined && !b.output;
    if (!ready) { b.brew = 0; return; }
    const speed = (b.fuel && b.fuel.count > 0) ? 2 : 1;   // liekkijauhe tuplaa nopeuden
    b.brew += dt * speed;
    if (b.brew >= 10) {
      b.brew = 0;
      const out = BREWING[b.ingredient.id];
      b.output = { id: out, count: 1 };
      b.water = null;
      b.ingredient.count--; if (b.ingredient.count <= 0) b.ingredient = null;
      if (b.fuel) { b.fuel.count--; if (b.fuel.count <= 0) b.fuel = null; }
    }
  },

  _tickFurnace(f, dt) {
    const out = f.input ? smeltResult(f.input.id) : 0;
    const canPut = out && (!f.output || (f.output.id === out && f.output.count < stackMax(out)));
    if (f.burn > 0) { f.burn -= dt; if (f.burn < 0) f.burn = 0; }
    if (canPut) {
      if (f.burn <= 0 && f.fuel && fuelValue(f.fuel.id) > 0) {
        f.burnMax = fuelValue(f.fuel.id) * SMELT_TIME;
        f.burn = f.burnMax;
        f.fuel.count--; if (f.fuel.count <= 0) f.fuel = null;
      }
      if (f.burn > 0) {
        f.cook += dt;
        if (f.cook >= SMELT_TIME) {
          f.cook -= SMELT_TIME;
          f.input.count--; if (f.input.count <= 0) f.input = null;
          if (f.output) f.output.count++; else f.output = { id: out, count: 1 };
        }
      } else f.cook = 0;
    } else f.cook = 0;
  },

  _initParticles() {
    this.particles = [];
    this._partGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  },
  _blockParticleColor(blockId) {
    const M = {
      [B.STONE]: 0x888888, [B.COBBLE]: 0x7a7a7a, [B.DIRT]: 0x8b6914,
      [B.GRASS]: 0x6abb45, [B.SAND]: 0xe0c98a, [B.SANDSTONE]: 0xd8c280,
      [B.LOG]: 0x5d3a1a, [B.PLANKS]: 0xb98a4b, [B.LEAVES]: 0x4aa036,
      [B.GLASS]: 0xc4ecf6, [B.COAL_ORE]: 0x222, [B.IRON_ORE]: 0xd3a583,
      [B.GOLD_ORE]: 0xf4d24b, [B.DIAMOND_ORE]: 0x52e6dd, [B.LAPIS_ORE]: 0x2a4ac8,
      [B.EMERALD_ORE]: 0x1ea05e, [B.NETHERRACK]: 0x6e2b2b, [B.SOUL_SAND]: 0x4f3b2e,
      [B.OBSIDIAN]: 0x140820, [B.ANCIENT_DEBRIS]: 0x5a3220, [B.ICE]: 0xc4e6f4,
      [B.GLOWSTONE]: 0xffd24a, [B.SNOW]: 0xffffff, [B.GRAVEL]: 0x7a7268,
      [B.END_STONE]: 0xe8dab0, [B.PURPUR_BLOCK]: 0xa040c0, [B.NETHERITE_BLOCK]: 0x3a3438,
      [B.ENDERITE_BLOCK]: 0x1a0a26, [B.IRON_BLOCK]: 0xd4d4d4, [B.GOLD_BLOCK]: 0xfbe25a,
      [B.LAPIS_BLOCK]: 0x2a4ac8, [B.TNT]: 0xbd2c1c, [B.WOOL]: 0xeeeeee
    };
    return M[blockId] || 0x888888;
  },
  spawnBlockParticles(x, y, z, blockId, n) {
    if (!this.particles) return;
    n = n || 7;
    const col = this._blockParticleColor(blockId);
    const mat = new THREE.MeshBasicMaterial({ color: col });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(this._partGeo, mat);
      p.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.2 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      p.userData = {
        vel: { x: (Math.random() - 0.5) * 3, y: Math.random() * 4 + 1.5, z: (Math.random() - 0.5) * 3 },
        life: 0.7 + Math.random() * 0.5
      };
      this.scene.add(p);
      this.particles.push(p);
    }
  },
  _updateParticles(dt) {
    if (!this.particles) return;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.vel.y -= 18 * dt;
      p.position.x += p.userData.vel.x * dt;
      p.position.y += p.userData.vel.y * dt;
      p.position.z += p.userData.vel.z * dt;
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.particles.splice(i, 1);
      }
    }
  },

  _initSkyObjects() {
    // Sun (yellow square)
    const sunCv = document.createElement('canvas'); sunCv.width = 32; sunCv.height = 32;
    const sunCtx = sunCv.getContext('2d');
    sunCtx.fillStyle = '#fff5b0'; sunCtx.fillRect(0, 0, 32, 32);
    sunCtx.fillStyle = '#ffe06a';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 15.5) sunCtx.clearRect(x, y, 1, 1);
      else if (d > 12) sunCtx.fillRect(x, y, 1, 1);
    }
    const sunTex = new THREE.CanvasTexture(sunCv);
    sunTex.magFilter = THREE.NearestFilter;
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    this.scene.add(this.sunMesh);

    // Moon (white-grey square with crater spots)
    const moonCv = document.createElement('canvas'); moonCv.width = 32; moonCv.height = 32;
    const moonCtx = moonCv.getContext('2d');
    moonCtx.fillStyle = '#e8eaf0';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d <= 15.5) moonCtx.fillRect(x, y, 1, 1);
    }
    moonCtx.fillStyle = '#b8c0cc';
    for (const [cx, cy, cr] of [[10, 12, 3], [22, 18, 2], [16, 22, 2.5]]) {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (Math.hypot(x - cx, y - cy) < cr) moonCtx.fillRect(x, y, 1, 1);
      }
    }
    const moonTex = new THREE.CanvasTexture(moonCv);
    moonTex.magFilter = THREE.NearestFilter;
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 32),
      new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false }));
    this.scene.add(this.moonMesh);

    // Cloud layer: tiled plane at y=110 with noisy white squares
    const cloudSize = 128;
    const cloudCv = document.createElement('canvas'); cloudCv.width = cloudSize; cloudCv.height = cloudSize;
    const cCtx = cloudCv.getContext('2d');
    cCtx.clearRect(0, 0, cloudSize, cloudSize);
    // Random cloud blobs as overlapping squares
    cCtx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 18; i++) {
      const cx = Math.random() * cloudSize, cy = Math.random() * cloudSize;
      const w = 18 + Math.random() * 26, h = 8 + Math.random() * 14;
      cCtx.fillRect(cx | 0, cy | 0, w | 0, h | 0);
      // chunky extra bumps
      cCtx.fillRect((cx + w * 0.3) | 0, (cy - 4) | 0, (w * 0.5) | 0, (h * 0.7) | 0);
    }
    const cloudTex = new THREE.CanvasTexture(cloudCv);
    cloudTex.wrapS = THREE.RepeatWrapping; cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.magFilter = THREE.NearestFilter;
    cloudTex.repeat.set(8, 8);
    this.cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: true, opacity: 0.85 }));
    this.cloudMesh.rotation.x = -Math.PI / 2;
    this.cloudMesh.position.set(0, 110, 0);
    this.scene.add(this.cloudMesh);
    this._cloudOffset = 0;
  },

  _updateSky() {
    const far = (this.world.renderDist - 0.5) * CH;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(0x88c4ee, far * 0.45, far);
    if (this.dimension === 'nether') {
      this.sun.intensity = 0;
      this.ambient.intensity = 0.66;
      this.hemi.intensity = 0.32;
      const sky = new THREE.Color(0x2a0c0c);
      this.scene.fog.near = 6; this.scene.fog.far = far;
      this.scene.fog.color.copy(sky);
      this.scene.background = sky;
      return;
    }
    if (this.dimension === 'end') {
      this.sun.intensity = 0;
      this.ambient.intensity = 0.55;
      this.hemi.intensity = 0.25;
      const sky = new THREE.Color(0x0a0414);
      this.scene.fog.near = far * 0.8; this.scene.fog.far = far * 1.5;
      this.scene.fog.color.copy(sky);
      this.scene.background = sky;
      return;
    }
    const ang = this.time * Math.PI * 2;
    const sy = Math.sin(ang), sx = Math.cos(ang);
    const day = clamp((sy + 0.18) / 0.5, 0, 1);
    this.sun.position.set(sx * 100, Math.max(sy, -0.3) * 100, 40);
    this.sun.intensity = 0.12 + day * 0.78;
    this.ambient.intensity = 0.22 + day * 0.5;
    this.hemi.intensity = 0.2 + day * 0.35;
    const dayCol = new THREE.Color(0x88c4ee), nightCol = new THREE.Color(0x0a0d1c);
    const duskCol = new THREE.Color(0xff8848);  // warm orange-red
    let sky = nightCol.clone().lerp(dayCol, day);
    // Blend in sunset/sunrise colors when sun is low on horizon (|sy| < 0.35)
    const horizonness = Math.max(0, 1 - Math.abs(sy) / 0.35);
    if (horizonness > 0 && day > 0.05) {
      sky.lerp(duskCol, horizonness * 0.55 * Math.min(1, day * 4));
      // Sun warms when low
      this.sun.color.setHex(0xffd0a0);
    } else {
      this.sun.color.setHex(0xffffff);
    }
    this.scene.fog.near = far * 0.45; this.scene.fog.far = far;
    this.scene.fog.color.copy(sky);
    this.scene.background = sky;

    // Position sun + moon discs in the sky relative to camera
    if (this.sunMesh && this.player) {
      const px = this.player.pos.x, py = this.player.pos.y, pz = this.player.pos.z;
      const R = 260;
      this.sunMesh.position.set(px + sx * R, py + sy * R, pz + R * 0.25);
      this.sunMesh.lookAt(px, py, pz);
      this.sunMesh.visible = sy > -0.2;
      this.moonMesh.position.set(px - sx * R, py - sy * R, pz - R * 0.25);
      this.moonMesh.lookAt(px, py, pz);
      this.moonMesh.visible = sy < 0.2;
      // Clouds drift slowly and follow player
      if (this.cloudMesh) {
        this._cloudOffset = (this._cloudOffset || 0) + 0.0004;
        this.cloudMesh.material.map.offset.set(this._cloudOffset, this._cloudOffset * 0.5);
        this.cloudMesh.position.set(px, 110, pz);
        // Cloud opacity dims at night
        this.cloudMesh.material.opacity = 0.3 + day * 0.55;
      }
    }
  },

  _updateHeld(dt) {
    const it = this.player.currentItem();
    const id = it ? it.id : -1;
    if (id !== this.heldId) {
      this.heldId = id;
      while (this.heldGroup.children.length) {
        const c = this.heldGroup.children[0];
        this.heldGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
      }
      if (id >= 0) {
        const m = Entities.makeHeldMesh(id);
        const d = defOf(id);
        if (d && !d.isBlock) {
          // Angle non-block items so they look held in hand
          m.scale.set(1.4, 1.4, 1.4);
          m.rotation.set(-0.2, -0.6, -0.3);
        } else {
          m.scale.set(1.3, 1.3, 1.3);
        }
        this.heldGroup.add(m);
      }
    }
    // off-hand mesh (mirrored on left side)
    const ot = this.player.offhand;
    const oid = ot ? ot.id : -1;
    if (oid !== this.offhandId) {
      this.offhandId = oid;
      while (this.offhandGroup.children.length) {
        const c = this.offhandGroup.children[0];
        this.offhandGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
      }
      if (oid >= 0) {
        const m = Entities.makeHeldMesh(oid);
        const d = defOf(oid);
        if (d && !d.isBlock) {
          m.scale.set(1.4, 1.4, 1.4);
          m.rotation.set(-0.2, 0.6, 0.3);
        } else {
          m.scale.set(1.3, 1.3, 1.3);
        }
        this.offhandGroup.add(m);
      }
    }
    if (this.attackSwing > 0) this.attackSwing = Math.max(0, this.attackSwing - dt * 4);
    const s = Math.sin(this.attackSwing * Math.PI);
    if (this._isBlocking()) {
      // Raise shield (from whichever hand holds it) toward center
      const ohIsShield = ot && defOf(ot.id) && defOf(ot.id).type === 'shield';
      if (ohIsShield) {
        this.offhandGroup.rotation.set(-0.35, 0.5, -0.2);
        this.offhandGroup.position.set(-0.25, -0.25, -0.55);
        this.heldGroup.rotation.set(-s * 1.1, 0, 0);
        this.heldGroup.position.set(0.62, -0.5 - s * 0.18, -0.9);
      } else {
        this.heldGroup.rotation.set(-0.35, -0.5, 0.2);
        this.heldGroup.position.set(0.25, -0.25, -0.55);
        this.offhandGroup.rotation.set(0, 0, 0);
        this.offhandGroup.position.set(-0.62, -0.5, -0.9);
      }
    } else {
      this.heldGroup.rotation.set(-s * 1.1, 0, 0);
      this.heldGroup.position.set(0.62, -0.5 - s * 0.18, -0.9);
      this.offhandGroup.rotation.set(0, 0, 0);
      this.offhandGroup.position.set(-0.62, -0.5, -0.9);
    }
  },

  _render() {
    // Face billboard name tags toward camera
    if (this.mp && this.mp.others.size > 0) {
      const camPos = new THREE.Vector3();
      this.camera.getWorldPosition(camPos);
      for (const rec of this.mp.others.values()) {
        if (rec.group._nameTag) rec.group._nameTag.lookAt(camPos);
      }
    }
    this.renderer.render(this.scene, this.camera);
  },

  /* ---------------- friends UI ---------------- */
  async openFriendsPanel() {
    document.getElementById('friendsPanel').classList.remove('hidden');
    document.getElementById('friendSearchResult').innerHTML = '';
    document.getElementById('friendSearchInput').value = '';
    await this._refreshFriendsList();
    await this._refreshFriendRequests();
    Accounts._heartbeat();
  },

  async _refreshFriendsList() {
    const list = document.getElementById('friendsList');
    list.innerHTML = '<div class="friends-empty">Ladataan…</div>';
    const friends = await Accounts.getFriends();
    list.innerHTML = '';
    if (friends.length === 0) { list.innerHTML = '<div class="friends-empty">Ei vielä kavereita</div>'; return; }
    const now = Date.now();
    for (const f of friends) {
      const online = (now - f.lastSeen) < 60_000;
      const card = document.createElement('div'); card.className = 'friend-card';
      const dot = document.createElement('div'); dot.className = 'fonline ' + (online ? 'online' : 'offline');
      const name = document.createElement('div'); name.className = 'fname'; name.textContent = f.name;
      const meta = document.createElement('div'); meta.className = 'fmeta';
      meta.textContent = online ? 'Online' : (f.lastSeen ? this._fmtAgo(now - f.lastSeen) + ' sitten' : 'Ei ikinä');
      // Check if they have an open world
      const openInfo = await Accounts.getFriendOpenWorld(f.id);
      if (openInfo) {
        const join = document.createElement('div'); join.className = 'btn-sm accept';
        join.textContent = '🌐 Liity (' + openInfo.name + ')';
        join.addEventListener('click', () => this.joinFriendWorld(openInfo.worldId));
        card.appendChild(dot); card.appendChild(name); card.appendChild(meta); card.appendChild(join);
      } else {
        const rem = document.createElement('div'); rem.className = 'btn-sm danger'; rem.textContent = 'Poista';
        rem.addEventListener('click', async () => {
          if (!confirm('Poista kaveri ' + f.name + '?')) return;
          await Accounts.removeFriend(f.id);
          this._refreshFriendsList();
        });
        card.appendChild(dot); card.appendChild(name); card.appendChild(meta); card.appendChild(rem);
      }
      list.appendChild(card);
    }
  },

  async _refreshFriendRequests() {
    const list = document.getElementById('friendRequestsList');
    list.innerHTML = '<div class="friends-empty">Ladataan…</div>';
    const reqs = await Accounts.getFriendRequests();
    list.innerHTML = '';
    if (reqs.length === 0) { list.innerHTML = '<div class="friends-empty">Ei pyyntöjä</div>'; return; }
    for (const r of reqs) {
      const card = document.createElement('div'); card.className = 'friend-card';
      const name = document.createElement('div'); name.className = 'fname'; name.textContent = r.from;
      const acc = document.createElement('div'); acc.className = 'btn-sm accept'; acc.textContent = 'Hyväksy';
      acc.addEventListener('click', async () => {
        await Accounts.acceptFriend(r.id, r.from);
        this._refreshFriendRequests(); this._refreshFriendsList();
      });
      const rej = document.createElement('div'); rej.className = 'btn-sm danger'; rej.textContent = 'Hylkää';
      rej.addEventListener('click', async () => {
        await Accounts.rejectFriend(r.id);
        this._refreshFriendRequests();
      });
      card.appendChild(name); card.appendChild(acc); card.appendChild(rej);
      list.appendChild(card);
    }
  },

  async _friendSearch() {
    const input = document.getElementById('friendSearchInput');
    const out = document.getElementById('friendSearchResult');
    const name = input.value.trim();
    if (!name) return;
    out.innerHTML = '<div class="friends-empty">Etsitään…</div>';
    const found = await Accounts.searchUser(name);
    out.innerHTML = '';
    if (!found) { out.innerHTML = '<div class="friends-empty">Käyttäjää ei löytynyt</div>'; return; }
    if (found.playerId === Accounts.current) { out.innerHTML = '<div class="friends-empty">Tämä olet sinä 😄</div>'; return; }
    const now = Date.now();
    const online = (now - found.lastSeen) < 60_000;
    const card = document.createElement('div'); card.className = 'friend-card';
    const dot = document.createElement('div'); dot.className = 'fonline ' + (online ? 'online' : 'offline');
    const nm = document.createElement('div'); nm.className = 'fname'; nm.textContent = found.username;
    const meta = document.createElement('div'); meta.className = 'fmeta';
    meta.textContent = online ? 'Online' : (found.lastSeen ? this._fmtAgo(now - found.lastSeen) + ' sitten' : 'Ei ikinä');
    const add = document.createElement('div'); add.className = 'btn-sm'; add.textContent = '+ Pyydä kaveriksi';
    add.addEventListener('click', async () => {
      const err = await Accounts.sendFriendRequest(found.playerId, found.username);
      out.innerHTML = '<div class="friends-empty">' + (err || '✓ Pyyntö lähetetty: ' + found.username) + '</div>';
    });
    card.appendChild(dot); card.appendChild(nm); card.appendChild(meta); card.appendChild(add);
    out.appendChild(card);
  },

  _fmtAgo(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    return Math.floor(s / 86400) + ' pv';
  },

  /* ---------------- chat ---------------- */
  _initChat() {
    this._chatLastTs = Date.now();
    this._chatMsgs = [];   // {user, text, ts, el}
    this._chatEl = document.getElementById('chatHud');
    this._chatInputWrap = document.getElementById('chatInputWrap');
    this._chatInput = document.getElementById('chatInput');
    this._chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this._chatInput.value.trim();
        if (text) Accounts.sendChatMessage(text, 'global');
        this._closeChatInput();
      } else if (e.key === 'Escape') {
        this._closeChatInput();
      }
    });
    setInterval(() => this._pollChat(), 3000);
  },

  async _pollChat() {
    if (!Accounts.current) return;
    const msgs = await Accounts.fetchChatSince(this._chatLastTs, 'global');
    for (const m of msgs) {
      if (m.ts > this._chatLastTs) this._chatLastTs = m.ts;
      this._addChatMessage(m);
    }
  },

  _addChatMessage(m) {
    if (!this._chatEl) return;
    const div = document.createElement('div'); div.className = 'chat-msg';
    div.innerHTML = '<span class="chat-user">' + (m.user || '???') + ':</span>' + this._escapeHtml(m.text || '');
    this._chatEl.appendChild(div);
    this._chatMsgs.push({ el: div, ts: m.ts });
    while (this._chatMsgs.length > 10) {
      const old = this._chatMsgs.shift();
      if (old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
    setTimeout(() => { if (div.parentNode) div.style.opacity = '0'; }, 8000);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); this._chatMsgs = this._chatMsgs.filter((x) => x.el !== div); }, 9500);
  },

  _escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  /* ---------------- multiplayer ---------------- */
  _initMultiplayer() {
    this.mp = {
      worldId: null, openToFriends: false, lastEditTs: 0,
      others: new Map(),    // uid -> {pos, yaw, name, hp, mesh, group, lastTs, armorKey}
      peers: new Map(),     // uid -> { pc, dc }
      pendingSignals: new Map(), // for ICE before remote desc set
      tick: 0
    };
    setInterval(() => this._mpTick(), 500);
    // Voice signal poll runs same loop now (since we always need to signal for DC)
    setInterval(() => this._mpSignalPoll(), 1200);
  },

  _mpPeer(uid) {
    if (!this.mp.peers) this.mp.peers = new Map();
    let rec = this.mp.peers.get(uid);
    if (rec) return rec;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });
    // Perfect-negotiation state per peer
    rec = { pc, dc: null, makingOffer: false, polite: Accounts.current > uid };
    this.mp.peers.set(uid, rec);
    pc.onicecandidate = (e) => {
      if (e.candidate) Accounts.sendSignal(this.mp.worldId, uid, { type: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      console.log('[mp] ontrack from', uid.slice(0, 6));
      if (!this.voice) this.voice = { enabled: false, stream: null, audioEls: new Map() };
      if (!this.voice.audioEls) this.voice.audioEls = new Map();
      let audio = this.voice.audioEls.get(uid);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true; audio.playsInline = true; audio.style.display = 'none';
        document.body.appendChild(audio);
        this.voice.audioEls.set(uid, audio);
      }
      audio.srcObject = e.streams[0];
      audio.play().then(() => UI.toast('🔊 Kuulet käyttäjää ' + uid.slice(0, 6))).catch(() => {
        UI.toast('⚠ Audio estetty — klikkaa peliä');
      });
    };
    pc.onconnectionstatechange = () => {
      console.log('[mp]', uid.slice(0, 6), 'pc:', pc.connectionState);
      if (pc.connectionState === 'failed') this._mpRenegotiate(uid);
    };
    // Perfect negotiation: createOffer when WebRTC asks for renegotiation
    pc.onnegotiationneeded = async () => {
      try {
        rec.makingOffer = true;
        await pc.setLocalDescription();
        Accounts.sendSignal(this.mp.worldId, uid, { type: 'offer', sdp: pc.localDescription.sdp });
      } catch (e) { console.warn('[mp] negotiation failed', e); }
      finally { rec.makingOffer = false; }
    };
    // Add voice tracks if already enabled
    if (this.voice && this.voice.stream) {
      for (const tr of this.voice.stream.getTracks()) pc.addTrack(tr, this.voice.stream);
    }
    // Initiator creates data channel
    if (Accounts.current < uid) {
      const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
      this._mpSetupDC(uid, dc);
    } else {
      pc.ondatachannel = (e) => this._mpSetupDC(uid, e.channel);
    }
    return rec;
  },

  async _mpRenegotiate(uid) {
    const rec = this._mpPeer(uid);
    try {
      rec.makingOffer = true;
      await rec.pc.setLocalDescription(await rec.pc.createOffer({ iceRestart: true }));
      Accounts.sendSignal(this.mp.worldId, uid, { type: 'offer', sdp: rec.pc.localDescription.sdp });
    } catch (e) { console.warn('[mp] renegotiate failed', e); }
    finally { rec.makingOffer = false; }
  },

  _mpSetupDC(uid, dc) {
    const rec = this.mp.peers.get(uid);
    if (rec) rec.dc = dc;
    dc.onopen = () => { console.log('[mp]', uid.slice(0, 6), 'dc open'); UI.toast('🔗 Yhteys: ' + uid.slice(0, 6)); };
    dc.onclose = () => { console.log('[mp]', uid.slice(0, 6), 'dc closed'); };
    dc.onmessage = (e) => {
      try { this._mpReceive(uid, JSON.parse(e.data)); } catch (err) {}
    };
  },

  _mpSend(msg) {
    if (!this.mp || !this.mp.peers) return;
    const json = JSON.stringify(msg);
    for (const rec of this.mp.peers.values()) {
      if (rec.dc && rec.dc.readyState === 'open') {
        try { rec.dc.send(json); } catch (e) {}
      }
    }
  },

  _mpSendTo(uid, msg) {
    const rec = this.mp.peers.get(uid);
    if (rec && rec.dc && rec.dc.readyState === 'open') {
      try { rec.dc.send(JSON.stringify(msg)); } catch (e) {}
    }
  },

  _mpReceive(fromUid, msg) {
    if (msg.type === 'pos') {
      let rec = this.mp.others.get(fromUid);
      const armorKey = JSON.stringify(msg.armor || {}) + '|' + (msg.heldId || 0);
      if (!rec || rec.armorKey !== armorKey || rec.name !== msg.name) {
        if (rec) this.scene.remove(rec.group);
        console.log('[mp] rebuild player', msg.name, 'armor=', msg.armor, 'held=', msg.heldId);
        rec = { pos: { x: msg.x, y: msg.y, z: msg.z }, yaw: msg.yaw, name: msg.name, hp: msg.hp,
          armorKey, lastMsg: Date.now(),
          group: this._buildRemotePlayer(msg.name, msg.armor, msg.heldId) };
        this.scene.add(rec.group);
        this.mp.others.set(fromUid, rec);
      }
      rec.pos.x = msg.x; rec.pos.y = msg.y; rec.pos.z = msg.z; rec.yaw = msg.yaw; rec.hp = msg.hp;
      rec.lastMsg = Date.now();
      rec.group.position.set(msg.x, msg.y, msg.z);
      rec.group.rotation.y = -msg.yaw + Math.PI;
    } else if (msg.type === 'edit') {
      const w = (msg.d === 'nether' ? this.nether : (msg.d === 'overworld' ? this.overworld : null));
      if (w) w.setBlock(msg.x, msg.y, msg.z, msg.b);
    } else if (msg.type === 'levitate') {
      this.player.levitate(5);
      UI.toast('🌀 Leijut!');
    } else if (msg.type === 'damage') {
      let dmg = msg.dmg;
      let fullyBlocked = false;
      // Kilpitorjunta myös PvP:ssä
      if (this._isBlocking()) {
        const sh = this._activeShieldItem();
        if (sh && defOf(sh.id) && defOf(sh.id).shulkerShield && msg.fromUid) this._mpSendTo(msg.fromUid, { type: 'levitate' });
        if (msg.axe) { this.player.disableShield(4); UI.toast('🪓 Kilpesi lyötiin alas 4s!'); }
        dmg = Math.floor(dmg * this._shieldMul());
        if (dmg <= 0) fullyBlocked = true;
      }
      if (!fullyBlocked) this.player.hurt(dmg, msg.fx, msg.fz, 'Pelaaja ' + (msg.fromName || ''));
      // Apply extra knockback if attacker had bat_knockback enchant
      if (msg.kbMul && msg.kbMul > 1) {
        const p = this.player;
        const dx = p.pos.x - msg.fx, dz = p.pos.z - msg.fz;
        const L = Math.hypot(dx, dz) || 1;
        const extra = (msg.kbMul - 1) * 6;
        p.kbx += dx / L * extra; p.kbz += dz / L * extra;
        p.vel.y = Math.max(p.vel.y, 6);
      }
      UI.toast('💢 ' + (msg.fromName || 'Pelaaja') + ' hyökkäsi! -' + msg.dmg);
      if (!this.player.alive) {
        this.state = 'dead';
        this._showOverlay('Kuolit! 💀\nSyy: Pelaaja ' + (msg.fromName || ''), true);
        document.exitPointerLock();
      }
    } else if (msg.type === 'pull') {
      const p = this.player;
      const dx = msg.fx - p.pos.x, dy = msg.fy - p.pos.y, dz = msg.fz - p.pos.z;
      const L = Math.hypot(dx, dy, dz) || 1;
      const speed = 12;
      p.vel.x = dx / L * speed;
      p.vel.z = dz / L * speed;
      // Vedä kohti vetäjää oikeassa suunnassa + pieni hyppy (ei korkealentoa)
      p.vel.y = dy / L * speed + 2;
      p.windJump = true;
      UI.toast('🪝 Sinut vedettiin koukkuun!');
    } else if (msg.type === 'chat') {
      this._addChatMessage({ user: msg.name, text: msg.text, ts: Date.now() });
    } else if (msg.type === 'bye') {
      const rec = this.mp.others.get(fromUid);
      if (rec) { this.scene.remove(rec.group); this.mp.others.delete(fromUid); }
      this._mpClosePeer(fromUid);
    }
  },

  _mpClosePeer(uid) {
    const rec = this.mp.peers.get(uid);
    if (rec) {
      if (rec.dc) try { rec.dc.close(); } catch (e) {}
      if (rec.pc) try { rec.pc.close(); } catch (e) {}
      this.mp.peers.delete(uid);
    }
    if (this.voice && this.voice.audioEls) {
      const a = this.voice.audioEls.get(uid);
      if (a) { try { a.pause(); } catch (e) {} if (a.parentNode) a.parentNode.removeChild(a); this.voice.audioEls.delete(uid); }
    }
  },

  async _mpInitOffer(uid) {
    // Initial offer only from the lex-smaller UID to avoid both sides connecting twice
    if (!(Accounts.current < uid)) {
      // Still create peer so it's ready to receive offer
      this._mpPeer(uid);
      return;
    }
    this._mpPeer(uid);  // negotiationneeded handler will fire as datachannel is added
  },

  async _mpSignalPoll() {
    if (!this.mp.worldId) return;
    const msgs = await Accounts.fetchSignals(this.mp.worldId);
    for (const m of msgs) {
      try {
        const rec = this._mpPeer(m.fromUid);
        const pc = rec.pc;
        if (m.type === 'offer') {
          const collision = rec.makingOffer || pc.signalingState !== 'stable';
          if (collision && !rec.polite) {
            console.log('[mp] ignore colliding offer from', m.fromUid.slice(0, 6));
            Accounts.clearSignal(this.mp.worldId, m.fromUid, m.id);
            continue;
          }
          if (collision && rec.polite) {
            console.log('[mp] rollback for collision with', m.fromUid.slice(0, 6));
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription({ type: 'offer', sdp: m.sdp })
            ]);
          } else {
            await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          }
          await pc.setLocalDescription(await pc.createAnswer());
          Accounts.sendSignal(this.mp.worldId, m.fromUid, { type: 'answer', sdp: pc.localDescription.sdp });
          console.log('[mp] answer sent to', m.fromUid.slice(0, 6));
        } else if (m.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
            console.log('[mp] answer applied from', m.fromUid.slice(0, 6));
          }
        } else if (m.type === 'ice') {
          try { await pc.addIceCandidate(m.candidate); } catch (e) {}
        }
      } catch (e) { console.warn('[mp] signal err', e); }
      Accounts.clearSignal(this.mp.worldId, m.fromUid, m.id);
    }
  },

  async openWorldToFriends() {
    if (!this.worldId || !this.player) return;
    this.mp.worldId = this.worldId;
    this.mp.openToFriends = true;
    this.mp.lastEditTs = Date.now();
    await Accounts.markWorldOpen(this.worldId, this.worldName, this.dimension);
    UI.toast('🌐 Maailma avattu — ID: ' + this.worldId);
    try { navigator.clipboard.writeText(this.worldId); } catch (e) {}
    Accounts.syncPlayerState(this.worldId, {
      x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
      yaw: this.player.yaw, dim: this.dimension, name: Accounts.currentName
    });
    this._updateMpStatus();
  },
  async closeWorldFromFriends() {
    if (!this.worldId) return;
    await Accounts.markWorldClosed(this.worldId);
    if (this.mp.worldId) await Accounts.leaveWorld(this.mp.worldId);
    this.mp.openToFriends = false;
    this.mp.worldId = null;
    this._removeAllRemotePlayers();
    UI.toast('🌐 Maailma suljettu kavereilta');
    this._updateMpStatus();
  },

  _updateMpStatus() {
    const el = document.getElementById('mpStatus');
    if (!el) return;
    if (this.mp && (this.mp.openToFriends || this.mp.worldId) && this.worldId) {
      el.classList.remove('hidden');
      let dcOpen = 0, total = 0;
      if (this.mp.peers) {
        for (const rec of this.mp.peers.values()) {
          total++;
          if (rec.dc && rec.dc.readyState === 'open') dcOpen++;
        }
      }
      document.getElementById('mpStatusId').textContent = this.worldId + ' [' + dcOpen + '/' + total + ' yht.]';
    } else {
      el.classList.add('hidden');
    }
  },

  async joinFriendWorld(worldId) {
    this.mp.worldId = worldId;
    this.mp.openToFriends = false;
    this.mp.lastEditTs = Date.now() - 60_000;
    document.getElementById('friendsPanel').classList.add('hidden');
    await this.loadExistingWorld(worldId);
    UI.toast('🌐 Liityit kaverin maailmaan (ID: ' + worldId + ')');
    // Force-write our state so host sees us within first tick
    setTimeout(() => {
      if (this.player && this.mp.worldId) {
        Accounts.syncPlayerState(this.mp.worldId, {
          x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
          yaw: this.player.yaw, dim: this.dimension, name: Accounts.currentName
        });
      }
    }, 500);
    this._updateMpStatus();
  },

  async _mpTick() {
    if (!this.player || !this.world || !this.mp.worldId || this.state === 'account' || this.state === 'worlds') return;
    this._updateMpStatus();
    // Build payload
    const armor = {
      head: this.player.armor.head ? this.player.armor.head.id : 0,
      chest: this.player.armor.chest ? this.player.armor.chest.id : 0,
      legs: this.player.armor.legs ? this.player.armor.legs.id : 0,
      feet: this.player.armor.feet ? this.player.armor.feet.id : 0
    };
    const heldId = (this.player.currentItem() && this.player.currentItem().id) || 0;
    const payload = {
      type: 'pos', name: Accounts.currentName,
      x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
      yaw: this.player.yaw, dim: this.dimension, hp: this.player.health,
      armor, heldId
    };
    // Send over DC (fast, P2P)
    this._mpSend(payload);
    // Discover + sync via Firebase (always, as fallback if DataChannel doesn't connect)
    this.mp.tick++;
    if (this.mp.tick % 4 === 0) {
      // Full state sync to Firebase for fallback rendering
      Accounts.syncPlayerState(this.mp.worldId, {
        x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
        yaw: this.player.yaw, dim: this.dimension, name: Accounts.currentName,
        hp: this.player.health, armor, heldId
      });
      const others = await Accounts.fetchOtherPlayers(this.mp.worldId);
      if (this.mp.tick <= 12) console.log('[mp] discovery:', others.length, 'others');
      for (const o of others) {
        if (!this.mp.peers.has(o.uid)) {
          console.log('[mp] establishing peer to', o.uid.slice(0, 6), '(name:', o.name + ')');
          this._mpInitOffer(o.uid);
        }
        // Fallback rendering: use Firebase data if we have no fresh DC msg (last 3s)
        const rec = this.mp.others.get(o.uid);
        const stale = !rec || (Date.now() - (rec.lastMsg || 0)) > 3000;
        if (stale && o.dim === this.dimension) {
          this._mpReceive(o.uid, { type: 'pos', name: o.name, x: o.x, y: o.y, z: o.z, yaw: o.yaw, hp: o.hp, armor: o.armor, heldId: o.heldId });
        }
      }
    }
    // Clean up disconnected remote players (no DC msg for 10s)
    const now = Date.now();
    for (const [uid, rec] of this.mp.others) {
      if (rec.lastMsg && (now - rec.lastMsg) > 10000) {
        this.scene.remove(rec.group);
        this.mp.others.delete(uid);
      }
    }
  },

  _updateRemotePlayers(others) {
    const seen = new Set();
    for (const o of others) {
      if (o.dim !== this.dimension) continue;
      seen.add(o.uid);
      let rec = this.mp.others.get(o.uid);
      const armorKey = JSON.stringify(o.armor || {}) + '|' + (o.heldId || 0);
      if (!rec || rec.armorKey !== armorKey || rec.name !== o.name) {
        if (rec) this.scene.remove(rec.group);
        rec = {
          pos: { x: o.x, y: o.y, z: o.z }, yaw: o.yaw, name: o.name, hp: o.hp,
          armorKey, group: this._buildRemotePlayer(o.name, o.armor, o.heldId)
        };
        this.scene.add(rec.group);
        this.mp.others.set(o.uid, rec);
      }
      rec.pos.x = o.x; rec.pos.y = o.y; rec.pos.z = o.z;
      rec.yaw = o.yaw; rec.hp = o.hp;
      rec.group.position.set(o.x, o.y, o.z);
      rec.group.rotation.y = -o.yaw + Math.PI;
    }
    for (const [uid, rec] of this.mp.others) {
      if (!seen.has(uid)) { this.scene.remove(rec.group); this.mp.others.delete(uid); }
    }
  },

  _buildRemotePlayer(name, armor, heldId) {
    const g = new THREE.Group();
    const skinColor = 0xeac393;
    const shirtColor = 0x4a76d8;
    const pantsColor = 0x404a8a;
    const armorTint = (id) => {
      if (!id) return null;
      const d = defOf(id);
      if (!d) return null;
      // map armor name prefix to color
      if (d.name && /Nahka/.test(d.name)) return 0x9a6a3a;
      if (d.name && /Rauta/.test(d.name)) return 0xd4d4d4;
      if (d.name && /Timantti/.test(d.name)) return 0x52e6dd;
      if (d.name && /Netherite/.test(d.name)) return 0x3a3438;
      if (d.elytra) return 0xa0a4b8;
      return 0x888888;
    };
    const _p = (w, h, d, col, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
      m.position.set(x, y, z); g.add(m); return m;
    };
    armor = armor || {};
    // Bare body always
    _p(0.5, 0.5, 0.25, skinColor, 0, 1.65, 0);   // head
    _p(0.06, 0.06, 0.02, 0x1a1a1a, -0.13, 1.68, 0.13);
    _p(0.06, 0.06, 0.02, 0x1a1a1a, 0.13, 1.68, 0.13);
    _p(0.5, 0.7, 0.25, shirtColor, 0, 1.05, 0);
    _p(0.2, 0.7, 0.25, shirtColor, -0.35, 1.05, 0);
    _p(0.2, 0.7, 0.25, shirtColor, 0.35, 1.05, 0);
    _p(0.25, 0.5, 0.25, pantsColor, -0.13, 0.45, 0);
    _p(0.25, 0.5, 0.25, pantsColor, 0.13, 0.45, 0);
    _p(0.27, 0.2, 0.27, pantsColor, -0.13, 0.1, 0);
    _p(0.27, 0.2, 0.27, pantsColor, 0.13, 0.1, 0);
    // ARMOR OVERLAYS — pronounced plates with visor / pauldrons / kneeguards
    const headCol = armorTint(armor.head);
    if (headCol) {
      _p(0.6, 0.56, 0.34, headCol, 0, 1.65, 0);    // helmet wraps head
      _p(0.62, 0.1, 0.36, 0x111111, 0, 1.36, 0);   // dark rim
      _p(0.48, 0.1, 0.04, 0x111111, 0, 1.68, 0.18); // visor slot (dark band on face)
      _p(0.08, 0.18, 0.08, headCol, -0.22, 1.86, 0); // left antenna/horn
      _p(0.08, 0.18, 0.08, headCol, 0.22, 1.86, 0);  // right antenna/horn
    }
    const chestCol = armorTint(armor.chest);
    if (chestCol) {
      _p(0.6, 0.76, 0.34, chestCol, 0, 1.05, 0);   // chest plate (bigger)
      _p(0.34, 0.32, 0.36, chestCol, -0.4, 1.32, 0); // pauldron L (chunky shoulder)
      _p(0.34, 0.32, 0.36, chestCol, 0.4, 1.32, 0);  // pauldron R
      _p(0.16, 0.06, 0.34, 0x111111, 0, 0.7, 0);     // belt under chest
    }
    const legsCol = armorTint(armor.legs);
    if (legsCol) {
      _p(0.34, 0.56, 0.34, legsCol, -0.13, 0.45, 0); // greaves
      _p(0.34, 0.56, 0.34, legsCol, 0.13, 0.45, 0);
      _p(0.18, 0.1, 0.18, legsCol, -0.13, 0.25, 0.1); // knee pad bump
      _p(0.18, 0.1, 0.18, legsCol, 0.13, 0.25, 0.1);
    }
    const feetCol = armorTint(armor.feet);
    if (feetCol) {
      _p(0.36, 0.28, 0.38, feetCol, -0.13, 0.1, 0); // wider boots
      _p(0.36, 0.28, 0.38, feetCol, 0.13, 0.1, 0);
      _p(0.36, 0.05, 0.06, 0x111111, -0.13, -0.02, 0.18); // toe strap
      _p(0.36, 0.05, 0.06, 0x111111, 0.13, -0.02, 0.18);
    }
    // Elytra wings (if equipped in chest slot). Enderite elytra uses enderite color.
    if (armor.chest) {
      const d = defOf(armor.chest);
      if (d && d.elytra) {
        const wingCol = (armor.chest === I.ENDERITE_ELYTRA) ? 0x2a1438 : 0xa0a4b8;
        const tipCol = (armor.chest === I.ENDERITE_ELYTRA) ? 0xc020a0 : 0x707888;
        // Outer wing plane (wider and angled back)
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.08), new THREE.MeshLambertMaterial({ color: wingCol }));
        left.position.set(-0.55, 1.1, -0.25); left.rotation.set(0, 0.35, -0.15); g.add(left);
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.08), new THREE.MeshLambertMaterial({ color: wingCol }));
        right.position.set(0.55, 1.1, -0.25); right.rotation.set(0, -0.35, 0.15); g.add(right);
        // Wing tips (slightly thinner pieces near outer edge)
        const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.06), new THREE.MeshLambertMaterial({ color: tipCol }));
        tipL.position.set(-0.85, 1.5, -0.35); tipL.rotation.set(0, 0.55, -0.25); g.add(tipL);
        const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.06), new THREE.MeshLambertMaterial({ color: tipCol }));
        tipR.position.set(0.85, 1.5, -0.35); tipR.rotation.set(0, -0.55, 0.25); g.add(tipR);
        // If enderite elytra, also make sure chest body is visible (chestCol already drawn above)
        // Add a glowing accent strip down the center
        if (armor.chest === I.ENDERITE_ELYTRA) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.02), new THREE.MeshBasicMaterial({ color: 0xc020a0 }));
          stripe.position.set(0, 1.05, 0.17); g.add(stripe);
        }
      }
    }
    // Held item in right hand
    if (heldId) {
      try {
        const im = Entities.makeHeldMesh(heldId);
        const dh = defOf(heldId);
        if (dh && !dh.isBlock) {
          im.scale.set(0.9, 0.9, 0.9);
          im.position.set(0.45, 0.95, 0.3);
          im.rotation.set(-0.6, 0.2, -0.4);
        } else {
          im.scale.set(0.7, 0.7, 0.7);
          im.position.set(0.45, 0.85, 0.25);
          im.rotation.set(0, 0, -0.6);
        }
        g.add(im);
      } catch (e) {}
    }
    // Name tag using a sprite-like plane
    const nameCv = document.createElement('canvas'); nameCv.width = 256; nameCv.height = 64;
    const nCtx = nameCv.getContext('2d');
    nCtx.font = 'bold 32px Arial'; nCtx.fillStyle = '#fff';
    nCtx.textAlign = 'center'; nCtx.textBaseline = 'middle';
    nCtx.strokeStyle = '#000'; nCtx.lineWidth = 5;
    nCtx.strokeText(name || '???', 128, 32);
    nCtx.fillText(name || '???', 128, 32);
    const tex = new THREE.CanvasTexture(nameCv);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
    tag.position.set(0, 2.4, 0);
    tag.userData.isBillboard = true;
    g.add(tag);
    g._nameTag = tag;
    return g;
  },

  _removeAllRemotePlayers() {
    for (const rec of this.mp.others.values()) this.scene.remove(rec.group);
    this.mp.others.clear();
  },

  /* ---------------- voice chat (WebRTC mesh + Firebase signaling) ---------------- */
  async _toggleVoice() {
    if (!this.voice) this.voice = { enabled: false, stream: null, audioEls: new Map() };
    if (this.voice.enabled) { this._voiceStop(); return; }
    if (!this.mp || !this.mp.worldId) { UI.toast('Voice chat vaatii co-op-maailman'); return; }
    try {
      this.voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (e) {
      UI.toast('Mikrofoni epäonnistui: ' + (e.message || e));
      return;
    }
    this.voice.enabled = true;
    this._updateVoiceBtn();
    UI.toast('🎤 Voice chat päällä');
    // Add tracks to all existing peers — onnegotiationneeded will fire renegotiation
    for (const [uid, rec] of this.mp.peers) {
      if (rec.pc) {
        for (const tr of this.voice.stream.getTracks()) rec.pc.addTrack(tr, this.voice.stream);
      }
    }
  },

  _voiceStop() {
    if (!this.voice) return;
    this.voice.enabled = false;
    if (this.voice.stream) {
      for (const tr of this.voice.stream.getTracks()) tr.stop();
      this.voice.stream = null;
    }
    if (this.voice.audioEls) {
      for (const el of this.voice.audioEls.values()) { try { el.pause(); } catch (e) {} if (el.parentNode) el.parentNode.removeChild(el); }
      this.voice.audioEls.clear();
    }
    this._updateVoiceBtn();
    UI.toast('🎤 Voice chat pois');
  },

  _updateVoiceBtn() {
    const btn = document.getElementById('voiceToggleBtn');
    if (!btn) return;
    btn.textContent = '🎤 Voice chat: ' + (this.voice && this.voice.enabled ? 'päällä' : 'pois');
    btn.style.background = (this.voice && this.voice.enabled) ? '#a36e3a' : '#3aa07a';
  },

  _voicePeer(uid) {
    if (!this.voice || !this.voice.peers) return null;
    let pc = this.voice.peers.get(uid);
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Free public TURN — needed when behind symmetric NAT
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });
    if (this.voice.stream) for (const tr of this.voice.stream.getTracks()) pc.addTrack(tr, this.voice.stream);
    pc.onicecandidate = (e) => {
      if (e.candidate) Accounts.sendSignal(this.mp.worldId, uid, { type: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      console.log('[voice] ontrack from', uid, 'streams=', e.streams.length);
      let audio = this.voice.audioEls.get(uid);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.voice.audioEls.set(uid, audio);
      }
      audio.srcObject = e.streams[0];
      // explicit play to bypass autoplay restrictions
      audio.play().then(() => {
        const name = this.mp.others.get(uid);
        UI.toast('🔊 Kuulet: ' + ((name && name.name) || uid));
      }).catch((err) => {
        console.warn('[voice] audio.play() rejected', err);
        UI.toast('⚠ Audio estetty selaimen toimesta — klikkaa peliä');
      });
    };
    pc.onconnectionstatechange = () => {
      console.log('[voice] peer', uid, 'state:', pc.connectionState);
      if (pc.connectionState === 'connected') UI.toast('✅ Voice yhdistetty: ' + uid.slice(0, 8));
      else if (pc.connectionState === 'failed') {
        UI.toast('⚠ Voice epäonnistui: ' + uid.slice(0, 8));
        // Try to ICE restart
        if (Accounts.current < uid) this._voiceInitOffer(uid);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[voice] ICE', uid, 'state:', pc.iceConnectionState);
    };
    this.voice.peers.set(uid, pc);
    return pc;
  },

  async _voiceInitOffer(uid) {
    if (!this.voice || !this.voice.enabled) return;
    // Tie-breaker: only the lexicographically smaller UID initiates
    if (!(Accounts.current < uid)) { console.log('[voice] skip offer to', uid, '(other is initiator)'); return; }
    const pc = this._voicePeer(uid);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[voice] sending offer to', uid);
      Accounts.sendSignal(this.mp.worldId, uid, { type: 'offer', sdp: offer.sdp });
    } catch (e) { console.warn('[voice] offer failed', e); UI.toast('⚠ Voice offer failed: ' + e.message); }
  },

  async _voicePollSignals() {
    if (!this.voice || !this.voice.enabled || !this.mp.worldId) return;
    const msgs = await Accounts.fetchSignals(this.mp.worldId);
    if (msgs.length) console.log('[voice] got', msgs.length, 'signals');
    for (const m of msgs) {
      try {
        const pc = this._voicePeer(m.fromUid);
        if (m.type === 'offer') {
          console.log('[voice] received offer from', m.fromUid);
          await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          console.log('[voice] sending answer to', m.fromUid);
          await Accounts.sendSignal(this.mp.worldId, m.fromUid, { type: 'answer', sdp: ans.sdp });
        } else if (m.type === 'answer') {
          console.log('[voice] received answer from', m.fromUid);
          await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        } else if (m.type === 'ice') {
          try { await pc.addIceCandidate(m.candidate); } catch (e) {}
        }
      } catch (e) { console.warn('[voice] signal handling failed', e); }
      Accounts.clearSignal(this.mp.worldId, m.fromUid, m.id);
    }
    // Initiate to any new players
    for (const uid of this.mp.others.keys()) {
      if (!this.voice.peers.has(uid)) this._voiceInitOffer(uid);
    }
  },

  _updateMpToggleBtn() {
    const btn = document.getElementById('mpToggleBtn');
    if (!btn) return;
    if (this.mp && this.mp.openToFriends) {
      btn.textContent = '🌐 Sulje (avoinna kavereille)';
      btn.style.background = '#a36e3a';
    } else {
      btn.textContent = '🌐 Avaa kavereille';
      btn.style.background = '#7a3aa0';
    }
  },

  _openChatInput() {
    if (!this._chatInputWrap) return;
    this._chatInputWrap.classList.remove('hidden');
    this._chatInput.value = '';
    this._chatInput.focus();
    document.exitPointerLock();
  },
  _closeChatInput() {
    if (!this._chatInputWrap) return;
    this._chatInputWrap.classList.add('hidden');
    this._chatInput.blur();
    if (this.state === 'play' && this.canvas) this._lock();
  },

  // Noise tracking — too many noisy actions near an Ancient City summons the Warden
  _registerNoise() {
    if (!this.world || !this.player) return;
    if (this.dimension !== 'overworld') return;
    const ac = this.world.findNearestAncientCity ? this.world.findNearestAncientCity(this.player.pos.x, this.player.pos.z) : null;
    if (!ac || ac.dist > 80) return;
    const now = Date.now();
    if (now - this.lastNoiseTs > 30_000) this.noiseCount = 0;  // reset if quiet for 30s
    this.lastNoiseTs = now;
    this.noiseCount++;
    if (this.noiseCount === 3) UI.toast('⚠ Sculk reagoi... varovasti!');
    if (this.noiseCount >= 5) {
      this.noiseCount = 0;
      // Spawn warden near player
      const p = this.player;
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 4;
      const wx = Math.floor(p.pos.x + Math.cos(ang) * r);
      const wz = Math.floor(p.pos.z + Math.sin(ang) * r);
      let wy = Math.floor(p.pos.y);
      // find ground at that column
      for (let y = wy + 4; y > 1; y--) if (isSolid(this.world.getBlock(wx, y, wz))) { wy = y + 1; break; }
      this.mobs.push(new Mob('warden', wx + 0.5, wy, wz + 0.5, this));
      UI.toast('💀 Warden heräsi äänestä!');
      Music.sfx('hurt');
    }
  },

  _applyPotion(name) {
    const p = this.player;
    const now = Date.now();
    if (name === 'healing') {
      // Täysparannus + 4 lisäsydäntä (absorptio) → näkyy heti vaikka elämä olisi täynnä
      p.heal(20);
      p.absorption = Math.max(p.absorption, 8);
      UI.toast('🍷 Parannus: täysi elämä + kilpisydämet');
    }
    else if (name === 'swiftness') { p.swiftnessUntil = now + 90_000; UI.toast('🏃 Nopeus 90s — liikut paljon nopeammin'); }
    else if (name === 'strength') { p.strengthUntil = now + 90_000; UI.toast('💪 Voima 90s — tuplavahinko'); }
    else if (name === 'fire_resistance') { p.fireResUntil = now + 300_000; UI.toast('🔥 Tulisuoja 5min — laava ei vahingoita'); }
    else if (name === 'regeneration') { p.regenUntil = now + 30_000; p.regenTimer = 0; UI.toast('❤ Regen 30s — elämä palautuu nopeasti'); }
  },

  _isBlocking() {
    if (this.state !== 'play' || !this.rightHeld) return false;
    if (this.player && this.player.shieldDisabledUntil > Date.now()) return false;   // kirves esti kilven
    return !!this._activeShieldItem();
  },
  // Palauttaa nostetussa kädessä olevan kilven (pää- tai sivukäsi), tai null
  _activeShieldItem() {
    const isShield = (s) => { const d = s && defOf(s.id); return (d && d.type === 'shield') ? s : null; };
    return isShield(this.player && this.player.currentItem()) || isShield(this.player && this.player.offhand) || null;
  },
  _updateSpectatorBtn() {
    const btn = document.getElementById('spectatorToggleBtn');
    if (!btn) return;
    const mode = this.player && this.player.mode;
    if (mode === 'spectator') {
      btn.textContent = '👁 Spectator: päällä — paina vaihtaaksesi Creativeen';
      btn.style.background = '#a06aac';
    } else {
      btn.textContent = '👁 Spectator: pois — paina vaihtaaksesi';
      btn.style.background = '#5aa0c0';
    }
  },
  _toggleSpectator() {
    const p = this.player;
    if (!p) return;
    if (p.mode === 'spectator') {
      p.mode = 'creative';
      p.flying = true;
      this._setXrayMode(false);
      UI.toast('🎮 Creative mode');
    } else if (p.mode === 'creative') {
      p.mode = 'spectator';
      p.flying = true;
      this._setXrayMode(true);
      UI.toast('👁 Spectator mode — seinien läpi, X-ray');
    }
    this._updateSpectatorBtn();
  },
  _setXrayMode(on) {
    if (!this.world) return;
    const apply = (w) => {
      if (!w || !w.matOpaque) return;
      w.matOpaque.transparent = on;
      w.matOpaque.opacity = on ? 0.15 : 1.0;
      w.matOpaque.depthWrite = !on;
      w.matOpaque.needsUpdate = true;
    };
    apply(this.overworld); apply(this.nether);
  },

  _shieldMul() {
    const cur = this.player.currentItem();
    const off = this.player.offhand;
    const get = (s) => { if (!s) return null; const d = defOf(s.id); return (d && d.type === 'shield') ? d : null; };
    const d = get(cur) || get(off);
    return (d && typeof d.shieldMul === 'number') ? d.shieldMul : 0.25;
  },
  _shieldDeflection() {
    if (!this._isBlocking()) return 0;
    const main = this.player.currentItem();
    const off = this.player.offhand;
    const isShield = (s) => s && defOf(s.id) && defOf(s.id).type === 'shield';
    if (isShield(main)) return enchantLevel(main, 'deflection');
    if (isShield(off)) return enchantLevel(off, 'deflection');
    return 0;
  },

  /* ---------------- enchanting ---------------- */
  _countBookshelves(x, y, z) {
    // Bookshelves in a 5×5 ring at the same y level with air between (matches Minecraft loosely)
    let count = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      for (let dy = 0; dy <= 1; dy++) {
        if (this.world.getBlock(x + dx, y + dy, z + dz) === B.BOOKSHELF) {
          count++;
          if (count >= 15) return 15;
        }
      }
    }
    return count;
  },

  generateEnchantOptions(item, bookshelves) {
    const apps = applicableEnchants(item);
    if (apps.length === 0) return [];
    const opts = [];
    // 3 slots, max level scales with bookshelves (0 → 5, 15 → 30)
    const baseMax = 1 + Math.floor(bookshelves * 2);
    // Yhteinen pool nostetaan kerran: slotit saavat ERI lumoukset (ei toistoja),
    // jotta kaikki sopivat lumoukset (mm. fire_aspect) ovat oikeasti saatavilla
    // eikä yksi lumous täytä kaikkia kolmea slottia.
    const pool = apps.slice();
    for (let i = 0; i < 3 && pool.length; i++) {
      const cost = 1 + i + Math.floor(bookshelves / 3);
      const lvlCap = Math.min(5, Math.max(1, Math.floor(baseMax * (i + 1) / 3)));
      // pick 1-2 enchantments
      const picks = [];
      const n = (bookshelves >= 10 && Math.random() < 0.5) ? 2 : 1;
      for (let k = 0; k < n && pool.length; k++) {
        const idx = (Math.random() * pool.length) | 0;
        const name = pool.splice(idx, 1)[0];
        const max = ENCH_INFO[name].max;
        const lvl = Math.max(1, Math.min(max, Math.min(lvlCap, 1 + Math.floor(Math.random() * lvlCap))));
        picks.push({ n: name, l: lvl });
      }
      if (picks.length) opts.push({ cost, picks });
    }
    return opts;
  },

  applyEnchant(item, picks) {
    if (!item.ench) item.ench = [];
    for (const p of picks) {
      const existing = item.ench.find((e) => e.n === p.n);
      if (existing) {
        const max = (ENCH_INFO[p.n] && ENCH_INFO[p.n].max) || 5;
        // Same level merges to level+1 (anvil-style), different levels → max
        if (existing.l === p.l) existing.l = Math.min(max, existing.l + 1);
        else existing.l = Math.min(max, Math.max(existing.l, p.l));
      } else {
        item.ench.push({ n: p.n, l: p.l });
      }
    }
    if (item.id === I.BOOK) { item.id = I.ENCHANTED_BOOK; item.count = 1; }
  },

  /* ---------------- title-screen 3D background ---------------- */
  _initMenuScene() {
    const ms = new THREE.Scene();
    ms.background = new THREE.Color(0x7ec0ee);
    ms.fog = new THREE.Fog(0x7ec0ee, 28, 60);
    this.menuScene = ms;
    this.menuT = 0;

    ms.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xfff2c0, 0.85);
    sun.position.set(18, 25, 8);
    ms.add(sun);
    ms.add(new THREE.HemisphereLight(0x9fc6e8, 0x5a4a36, 0.35));

    this.menuCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 200);

    const COL = {
      GRASS: 0x6abb45, DIRT: 0x8b6a3f, STONE: 0x8a8a8a, LOG: 0x5d3a1a,
      LEAVES: 0x4aa036, WATER: 0x3a7ce6, COAL: 0x1d1d1d, SAND: 0xe0c98a,
      IRON: 0xd3a583, GOLD: 0xf4d24b, DIAMOND: 0x52e6dd, SNOW: 0xffffff,
      FLOWER_R: 0xff4040, FLOWER_Y: 0xffe640, CLOUD: 0xf6f9ff,
      SUN: 0xffe680, TORCH: 0xffaa30, COBBLE: 0x6f6f6f,
    };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const matCache = {};
    const mat = (c) => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));
    const add = (x, y, z, c) => {
      const m = new THREE.Mesh(geo, mat(c));
      m.position.set(x + 0.5, y + 0.5, z + 0.5);
      ms.add(m);
    };

    // Heightmap with central hill
    const H = (x, z) => {
      const dx = (x - 11) / 5, dz = (z - 8) / 6;
      const base = 6 - Math.sqrt(dx * dx + dz * dz) * 2.4;
      return Math.max(1, Math.round(base + Math.sin(x * 0.7) * 0.5 + Math.cos(z * 0.55) * 0.5));
    };

    // Terrain with carved cave on right hillside
    for (let x = 0; x < 24; x++) for (let z = 0; z < 18; z++) {
      const h = H(x, z);
      for (let y = 0; y <= h; y++) {
        // Cave tunnel through right side of hill
        const cdx = x - 17, cdy = y - (h - 2), cdz = z - 9;
        if (cdx * cdx + cdy * cdy * 1.5 + cdz * cdz < 4.5 && y > 0) continue;
        let c;
        if (y === 0) c = COL.STONE;
        else if (y === h) c = COL.GRASS;
        else if (y >= h - 2) c = COL.DIRT;
        else c = COL.STONE;
        if (c === COL.STONE && y > 0) {
          const r = Math.sin(x * 7 + y * 13 + z * 5);
          if (r > 0.94) c = COL.DIAMOND;
          else if (r > 0.86) c = COL.GOLD;
          else if (r > 0.7) c = COL.IRON;
          else if (r < -0.82) c = COL.COAL;
        }
        add(x, y, z, c);
      }
    }
    // Torch glow inside cave mouth
    const tm = new THREE.PointLight(0xffaa30, 1.2, 7);
    tm.position.set(17, H(17, 9) - 1, 9);
    ms.add(tm);
    const torch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), new THREE.MeshBasicMaterial({ color: COL.TORCH }));
    torch.position.set(17, H(17, 9) - 1, 9);
    ms.add(torch);

    // Oak trees
    const tree = (tx, tz) => {
      const baseY = H(tx, tz) + 1;
      for (let i = 0; i < 4; i++) add(tx, baseY + i, tz, COL.LOG);
      for (let lx = -2; lx <= 2; lx++) for (let lz = -2; lz <= 2; lz++) for (let ly = 3; ly <= 5; ly++) {
        const d = Math.abs(lx) + Math.abs(lz) + Math.abs(ly - 4);
        if (d > 3) continue;
        if (lx === 0 && lz === 0 && ly < 4) continue;
        add(tx + lx, baseY + ly, tz + lz, COL.LEAVES);
      }
    };
    tree(4, 4); tree(7, 12); tree(11, 3); tree(3, 13);

    // Flowers
    const flower = (fx, fz, c) => {
      const y = H(fx, fz) + 1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), mat(c));
      m.position.set(fx + 0.5, y - 0.225, fz + 0.5);
      ms.add(m);
    };
    flower(2, 7, COL.FLOWER_R); flower(5, 9, COL.FLOWER_Y);
    flower(9, 7, COL.FLOWER_R); flower(13, 14, COL.FLOWER_Y);

    // Small water pond in low corner
    for (let x = 0; x < 4; x++) for (let z = 14; z < 18; z++) {
      const h = H(x, z);
      if (h <= 2) add(x, h, z, COL.WATER);
    }

    // Sun in sky
    const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2),
      new THREE.MeshBasicMaterial({ color: COL.SUN }));
    sunMesh.position.set(28, 22, -16);
    ms.add(sunMesh);

    // Clouds (pixelated clusters)
    const cloud = (cx, cz) => {
      for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 3; dz++) {
        if ((dx === 0 && dz !== 1) || (dx === 5 && dz !== 1)) continue;
        const m = new THREE.Mesh(geo, mat(COL.CLOUD));
        m.position.set(cx + dx + 0.5, 16, cz + dz + 0.5);
        ms.add(m);
      }
    };
    cloud(-2, -2); cloud(14, -4); cloud(6, 22);
  },

  _renderMenu(dt) {
    if (!this.menuScene) return;
    this.menuT += dt;
    const a = this.menuT * 0.08;
    const r = 18;
    this.menuCam.position.set(11 + Math.cos(a) * r, 11 + Math.sin(this.menuT * 0.13) * 1.4, 9 + Math.sin(a) * r);
    this.menuCam.lookAt(11, 5, 9);
    this.menuCam.aspect = innerWidth / innerHeight;
    this.menuCam.updateProjectionMatrix();
    this.renderer.render(this.menuScene, this.menuCam);
  }
};

window.addEventListener('load', () => Game.init());
