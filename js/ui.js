/* CopyCraft — HUD, inventory, crafting, furnace & chest screens */
'use strict';

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function stackMax(id) { const d = defOf(id); return (d && d.stack) || 64; }

/* pixel-art HUD icons */
function _makeIcon(pattern, w, on, off) {
  const h = pattern.length, S = 2;
  const cv = document.createElement('canvas');
  cv.width = w * S; cv.height = h * S;
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = pattern[y][x];
    if (ch === '.') continue;
    c.fillStyle = (ch === '1') ? on : off;
    c.fillRect(x * S, y * S, S, S);
  }
  return cv.toDataURL();
}
const HEART_PAT = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
const FOOD_PAT = ['..####..', '.######.', '########', '########', '.######.', '...##...', '....##..'];
const SHIELD_PAT = ['########', '########', '########', '.######.', '.######.', '..####..', '...##...'];

const UI = {
  init(game) {
    this.game = game;
    this._game = game;
    this.cursor = null;
    this.slots = [];
    this.openKind = null;
    this.container = null;
    this.craftGrid = [];
    this.craftW = 2;

    this.heartFull = _makeIcon(HEART_PAT.map((r) => r.replace(/#/g, '1')), 8, '#e23b3b', '#3a3a3a');
    this.heartEmpty = _makeIcon(HEART_PAT.map((r) => r.replace(/#/g, '2')), 8, '#e23b3b', '#3a3a3a');
    this.heartHalf = _makeIcon(HEART_PAT.map((r, i) => r.split('').map((ch, x) => ch === '#' ? (x < 4 ? '1' : '2') : '.').join('')), 8, '#e23b3b', '#3a3a3a');
    this.absFull = _makeIcon(HEART_PAT.map((r) => r.replace(/#/g, '1')), 8, '#ffd24a', '#3a3a3a');
    this.absHalf = _makeIcon(HEART_PAT.map((r) => r.split('').map((ch, x) => ch === '#' ? (x < 4 ? '1' : '2') : '.').join('')), 8, '#ffd24a', '#3a3a3a');
    this.foodFull = _makeIcon(FOOD_PAT.map((r) => r.replace(/#/g, '1')), 8, '#b9743a', '#3a3a3a');
    this.foodEmpty = _makeIcon(FOOD_PAT.map((r) => r.replace(/#/g, '2')), 8, '#b9743a', '#3a3a3a');
    this.foodHalf = _makeIcon(FOOD_PAT.map((r) => r.split('').map((ch, x) => ch === '#' ? (x < 4 ? '1' : '2') : '.').join('')), 8, '#b9743a', '#3a3a3a');
    this.shieldFull = _makeIcon(SHIELD_PAT.map((r) => r.replace(/#/g, '1')), 8, '#9fc0e0', '#2a3a4a');
    this.shieldEmpty = _makeIcon(SHIELD_PAT.map((r) => r.replace(/#/g, '2')), 8, '#9fc0e0', '#2a3a4a');

    this.elHotbar = document.getElementById('hotbar');
    this.elHealth = document.getElementById('healthbar');
    this.elHunger = document.getElementById('hungerbar');
    this.elArmor = document.getElementById('armorbar');
    this.elAbsorption = document.getElementById('absorptionbar');
    this.elScreen = document.getElementById('screen');
    this.elCursor = document.getElementById('cursorItem');
    this.elToast = document.getElementById('toast');
    this.elClock = document.getElementById('clock');
    this.elCoords = document.getElementById('coords');
    this.elBossBar = document.getElementById('bossbar');
    this.elBossFill = document.getElementById('bossBarFill');
    this.elBossName = document.getElementById('bossName');
    this.elXPFill = document.getElementById('xpbarFill');
    this.elXPLevel = document.getElementById('xpLevel');
    this.elTooltip = document.getElementById('itemTooltip');

    // Palamis-overlay: oranssit liekit ruudun reunoilla kun pelaaja palaa
    this._fireOverlay = el('div');
    this._fireOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;display:none;'
      + 'background:radial-gradient(ellipse at 50% 120%, rgba(255,150,30,0.55) 0%, rgba(220,60,10,0.35) 35%, rgba(0,0,0,0) 70%);';
    const fbot = el('div');
    fbot.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:38%;'
      + 'background:linear-gradient(to top, rgba(255,90,10,0.85), rgba(255,170,40,0.4) 45%, rgba(0,0,0,0));';
    this._fireOverlay.appendChild(fbot);
    document.body.appendChild(this._fireOverlay);

    // Aktiivisten juomaefektien näyttö (oikea yläkulma)
    this._effectsEl = el('div');
    this._effectsEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:45;display:flex;flex-direction:column;gap:4px;'
      + 'font-size:13px;font-weight:bold;text-align:right;pointer-events:none;text-shadow:1px 1px 2px #000;';
    document.body.appendChild(this._effectsEl);

    this._hotSlots = [];
    for (let i = 0; i < 9; i++) {
      const s = el('div', 'slot');
      const ico = el('div', 'ico'); const cnt = el('div', 'count');
      s.appendChild(ico); s.appendChild(cnt);
      this.elHotbar.appendChild(s);
      this._hotSlots.push({ s, ico, cnt });
      // Napauta hotbar-slottia valitaksesi sen (puhelin)
      s.addEventListener('click', () => {
        if (Game.state === 'play' && Game.player) { Game.player.selected = i; this.refresh(); }
      });
    }
    this._hearts = []; this._foods = [];
    for (let i = 0; i < 10; i++) {
      const h = el('img', 'icon'); this.elHealth.appendChild(h); this._hearts.push(h);
    }
    for (let i = 9; i >= 0; i--) {
      const f = el('img', 'icon'); this.elHunger.appendChild(f); this._foods.push(f);
    }
    this._armors = [];
    for (let i = 0; i < 10; i++) {
      const a = el('img', 'icon'); this.elArmor.appendChild(a); this._armors.push(a);
    }
    this._abs = [];
    for (let i = 0; i < 10; i++) {
      const a = el('img', 'icon'); this.elAbsorption.appendChild(a); this._abs.push(a);
    }

    document.addEventListener('mousemove', (e) => {
      if (this.game.state === 'inventory' && this.cursor) {
        this.elCursor.style.left = (e.clientX - 20) + 'px';
        this.elCursor.style.top = (e.clientY - 20) + 'px';
      }
      if (this._tooltipItem && this.elTooltip && !this.elTooltip.classList.contains('hidden')) {
        // position near cursor with edge-clamping
        const tx = Math.min(innerWidth - this.elTooltip.offsetWidth - 8, e.clientX + 14);
        const ty = Math.min(innerHeight - this.elTooltip.offsetHeight - 8, e.clientY + 14);
        this.elTooltip.style.left = tx + 'px';
        this.elTooltip.style.top = ty + 'px';
      }
    });
  },

  toast(msg) {
    this.elToast.textContent = msg;
    this.elToast.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.elToast.style.opacity = '0'; }, 1800);
  },

  setClock(dayCount, isDay, frac) {
    const hh = Math.floor(frac * 24);
    const mm = Math.floor((frac * 24 - hh) * 60);
    this.elClock.textContent = (isDay ? '☀ ' : '🌙 ') + 'Päivä ' + dayCount + '  '
      + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },

  setCoords(x, y, z) {
    if (!this.elCoords) return;
    this.elCoords.textContent = 'X: ' + Math.floor(x) + '  Y: ' + Math.floor(y) + '  Z: ' + Math.floor(z);
  },

  _refreshEffects(p) {
    if (!this._effectsEl || !p) return;
    const now = Date.now();
    const secs = (until) => Math.ceil((until - now) / 1000);
    const list = [];
    if (p.swiftnessUntil > now) list.push(['🏃 Nopeus', secs(p.swiftnessUntil), '#7cf']);
    if (p.strengthUntil > now) list.push(['💪 Voima', secs(p.strengthUntil), '#f96']);
    if (p.fireResUntil > now) list.push(['🔥 Tulisuoja', secs(p.fireResUntil), '#fc6']);
    if (p.regenUntil > now) list.push(['❤ Regen', secs(p.regenUntil), '#f7a']);
    if (p.resistanceUntil > now) list.push(['🛡 Suoja', secs(p.resistanceUntil), '#adf']);
    if (p.levitationUntil > now) list.push(['🌀 Leijunta', secs(p.levitationUntil), '#caf']);
    // rakenna vain kun muuttuu (vältä turhaa DOM-työtä)
    const key = list.map((e) => e[0] + e[1]).join('|');
    if (key === this._effectsKey) return;
    this._effectsKey = key;
    this._effectsEl.innerHTML = '';
    for (const [name, t, col] of list) {
      const d = el('div'); d.textContent = name + ' ' + t + 's'; d.style.color = col;
      this._effectsEl.appendChild(d);
    }
  },

  setBurning(on) {
    if (!this._fireOverlay) return;
    if (on && this._fireOverlay.style.display !== 'block') {
      this._fireOverlay.style.display = 'block';
    } else if (!on && this._fireOverlay.style.display !== 'none') {
      this._fireOverlay.style.display = 'none';
    }
    // kevyt välkyntä
    if (on) this._fireOverlay.style.opacity = (0.75 + 0.25 * Math.abs(Math.sin(Date.now() / 90))).toFixed(2);
  },

  setBoss(boss) {
    if (!this.elBossBar) return;
    if (!boss || boss.dead) { this.elBossBar.classList.add('hidden'); return; }
    this.elBossBar.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, (boss.hp / boss.cfg.hp) * 100));
    this.elBossFill.style.width = pct + '%';
    // crystals shielding the dragon
    let crystals = 0;
    if (this._game && this._game.mobs) {
      for (const m of this._game.mobs) if (!m.dead && m.type === 'end_crystal') crystals++;
    }
    const label = (boss.type === 'ender_dragon')
      ? 'Ender-lohikäärme' + (crystals > 0 ? '  (suojattu • ' + crystals + ' kristallia jäljellä)' : '')
      : boss.type;
    this.elBossName.textContent = label;
  },

  refresh() {
    const p = this.game.player;
    this._refreshEffects(p);
    for (let i = 0; i < 9; i++) {
      const slot = this._hotSlots[i];
      const it = p.inv[i];
      const url = it ? tileURLof(it.id) : null;
      slot.ico.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
      slot.cnt.textContent = (it && it.count > 1) ? it.count : '';
      slot.s.classList.toggle('sel', i === p.selected);
      slot.s.title = it ? itemDisplayName(it) : '';
      if (it && it.ench && it.ench.length) slot.s.style.boxShadow = '0 0 6px #a049d8';
      else slot.s.style.boxShadow = '';
    }
    for (let i = 0; i < 10; i++) {
      const f = p.health / 2 - i;
      this._hearts[i].src = f >= 1 ? this.heartFull : (f >= 0.5 ? this.heartHalf : this.heartEmpty);
    }
    for (let i = 0; i < 10; i++) {
      const f = p.hunger / 2 - i;
      this._foods[i].src = f >= 1 ? this.foodFull : (f >= 0.5 ? this.foodHalf : this.foodEmpty);
    }
    const ap = p.armorPoints();
    this.elArmor.style.display = ap > 0 ? 'flex' : 'none';
    for (let i = 0; i < 10; i++) {
      this._armors[i].src = (ap / 2 - i) >= 1 ? this.shieldFull : this.shieldEmpty;
    }
    // Absorption hearts (yellow) on top of regular hearts
    const abs = p.absorption || 0;
    this.elAbsorption.style.display = abs > 0 ? 'flex' : 'none';
    const absSlots = Math.ceil(abs / 2);
    for (let i = 0; i < 10; i++) {
      const f = abs / 2 - i;
      if (f >= 1) this._abs[i].src = this.absFull;
      else if (f >= 0.5) this._abs[i].src = this.absHalf;
      else this._abs[i].src = '';
      this._abs[i].style.display = i < absSlots ? '' : 'none';
    }
    if (this.cursor) {
      this.elCursor.style.display = 'block';
      this.elCursor.style.backgroundImage = 'url(' + tileURLof(this.cursor.id) + ')';
      this.elCursor.innerHTML = '<div class="count">' + (this.cursor.count > 1 ? this.cursor.count : '') + '</div>';
    } else {
      this.elCursor.style.display = 'none';
    }
    if (this.elXPFill) {
      const pct = p.xpToNext > 0 ? (p.xpInLevel / p.xpToNext) * 100 : 0;
      this.elXPFill.style.width = pct + '%';
      this.elXPLevel.textContent = p.xpLevel > 0 ? String(p.xpLevel) : '';
    }
  },

  /* ---------- slot rendering & interaction ---------- */
  _renderSlot(rec) {
    const it = rec.get();
    const url = it ? tileURLof(it.id) : null;
    rec.ico.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
    rec.cnt.textContent = (it && it.count > 1) ? it.count : '';
    rec.el.title = it ? itemDisplayName(it) : '';
    // Visual hint for enchanted items: glow border
    if (it && it.ench && it.ench.length) rec.el.style.boxShadow = '0 0 0 2px #a049d8 inset, 0 0 8px #a049d8';
    else rec.el.style.boxShadow = '';
  },
  renderAll() {
    for (const rec of this.slots) this._renderSlot(rec);
    this.refresh();
  },

  _slotEl(get, set, isResult, accept) {
    const s = el('div', 'invslot');
    const ico = el('div', 'ico'); const cnt = el('div', 'count');
    s.appendChild(ico); s.appendChild(cnt);
    const rec = { el: s, ico, cnt, get, set, isResult, accept };
    this.slots.push(rec);
    s.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (isResult) this._clickResult();
      else this._clickSlot(rec, e.button);
      this.renderAll();
    });
    s.addEventListener('mouseenter', () => this._showTooltip(rec.get()));
    s.addEventListener('mouseleave', () => this._hideTooltip());
    return s;
  },

  _showTooltip(it) {
    if (!this.elTooltip || !it) { this._hideTooltip(); return; }
    const d = defOf(it.id);
    const enchanted = it.ench && it.ench.length;
    let html = '<div class="ttname' + (enchanted ? ' ench' : '') + '">' + ((d && d.name) || '???') + '</div>';
    if (enchanted) {
      html += '<div class="ttench">';
      for (const e of it.ench) {
        const info = ENCH_INFO[e.n];
        html += '⚡ ' + (info ? info.name : e.n) + ' ' + romanNumeral(e.l) + '<br>';
      }
      html += '</div>';
    }
    this.elTooltip.innerHTML = html;
    this.elTooltip.classList.remove('hidden');
    this._tooltipItem = it;
  },
  _hideTooltip() {
    if (this.elTooltip) this.elTooltip.classList.add('hidden');
    this._tooltipItem = null;
  },

  _clickSlot(rec, button) {
    let slot = rec.get();
    if (rec.accept && this.cursor && !rec.accept(this.cursor)) return;
    // Right-click auto-equip: armor → matching armor slot, shield → offhand.
    // If already in equipment slot, un-equip into first empty inv slot.
    if (button === 2 && !this.cursor && slot) {
      const d = defOf(slot.id);
      const p = this.game.player;
      const slotMatches = (kind) =>
        (kind === 'armor' && d && d.type === 'armor' && d.slot && p.armor[d.slot] === slot) ||
        (kind === 'offhand' && d && d.type === 'shield' && p.offhand === slot);
      const unequipToInv = () => {
        for (let i = 9; i < 36; i++) if (!p.inv[i]) { p.inv[i] = slot; rec.set(null); return true; }
        for (let i = 0; i < 9; i++) if (!p.inv[i]) { p.inv[i] = slot; rec.set(null); return true; }
        return false;
      };
      if (slotMatches('armor') && unequipToInv()) return;
      if (slotMatches('offhand') && unequipToInv()) return;
      if (d && d.type === 'armor' && d.slot && p.armor[d.slot] !== slot) {
        const cur = p.armor[d.slot];
        p.armor[d.slot] = slot;
        rec.set(cur);
        return;
      }
      if (d && d.type === 'shield' && p.offhand !== slot) {
        const cur = p.offhand;
        p.offhand = slot;
        rec.set(cur);
        return;
      }
    }
    if (button === 2) {
      if (this.cursor) {
        if (!slot) { rec.set({ id: this.cursor.id, count: 1 }); this.cursor.count--; }
        else if (slot.id === this.cursor.id && slot.count < stackMax(slot.id)) { slot.count++; this.cursor.count--; rec.set(slot); }
        if (this.cursor && this.cursor.count <= 0) this.cursor = null;
      } else if (slot) {
        const half = Math.ceil(slot.count / 2);
        this.cursor = { id: slot.id, count: half };
        slot.count -= half;
        rec.set(slot.count <= 0 ? null : slot);
      }
      return;
    }
    if (this.cursor) {
      if (!slot) { rec.set(this.cursor); this.cursor = null; }
      else if (slot.id === this.cursor.id) {
        const max = stackMax(slot.id);
        const add = Math.min(max - slot.count, this.cursor.count);
        slot.count += add; this.cursor.count -= add;
        rec.set(slot);
        if (this.cursor.count <= 0) this.cursor = null;
      } else { rec.set(this.cursor); this.cursor = slot; }
    } else if (slot) { this.cursor = slot; rec.set(null); }
  },

  _clickResult() {
    if (this.openKind === 'grindstone') return this._clickGrindstone();
    if (this.openKind === 'anvil') return this._clickAnvil();
    if (this.openKind === 'smithing') return this._clickSmithing();
    if (this.openKind === 'sculkbench') return this._clickSculkBench();
    const res = matchRecipe(this.craftGrid, this.craftW);
    if (!res) return;
    let finalRes;
    if (res.id === I.ENDERITE_ELYTRA) {
      finalRes = { id: res.id, count: res.count };
      const merged = [];
      for (const c of this.craftGrid) {
        if (c && c.ench) for (const e of c.ench) {
          const existing = merged.find((x) => x.n === e.n);
          if (existing) existing.l = Math.max(existing.l, e.l);
          else merged.push({ n: e.n, l: e.l });
        }
      }
      for (const e of merged) if (ENCH_INFO[e.n]) e.l = Math.min(e.l, ENCH_INFO[e.n].max);
      if (merged.length) finalRes.ench = merged;
    } else {
      finalRes = { id: res.id, count: res.count };
    }
    // Tulos suoraan reppuun — ei kursoriin. Lumotut esineet eivät pinoonu joten anna
    // jokainen erikseen suoraan ensimmäiseen tyhjään slottiin jos tarpeen.
    if (finalRes.ench) {
      const p = this.game.player;
      let placed = false;
      for (let i = 0; i < 36; i++) if (!p.inv[i]) { p.inv[i] = finalRes; placed = true; break; }
      if (!placed) return; // reppu täynnä → ei voi craftata
    } else {
      const left = this.game.player.give(finalRes.id, finalRes.count);
      if (left > 0) return; // reppu täynnä → peruuta crafttaus
    }
    for (let i = 0; i < this.craftGrid.length; i++) {
      const c = this.craftGrid[i];
      if (c) { c.count--; if (c.count <= 0) this.craftGrid[i] = null; }
    }
    if (typeof Music !== 'undefined') Music.sfx('craft');
  },

  _clickGrindstone() {
    const cont = this.container;
    const src = cont.left || cont.right;
    if (!src) return;
    const p = this.game.player;
    const cleaned = { id: src.id, count: src.count };
    // Sijoita suoraan reppuun
    let placed = false;
    for (let i = 0; i < 36; i++) if (!p.inv[i]) { p.inv[i] = cleaned; placed = true; break; }
    if (!placed) return;
    if (src.ench && src.ench.length) {
      let xp = 0;
      for (const e of src.ench) xp += 2 + e.l * 2;
      p.addXP(xp);
    }
    if (cont.left) cont.left = null;
    if (cont.right) cont.right = null;
    if (typeof Music !== 'undefined') Music.sfx('craft');
  },

  _clickSculkBench() {
    // Auto-process all sculk blocks straight to inventory (no cursor handling needed)
    this._autoProcessSculkBench(this.container);
  },

  _clickSmithing() {
    const cont = this.container;
    const res = this._smithingResult(cont);
    if (!res) return;
    const p = this.game.player;
    // Sijoita tulos suoraan reppuun
    if (res.ench || res.count === 1) {
      let placed = false;
      for (let i = 0; i < 36; i++) if (!p.inv[i]) { p.inv[i] = res; placed = true; break; }
      if (!placed) return;
    } else {
      const left = p.give(res.id, res.count);
      if (left > 0) return;
    }
    const isDup = ((res.id === I.UPGRADE_TEMPLATE || res.id === I.ENDERITE_TEMPLATE) && res.count === 2);
    if (isDup) {
      cont.left.count -= 7;
      if (cont.left.count <= 0) cont.left = null;
      cont.right.count -= 1;
      if (cont.right.count <= 0) cont.right = null;
      cont.template.count -= 1;
      if (cont.template.count <= 0) cont.template = null;
    } else {
      cont.left = null;
      if (cont.right.count > 1) cont.right.count--; else cont.right = null;
      if (cont.template.count > 1) cont.template.count--; else cont.template = null;
    }
    if (typeof Music !== 'undefined') Music.sfx('craft');
  },

  _clickAnvil() {
    const cont = this.container;
    const res = this._anvilResult(cont);
    if (!res) return;
    const p = this.game.player;
    const creative = p.mode === 'creative';
    // Shulker-kilven kokoaminen on ilmainen (ei XP-vaatimusta)
    const freeCombo = res.id === I.SHULKER_SHIELD;
    let cost = 0;
    if (res.ench) for (const e of res.ench) cost += e.l;
    cost = freeCombo ? 0 : Math.max(1, cost);
    if (!creative && !freeCombo && p.xpLevel < cost) { this.toast('Tarvitset ' + cost + ' tasoa'); return; }
    // Sijoita lumottu tulos suoraan reppuun
    let placed = false;
    for (let i = 0; i < 36; i++) if (!p.inv[i]) { p.inv[i] = res; placed = true; break; }
    if (!placed) return;
    if (!creative) p.spendLevels(cost);
    cont.left = null;
    cont.right = null;
    if (typeof Music !== 'undefined') Music.sfx('craft');
  },

  /* ---------- screens ---------- */
  openInventory(kind, container) {
    this.game.state = 'inventory';
    this.openKind = kind;
    this.container = container || null;
    this.slots = [];
    this.craftW = (kind === 'craft') ? 3 : 2;
    if (kind === 'inv' || kind === 'craft') this.craftGrid = new Array(this.craftW * this.craftW).fill(null);
    this.elScreen.innerHTML = '';
    const win = el('div', 'invwin');

    const titles = { inv: 'Reppu', craft: 'Työpöytä', furnace: 'Uuni', chest: 'Arkku',
      enchant: 'Lumouspöytä', grindstone: 'Hiomakivi', anvil: 'Alasin', smithing: 'Sepänpöytä',
      trade: 'Kyläläinen — Kauppa', brewing: 'Brewing Stand', sculkbench: 'Sculk-työpöytä',
      shulker: 'Shulker-laatikko' };
    const h = el('h3'); h.textContent = titles[kind] || 'Reppu'; win.appendChild(h);

    const bookBtn = el('div', 'recipe-btn');
    bookBtn.textContent = '📖 Reseptikirja';
    bookBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openRecipeBook(); });
    win.appendChild(bookBtn);

    if (kind === 'furnace') this._buildFurnace(win);
    else if (kind === 'chest') this._buildChest(win);
    else if (kind === 'shulker') this._buildChest(win);
    else if (kind === 'enchant') this._buildEnchant(win);
    else if (kind === 'grindstone') this._buildGrindstone(win);
    else if (kind === 'anvil') this._buildAnvil(win);
    else if (kind === 'smithing') this._buildSmithing(win);
    else if (kind === 'trade') this._buildTrade(win);
    else if (kind === 'brewing') this._buildBrewing(win);
    else if (kind === 'sculkbench') this._buildSculkBench(win);
    else this._buildCraft(win);

    if (this.game.player.mode === 'creative' && kind === 'inv') this._buildCreative(win);

    this._buildPlayerInv(win);

    this.elScreen.appendChild(win);
    this.elScreen.classList.remove('hidden');
    this.renderAll();
  },

  _grid(cols, cells) {
    const g = el('div', 'grid');
    g.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    for (const c of cells) g.appendChild(c);
    return g;
  },

  _buildCraft(win) {
    const row = el('div', 'craftrow');
    const w = this.craftW;
    const cells = [];
    for (let i = 0; i < w * w; i++) {
      const idx = i;
      cells.push(this._slotEl(
        () => this.craftGrid[idx],
        (s) => { this.craftGrid[idx] = s; this._refreshResult(); }, false));
    }
    row.appendChild(this._grid(w, cells));
    row.appendChild(el('div', 'arrow')).textContent = '➜';
    this._resultSlot = this._slotEl(() => matchRecipe(this.craftGrid, this.craftW), () => {}, true);
    row.appendChild(this._resultSlot);
    win.appendChild(row);
  },
  _refreshResult() { /* result slot is recomputed on renderAll */ },

  _buildFurnace(win) {
    const f = this.container;
    const row = el('div', 'craftrow');
    const col = el('div');
    col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '6px';
    col.appendChild(this._slotEl(() => f.input, (s) => { f.input = s; }, false));
    const flame = el('div'); flame.style.textAlign = 'center'; flame.style.fontSize = '20px';
    flame.textContent = '🔥'; this._flameEl = flame;
    col.appendChild(flame);
    col.appendChild(this._slotEl(() => f.fuel, (s) => { f.fuel = s; }, false));
    row.appendChild(col);
    const arrow = el('div', 'arrow'); arrow.textContent = '➜'; this._cookArrow = arrow;
    row.appendChild(arrow);
    // Output slot: takeable but nothing can be placed in (accept returns false)
    row.appendChild(this._slotEl(() => f.output, (s) => { f.output = s; }, false, () => false));
    win.appendChild(row);
  },

  _buildChest(win) {
    const c = this.container;
    // Varmuus: korjaa rikkinäinen/tyhjä säiliö, ettei näkymä kaadu (oma reppu ei näkyisi)
    if (c && !Array.isArray(c.slots)) c.slots = new Array(27).fill(null);
    const cells = [];
    for (let i = 0; i < 27; i++) {
      const idx = i;
      cells.push(this._slotEl(() => (c && c.slots ? c.slots[idx] : null), (s) => { if (c && c.slots) c.slots[idx] = s; }, false));
    }
    win.appendChild(this._grid(9, cells));
  },

  _buildEnchant(win) {
    const cont = this.container;
    cont.tool = cont.tool || null;
    cont.lapis = cont.lapis || null;
    const row = el('div', 'craftrow');
    const col = el('div'); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '6px';
    const lbl1 = el('div'); lbl1.textContent = 'Esine'; lbl1.style.fontSize = '11px'; lbl1.style.color = '#444';
    col.appendChild(lbl1);
    col.appendChild(this._slotEl(() => cont.tool, (s) => { cont.tool = s; this._refreshEnchant(); },
      false, (st) => { const d = defOf(st.id); return !!d && (d.type === 'tool' || d.type === 'armor' || d.type === 'bow' || d.type === 'shield' || d.type === 'warden_blaster' || d.type === 'fishing_rod' || st.id === I.BOOK); }));
    const lbl2 = el('div'); lbl2.textContent = 'Lapis'; lbl2.style.fontSize = '11px'; lbl2.style.color = '#444';
    col.appendChild(lbl2);
    col.appendChild(this._slotEl(() => cont.lapis, (s) => { cont.lapis = s; this._refreshEnchant(); },
      false, (st) => st.id === I.LAPIS));
    row.appendChild(col);

    const optsDiv = el('div'); optsDiv.style.display = 'flex'; optsDiv.style.flexDirection = 'column';
    optsDiv.style.gap = '6px'; optsDiv.style.marginLeft = '16px'; optsDiv.style.minWidth = '260px';
    this._enchOptsDiv = optsDiv;
    row.appendChild(optsDiv);
    win.appendChild(row);

    const info = el('div'); info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.textContent = 'Lähellä olevat kirjahyllyt parantavat lumouksia (max 15).';
    if (cont.bookshelves) info.textContent += ' Kirjahyllyjä: ' + cont.bookshelves;
    win.appendChild(info);
    this._refreshEnchant();
  },

  _refreshEnchant() {
    if (!this._enchOptsDiv) return;
    const div = this._enchOptsDiv;
    div.innerHTML = '';
    const cont = this.container;
    const p = this.game.player;
    if (!cont.tool) {
      const m = el('div'); m.textContent = 'Aseta esine yllä olevaan paikkaan.'; m.style.color = '#666';
      div.appendChild(m); return;
    }
    const opts = this.game.generateEnchantOptions(cont.tool, cont.bookshelves || 0);
    if (opts.length === 0) {
      const m = el('div'); m.textContent = 'Tätä esinettä ei voi lumota.'; m.style.color = '#900';
      div.appendChild(m); return;
    }
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      const lapisCost = i + 1;
      const creative = p.mode === 'creative';
      const haveLapis = cont.lapis && cont.lapis.count >= lapisCost;
      const haveLevels = p.xpLevel >= o.cost;
      // Creative-tilassa lumous on ilmainen (kuten panokset/nuolet muuallakin)
      const can = cont.tool && (creative || (haveLapis && haveLevels));
      const btn = el('div');
      btn.style.cssText = 'background:' + (can ? '#4a3a8a' : '#3a3a3a') + ';padding:8px 10px;border:2px solid #000;border-radius:5px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';color:#fff;font-size:12px;';
      const left = '⚡ ' + o.picks.map((p) => (ENCH_INFO[p.n] ? ENCH_INFO[p.n].name : p.n) + ' ' + romanNumeral(p.l)).join(', ');
      const right = creative ? 'Ilmainen (creative)' : (lapisCost + ' Lapis • ' + o.cost + ' tasoa');
      btn.innerHTML = '<div style="display:flex;justify-content:space-between;"><span>' + left + '</span><b style="color:' + (creative || haveLevels ? '#aef' : '#f88') + ';">' + right + '</b></div>';
      if (can) {
        btn.addEventListener('click', () => {
          if (!cont.tool) return;
          if (!creative) {
            if (!cont.lapis || cont.lapis.count < lapisCost || p.xpLevel < o.cost) return;
            cont.lapis.count -= lapisCost;
            if (cont.lapis.count <= 0) cont.lapis = null;
            p.spendLevels(o.cost);
          }
          this.game.applyEnchant(cont.tool, o.picks);
          if (typeof Music !== 'undefined') Music.sfx('craft');
          this._refreshEnchant();
          this.renderAll();
        });
      }
      div.appendChild(btn);
    }
  },

  _buildGrindstone(win) {
    const cont = this.container;
    const row = el('div', 'craftrow');
    const col = el('div'); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '6px';
    col.appendChild(this._slotEl(() => cont.left, (s) => { cont.left = s; this._refreshGrindstone(); }, false));
    col.appendChild(this._slotEl(() => cont.right, (s) => { cont.right = s; this._refreshGrindstone(); }, false));
    row.appendChild(col);
    row.appendChild(el('div', 'arrow')).textContent = '➜';
    // Output is a virtual slot: returns the stripped item, removes inputs on take
    this._grindOut = this._slotEl(() => this._grindstoneResult(cont),
      () => {}, true, () => false);
    row.appendChild(this._grindOut);
    win.appendChild(row);

    const info = el('div'); info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.textContent = 'Hiomakivi poistaa lumoukset ja palauttaa hieman XP:tä.';
    win.appendChild(info);
  },
  _grindstoneResult(cont) {
    const src = cont.left || cont.right;
    if (!src) return null;
    const clean = { id: src.id, count: src.count };
    return clean;
  },
  _refreshGrindstone() { /* result recomputed on render */ },

  _buildAnvil(win) {
    const cont = this.container;
    const row = el('div', 'craftrow');
    const col = el('div'); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '6px';
    col.appendChild(this._slotEl(() => cont.left, (s) => { cont.left = s; }, false));
    col.appendChild(this._slotEl(() => cont.right, (s) => { cont.right = s; }, false));
    row.appendChild(col);
    row.appendChild(el('div', 'arrow')).textContent = '➜';
    this._anvilOut = this._slotEl(() => this._anvilResult(cont),
      () => {}, true, () => false);
    row.appendChild(this._anvilOut);
    win.appendChild(row);

    const info = el('div'); info.id = 'anvilInfo';
    info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.textContent = 'Yhdistä lumoukset toisen esineen tai lumotun kirjan kanssa. Maksaa XP-tasoja.';
    win.appendChild(info);
  },
  _buildSculkBench(win) {
    const cont = this.container;
    // Convert any sculk already in the player's inventory or cursor right away
    this._convertAllPlayerSculk();
    const row = el('div', 'craftrow');
    const col = el('div'); col.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;';
    const lbl = el('div'); lbl.textContent = 'Sculk'; lbl.style.fontSize = '11px'; col.appendChild(lbl);
    col.appendChild(this._slotEl(() => cont.input, (s) => {
      cont.input = s;
      this._autoProcessSculkBench(cont);
    }, false, (st) => st.id === B.SCULK));
    row.appendChild(col);
    row.appendChild(el('div', 'arrow')).textContent = '➜';
    this._sculkOut = this._slotEl(() => this._sculkBenchResult(cont), () => {}, true, () => false);
    row.appendChild(this._sculkOut);
    win.appendChild(row);
    const info = el('div'); info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.textContent = 'Pöytä muuntaa kaiken sculkkisi automaattisesti panoksiksi (5 / lohko).';
    win.appendChild(info);
  },
  _sculkBenchResult(cont) {
    if (!cont.input || cont.input.id !== B.SCULK) return null;
    return { id: I.SCULK_AMMO, count: cont.input.count * 5 };
  },
  _convertAllPlayerSculk(silent) {
    const p = this.game.player;
    let total = 0;
    for (let i = 0; i < 36; i++) {
      const s = p.inv[i];
      if (s && s.id === B.SCULK) {
        total += s.count;
        p.inv[i] = null;
      }
    }
    if (this.cursor && this.cursor.id === B.SCULK) {
      total += this.cursor.count;
      this.cursor = null;
    }
    if (total <= 0) return 0;
    const ammoCount = total * 5;
    const leftover = p.give(I.SCULK_AMMO, ammoCount);
    if (leftover > 0) {
      const wasted = Math.ceil(leftover / 5);
      p.give(B.SCULK, wasted);
    }
    if (typeof Music !== 'undefined') Music.sfx('craft');
    if (!silent) this.toast('+' + (ammoCount - leftover) + ' sculk-panosta inventoryyn');
    return ammoCount - leftover;
  },
  _autoProcessSculkBench(cont) {
    const p = this.game.player;
    let made = 0;
    if (cont && cont.input && cont.input.id === B.SCULK) {
      const ammoCount = cont.input.count * 5;
      const leftover = p.give(I.SCULK_AMMO, ammoCount);
      const consumedAmmo = ammoCount - leftover;
      if (leftover === 0) {
        cont.input = null;
      } else {
        const sculkUsed = Math.floor(consumedAmmo / 5);
        cont.input.count -= sculkUsed;
        if (cont.input.count <= 0) cont.input = null;
      }
      made += consumedAmmo;
    }
    made += this._convertAllPlayerSculk(true);
    if (made > 0) {
      if (typeof Music !== 'undefined') Music.sfx('craft');
      this.toast('+' + made + ' sculk-panosta inventoryyn');
    }
  },

  _buildBrewing(win) {
    const b = this.container;
    const row = el('div', 'craftrow');
    const col1 = el('div'); col1.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;';
    const lbl1 = el('div'); lbl1.textContent = 'Vesi'; lbl1.style.fontSize = '11px'; col1.appendChild(lbl1);
    col1.appendChild(this._slotEl(() => b.water, (s) => { b.water = s; }, false,
      (st) => st.id === I.WATER_BOTTLE));
    const lbl2 = el('div'); lbl2.textContent = 'Ainesosa'; lbl2.style.fontSize = '11px'; col1.appendChild(lbl2);
    // Ainesosapaikka ottaa minkä tahansa esineen vastaan; vain kelvollinen ainesosa
    // (ks. reseptiopas alla) tuottaa juoman. Näin paikka ei "hylkää" tavaraa.
    col1.appendChild(this._slotEl(() => b.ingredient, (s) => { b.ingredient = s; }, false));
    const lbl3 = el('div'); lbl3.textContent = 'Polttoaine'; lbl3.style.fontSize = '11px'; col1.appendChild(lbl3);
    col1.appendChild(this._slotEl(() => b.fuel, (s) => { b.fuel = s; }, false,
      (st) => st.id === I.BLAZE_POWDER));
    row.appendChild(col1);
    const arr = el('div', 'arrow'); arr.textContent = '➜'; this._brewArrow = arr;
    row.appendChild(arr);
    row.appendChild(this._slotEl(() => b.output, (s) => { b.output = s; }, false, () => false));
    win.appendChild(row);
    const info = el('div'); info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.textContent = 'Resepti: vesipullo + kelvollinen ainesosa. Liekkijauhe (polttoaine) tuplaa nopeuden.';
    win.appendChild(info);
    // Reaaliaikainen tilarivi: kertoo mitä puuttuu / miksi ei haudu
    const status = el('div'); status.style.cssText = 'font-size:12px;margin-top:4px;font-weight:bold;';
    this._brewStatus = status;
    win.appendChild(status);
    this._refreshBrewStatus();

    // Reseptiopas: näytä mistä saa minkäkin juoman
    const guide = el('div'); guide.style.cssText = 'margin-top:8px;font-size:11px;color:#cde;background:#2c2c38;border:1px solid #000;border-radius:5px;padding:8px;';
    const title = el('div'); title.textContent = '🧪 Juomareseptit'; title.style.cssText = 'font-weight:bold;color:#fff;margin-bottom:4px;';
    guide.appendChild(title);
    const seen = {};
    for (const key in BREWING) {
      const ingId = Number(key), potId = BREWING[key];
      if (seen[ingId]) continue; seen[ingId] = true;
      const row2 = el('div'); row2.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
      const mk = (id) => { const d = el('div'); const u = tileURLof(id); d.style.cssText = 'width:20px;height:20px;background-size:cover;image-rendering:pixelated;border:1px solid #555;' + (u ? 'background-image:url(' + u + ');' : 'background:#555;'); d.title = blockName(id); return d; };
      row2.appendChild(mk(I.WATER_BOTTLE));
      const plus = el('span'); plus.textContent = '+'; row2.appendChild(plus);
      row2.appendChild(mk(ingId));
      const arr2 = el('span'); arr2.textContent = '➜'; arr2.style.color = '#9af'; row2.appendChild(arr2);
      row2.appendChild(mk(potId));
      const lab = el('span'); lab.textContent = blockName(potId); lab.style.cssText = 'color:#ffd24a;margin-left:4px;'; row2.appendChild(lab);
      guide.appendChild(row2);
    }
    win.appendChild(guide);
  },

  _refreshBrewStatus() {
    if (!this._brewStatus || this.openKind !== 'brewing') return;
    const b = this.container; if (!b) return;
    let msg, col;
    if (b.output) { msg = '✅ Juoma valmis — ota se talteen!'; col = '#7fe07f'; }
    else if (!b.water) { msg = '⚠ Tarvitset vesipullon (yläpaikka)'; col = '#f8a'; }
    else if (!b.ingredient) { msg = '⚠ Lisää ainesosa (keskipaikka)'; col = '#f8a'; }
    else if (BREWING[b.ingredient.id] === undefined) { msg = '❌ Tämä ainesosa ei kelpaa — katso reseptiopas'; col = '#f88'; }
    else { const p = Math.floor(Math.min(1, (b.brew || 0) / 10) * 100); msg = '🫧 Haudutetaan… ' + p + '%'; col = '#9cf'; }
    this._brewStatus.textContent = msg;
    this._brewStatus.style.color = col;
  },

  _buildTrade(win) {
    const trades = this.container.trades;
    const p = this.game.player;
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:380px;';
    for (const t of trades) {
      const div = el('div');
      div.style.cssText = 'background:#3a3a48;border:2px solid #000;padding:8px;border-radius:5px;color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:10px;';
      const giveCol = el('div'); giveCol.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;';
      for (const g of t.give) {
        const ic = el('div');
        const url = tileURLof(g.id);
        ic.style.cssText = 'width:28px;height:28px;background-size:cover;image-rendering:pixelated;border:1px solid #555;' + (url ? 'background-image:url(' + url + ');' : 'background:#555;');
        ic.title = blockName(g.id);
        giveCol.appendChild(ic);
        const lab = el('span'); lab.textContent = '×' + g.n; lab.style.cssText = 'color:#cde;font-weight:bold;';
        giveCol.appendChild(lab);
      }
      const arr = el('div'); arr.textContent = '➜'; arr.style.cssText = 'font-size:18px;color:#9af;';
      const getCol = el('div'); getCol.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const gi = el('div');
      const gurl = tileURLof(t.get);
      gi.style.cssText = 'width:36px;height:36px;background-size:cover;image-rendering:pixelated;border:2px solid #ffd24a;' + (gurl ? 'background-image:url(' + gurl + ');' : 'background:#555;');
      gi.title = blockName(t.get);
      getCol.appendChild(gi);
      const glab = el('span'); glab.textContent = '×' + t.count; glab.style.cssText = 'color:#ffd24a;font-weight:bold;font-size:14px;';
      getCol.appendChild(glab);
      const nameLab = el('div'); nameLab.textContent = blockName(t.get); nameLab.style.cssText = 'flex:1;text-align:right;font-size:11px;color:#aaa;';
      div.appendChild(giveCol); div.appendChild(arr); div.appendChild(getCol); div.appendChild(nameLab);
      div.addEventListener('mouseenter', () => { div.style.background = '#50506a'; });
      div.addEventListener('mouseleave', () => { div.style.background = '#3a3a48'; });
      div.addEventListener('click', () => {
        // Check player has all give items
        for (const g of t.give) {
          let have = 0;
          for (let i = 0; i < 36; i++) if (p.inv[i] && p.inv[i].id === g.id) have += p.inv[i].count;
          if (have < g.n) { this.toast('Tarvitset ' + g.n + '× ' + blockName(g.id)); return; }
        }
        // Consume
        for (const g of t.give) {
          let need = g.n;
          for (let i = 0; i < 36 && need > 0; i++) {
            if (p.inv[i] && p.inv[i].id === g.id) {
              const take = Math.min(p.inv[i].count, need);
              p.inv[i].count -= take; need -= take;
              if (p.inv[i].count <= 0) p.inv[i] = null;
            }
          }
        }
        const left = p.give(t.get, t.count);
        if (left > 0) this.game.spawnDrop(t.get, left, p.pos.x, p.pos.y + 1, p.pos.z);
        this.toast('💰 Kauppa onnistui!');
        if (typeof Music !== 'undefined') Music.sfx('craft');
        this.renderAll();
      });
      wrap.appendChild(div);
    }
    win.appendChild(wrap);
  },

  _buildSmithing(win) {
    const cont = this.container;
    const row = el('div', 'craftrow');
    const col = el('div'); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '4px';
    const labelOf = (txt) => { const e = el('div'); e.textContent = txt; e.style.fontSize = '11px'; e.style.color = '#444'; return e; };
    col.appendChild(labelOf('Sabluuna (netherite/enderite)'));
    col.appendChild(this._slotEl(() => cont.template, (s) => { cont.template = s; }, false,
      (st) => st.id === I.UPGRADE_TEMPLATE || st.id === I.ENDERITE_TEMPLATE));
    col.appendChild(labelOf('Esine (timantti/mace/kilpi/7 timanttia)'));
    col.appendChild(this._slotEl(() => cont.left, (s) => { cont.left = s; }, false,
      (st) => smithingAcceptsBase(st.id) || st.id === I.DIAMOND));
    col.appendChild(labelOf('Materiaali (rauta/timantti/netherite/helvetinkivi)'));
    col.appendChild(this._slotEl(() => cont.right, (s) => { cont.right = s; }, false,
      (st) => smithingAcceptsMaterial(st.id)));
    row.appendChild(col);
    row.appendChild(el('div', 'arrow')).textContent = '➜';
    this._smithOut = this._slotEl(() => this._smithingResult(cont), () => {}, true, () => false);
    row.appendChild(this._smithOut);
    win.appendChild(row);
    const info = el('div'); info.style.fontSize = '11px'; info.style.color = '#555'; info.style.marginTop = '6px';
    info.innerHTML = '<b>Netherite</b>: netherite-sabluuna + timanttiesine + 1 netherite-harkko.<br>'
      + '<b>Enderite</b>: enderite-sabluuna + netherite-esine + 1 enderite-harkko.<br>'
      + '<b>Monista netherite-sabluuna</b>: + 7 timanttia + 1 helvetinkivi → 2 sabluunaa.<br>'
      + '<b>Monista enderite-sabluuna</b>: + 7 timanttia + 1 purpurilohko → 2 sabluunaa.';
    win.appendChild(info);
  },
  _smithingResult(cont) {
    if (!cont.template || !cont.left || !cont.right) return null;
    const tplId = cont.template.id;
    if (tplId !== I.UPGRADE_TEMPLATE && tplId !== I.ENDERITE_TEMPLATE) return null;
    // Duplication: 7 diamonds + 1 netherrack (netherite) or purpur (enderite) → 2 templates
    if (cont.left.id === I.DIAMOND && cont.left.count >= 7) {
      if (tplId === I.UPGRADE_TEMPLATE && cont.right.id === B.NETHERRACK && cont.right.count >= 1) {
        return { id: I.UPGRADE_TEMPLATE, count: 2 };
      }
      if (tplId === I.ENDERITE_TEMPLATE && cont.right.id === B.PURPUR_BLOCK && cont.right.count >= 1) {
        return { id: I.ENDERITE_TEMPLATE, count: 2 };
      }
    }
    // General upgrade: base + material → upgraded
    const upgradeTo = smithingUpgrade(cont.left.id, cont.right.id);
    if (upgradeTo === null) return null;
    // Validate template type matches upgrade path
    const usesNetherite = (DIAMOND_TO_NETHERITE[cont.left.id] !== undefined && cont.right.id === I.NETHERITE_INGOT);
    const usesEnderite = (NETHERITE_TO_ENDERITE && NETHERITE_TO_ENDERITE[cont.left.id] !== undefined && cont.right.id === I.ENDERITE_INGOT);
    if (usesNetherite && tplId !== I.UPGRADE_TEMPLATE) return null;
    if (usesEnderite && tplId !== I.ENDERITE_TEMPLATE) return null;
    const out = { id: upgradeTo, count: 1 };
    if (cont.left.ench) out.ench = cont.left.ench.map((e) => ({ n: e.n, l: e.l }));
    return out;
  },

  _anvilResult(cont) {
    if (!cont.left) return null;
    const left = cont.left, right = cont.right;
    if (!right) return null;
    const ld = defOf(left.id), rd = defOf(right.id);
    if (!ld || !rd) return null;
    // Special: enderite-kilpi + shulker-kuori → shulker-kilpi (säilyttää lumoukset)
    const isShulkerShieldCombo = (
      (left.id === I.ENDERITE_SHIELD && right.id === I.SHULKER_SHELL) ||
      (left.id === I.SHULKER_SHELL && right.id === I.ENDERITE_SHIELD)
    );
    if (isShulkerShieldCombo) {
      const shieldStack = (left.id === I.ENDERITE_SHIELD) ? left : right;
      const out = { id: I.SHULKER_SHIELD, count: 1 };
      if (shieldStack.ench) out.ench = shieldStack.ench.map((e) => ({ n: e.n, l: e.l }));
      return out;
    }
    // Special: enderite chestplate + elytra → enderite elytra (combines enchants)
    const isElytraCombo = (
      (left.id === I.ENDERITE_CHEST && (right.id === I.ELYTRA || right.id === I.ENDERITE_ELYTRA)) ||
      ((left.id === I.ELYTRA || left.id === I.ENDERITE_ELYTRA) && right.id === I.ENDERITE_CHEST)
    );
    if (isElytraCombo) {
      const out = { id: I.ENDERITE_ELYTRA, count: 1, ench: [] };
      for (const src of [left, right]) {
        if (src.ench) for (const e of src.ench) {
          const existing = out.ench.find((x) => x.n === e.n);
          const max = (ENCH_INFO[e.n] && ENCH_INFO[e.n].max) || 5;
          if (existing) existing.l = Math.min(max, Math.max(existing.l, e.l));
          else out.ench.push({ n: e.n, l: Math.min(max, e.l) });
        }
      }
      if (out.ench.length === 0) delete out.ench;
      return out;
    }
    // Accept: same item OR right is enchanted book
    const isBook = rd.type === 'enchbook' && right.ench;
    if (!isBook && left.id !== right.id) return null;
    if (!right.ench || right.ench.length === 0) return null;
    // Combine
    const out = { id: left.id, count: 1, ench: [] };
    if (left.ench) for (const e of left.ench) out.ench.push({ n: e.n, l: e.l });
    for (const e of right.ench) {
      const existing = out.ench.find((x) => x.n === e.n);
      const max = (ENCH_INFO[e.n] && ENCH_INFO[e.n].max) || 5;
      if (existing) existing.l = Math.min(max, existing.l === e.l ? existing.l + 1 : Math.max(existing.l, e.l));
      else out.ench.push({ n: e.n, l: Math.min(max, e.l) });
    }
    return out;
  },

  _buildCreative(win) {
    win.appendChild(el('div', 'section-label')).textContent = 'Creative-valikko (klikkaa = täysi pino)';
    const cells = [];
    const ids = [];
    for (let i = 1; i < 64; i++) if (BLOCKS[i] && i !== B.WATER && i !== B.BEDROCK) ids.push(i);
    for (let i = 64; i < 220; i++) if (ITEMS[i]) ids.push(i);
    for (let i = 200; i < 256; i++) if (BLOCKS[i]) ids.push(i);
    for (const id of ids) {
      cells.push(this._slotEl(
        () => ({ id, count: stackMax(id) }),
        () => {}, false));
      const rec = this.slots[this.slots.length - 1];
      rec.el.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        // Klikkaus creative-valikossa → suora täysi pino reppuun, ei koskaan kursoriin.
        // Sculk-lohko muunnetaan välittömästi sculk-panoksiksi.
        const giveId = (id === B.SCULK) ? I.SCULK_AMMO : id;
        this.game.player.give(giveId, stackMax(giveId));
        this.renderAll();
      }, true);
    }
    win.appendChild(this._grid(13, cells));
  },

  _buildPlayerInv(win) {
    const p = this.game.player;
    win.appendChild(el('div', 'section-label')).textContent = 'Haarniska + sivukäsi';
    const aslots = [];
    for (const key of ['head', 'chest', 'legs', 'feet']) {
      aslots.push(this._slotEl(
        () => p.armor[key],
        (s) => { p.armor[key] = s; },
        false,
        (st) => { const d = defOf(st.id); return !!d && d.type === 'armor' && d.slot === key; }));
    }
    // off-hand (5th slot) — accepts anything but most useful for shields
    aslots.push(this._slotEl(() => p.offhand, (s) => { p.offhand = s; }, false));
    win.appendChild(this._grid(5, aslots));
    win.appendChild(el('div', 'section-label')).textContent = 'Reppu';
    const main = [];
    for (let i = 9; i < 36; i++) {
      const idx = i;
      main.push(this._slotEl(() => p.inv[idx], (s) => { p.inv[idx] = s; }, false));
    }
    win.appendChild(this._grid(9, main));
    const hot = [];
    for (let i = 0; i < 9; i++) {
      const idx = i;
      hot.push(this._slotEl(() => p.inv[idx], (s) => { p.inv[idx] = s; }, false));
    }
    const hg = this._grid(9, hot);
    hg.style.marginTop = '6px';
    win.appendChild(hg);
  },

  openRecipeBook() {
    const old = document.getElementById('recipeOverlay');
    if (old) { old.parentNode.removeChild(old); return; }
    const ov = el('div', 'recipe-overlay');
    ov.id = 'recipeOverlay';
    const win = el('div', 'recipe-window');

    const head = el('h3');
    head.textContent = '📖 Reseptikirja — kaikki craftaukset';
    win.appendChild(head);

    const close = el('div', 'recipe-close');
    close.textContent = '✕ Sulje';
    close.addEventListener('click', () => ov.parentNode.removeChild(ov));
    win.appendChild(close);

    const hint = el('div');
    hint.style.cssText = 'font-size:12px;color:#555;margin-bottom:10px;';
    hint.textContent = 'Aseta ainekset työpöydälle (3×3) tai reppuun (2×2) kuvioidun tai vapaan reseptin mukaan.';
    win.appendChild(hint);

    const makeCell = (id, cls) => {
      const c = el('div', cls || 'recipe-cell');
      if (id) {
        const url = tileURLof(id);
        if (url) c.style.backgroundImage = 'url(' + url + ')';
        c.title = blockName(id);
      }
      return c;
    };

    const renderRecipe = (rec) => {
      const row = el('div', 'recipe-row');
      const wrap = el('div', 'recipe-grid-wrap');
      if (rec.type === 'shaped') {
        const g = el('div', 'recipe-grid');
        g.style.gridTemplateColumns = 'repeat(' + rec.w + ',26px)';
        for (const id of rec.cells) g.appendChild(makeCell(id));
        wrap.appendChild(g);
      } else {
        const g = el('div', 'recipe-shapeless');
        for (const id of rec.ids) g.appendChild(makeCell(id));
        wrap.appendChild(g);
      }
      row.appendChild(wrap);
      const arr = el('div', 'recipe-arrow');
      arr.textContent = '➜';
      row.appendChild(arr);
      const r = el('div', 'recipe-result');
      const url = tileURLof(rec.result.id);
      if (url) r.style.backgroundImage = 'url(' + url + ')';
      if (rec.result.count > 1) {
        const cnt = el('div', 'count');
        cnt.textContent = rec.result.count;
        r.appendChild(cnt);
      }
      row.appendChild(r);
      const lbl = el('div', 'recipe-label');
      lbl.textContent = blockName(rec.result.id);
      row.appendChild(lbl);
      return row;
    };

    const weaponIds = new Set([I.BOW, I.ARROW, I.MACE, I.WIND_CHARGE]);
    const enchantIds = new Set([
      I.SUGAR, I.PAPER, I.BOOK, B.BOOKSHELF, B.ENCHANT_TABLE,
      B.GRINDSTONE, B.ANVIL, B.IRON_BLOCK
    ]);
    const baseIds = new Set([
      B.PLANKS, I.STICK, B.CRAFTING_TABLE, B.FURNACE, B.CHEST, B.TORCH, B.BED,
      B.SANDSTONE, B.STONE_BRICKS, B.GLOWSTONE, B.WOOL,
      B.NETHER_BRICKS, B.QUARTZ_BLOCK, I.FLINT_AND_STEEL, I.BUCKET
    ]);
    const categories = [
      {
        name: 'Perusrakennusosat',
        match: (rid) => baseIds.has(rid)
      },
      {
        name: '✨ Lumous & lisät (kirjat, hyllyt, lumouspöytä, alasin, hiomakivi)',
        match: (rid) => enchantIds.has(rid)
      },
      {
        name: '⚔ Aseet (mace, jousi, nuolet, tuulipanos)',
        match: (rid) => weaponIds.has(rid)
      },
      {
        name: '⛏ Työkalut (hakku, kirves, miekka, lapio — kaikki tasot)',
        match: (rid) => { const d = defOf(rid); return d && d.type === 'tool' && d.kind !== 'mace'; }
      },
      {
        name: '🛡 Haarniska (nahka, rauta, timantti)',
        match: (rid) => { const d = defOf(rid); return d && d.type === 'armor'; }
      }
    ];

    const seen = new Set();
    for (const cat of categories) {
      const recs = RECIPES.filter((r) => cat.match(r.result.id));
      if (recs.length === 0) continue;
      const h2 = el('h3');
      h2.textContent = cat.name;
      h2.style.cssText = 'margin-top:14px;border-bottom:1px solid #888;padding-bottom:3px;';
      win.appendChild(h2);
      for (const r of recs) { win.appendChild(renderRecipe(r)); seen.add(r); }
    }
    const leftovers = RECIPES.filter((r) => !seen.has(r));
    if (leftovers.length > 0) {
      const h2 = el('h3');
      h2.textContent = 'Muut';
      h2.style.cssText = 'margin-top:14px;border-bottom:1px solid #888;padding-bottom:3px;';
      win.appendChild(h2);
      for (const r of leftovers) win.appendChild(renderRecipe(r));
    }

    const smHead = el('h3');
    smHead.textContent = '🔥 Uuni — sulatukset';
    smHead.style.marginTop = '14px';
    win.appendChild(smHead);

    for (const inputId in SMELT) {
      const id = +inputId;
      const outId = SMELT[id];
      const row = el('div', 'recipe-row');
      const wrap = el('div', 'recipe-grid-wrap');
      wrap.appendChild(makeCell(id));
      row.appendChild(wrap);
      const arr = el('div', 'recipe-arrow');
      arr.textContent = '🔥 ➜';
      arr.style.fontSize = '16px';
      row.appendChild(arr);
      const r = el('div', 'recipe-result');
      const ourl = tileURLof(outId);
      if (ourl) r.style.backgroundImage = 'url(' + ourl + ')';
      row.appendChild(r);
      const lbl = el('div', 'recipe-label');
      lbl.textContent = blockName(id) + ' → ' + blockName(outId);
      row.appendChild(lbl);
      win.appendChild(row);
    }

    ov.appendChild(win);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.parentNode.removeChild(ov); });
    document.body.appendChild(ov);
  },

  closeScreen() {
    // return crafting-grid / enchant / anvil / grindstone items & cursor to inventory
    const p = this.game.player;
    const returnSlot = (s) => {
      if (!s) return;
      // Preserve enchantments by inserting the item object directly
      const max = stackMax(s.id);
      let left = s.count;
      // First try to merge into matching unenchanted stacks; for enchanted, just place in first empty
      if (s.ench && s.ench.length) {
        for (let i = 0; i < 36; i++) if (!p.inv[i]) { p.inv[i] = { id: s.id, count: 1, ench: s.ench }; left -= 1; break; }
        if (left > 0) this.game.spawnDrop(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
      } else {
        left = p.give(s.id, left);
        if (left > 0) this.game.spawnDrop(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
      }
    };
    for (const c of this.craftGrid) returnSlot(c);
    this.craftGrid = [];
    if (this.container) {
      for (const k of ['tool', 'lapis', 'left', 'right', 'template']) if (this.container[k]) { returnSlot(this.container[k]); this.container[k] = null; }
    }
    if (this.cursor) {
      returnSlot(this.cursor);
      this.cursor = null;
    }
    this.slots = [];
    this.elScreen.classList.add('hidden');
    this.elScreen.innerHTML = '';
    const ro = document.getElementById('recipeOverlay');
    if (ro && ro.parentNode) ro.parentNode.removeChild(ro);
    this.openKind = null; this.container = null;
    this.game.state = 'play';
    this.refresh();
    if (this.game.canvas) this.game.canvas.requestPointerLock();
  },

  tickFurnaceUI() {
    if (this.openKind === 'furnace' && this.container) {
      const f = this.container;
      this._flameEl.style.opacity = f.burn > 0 ? '1' : '0.25';
      const prog = f.burnMax > 0 ? Math.min(1, f.cook / SMELT_TIME) : 0;
      this._cookArrow.textContent = prog > 0.66 ? '➜➜➜' : prog > 0.33 ? '➜➜' : '➜';
      this.renderAll();
    } else if (this.openKind === 'brewing' && this.container) {
      // Näytä haudutuksen edistyminen ja valmis juoma reaaliajassa
      const b = this.container;
      if (this._brewArrow) {
        const p = Math.min(1, (b.brew || 0) / 10);
        this._brewArrow.textContent = p > 0.66 ? '➜➜➜' : p > 0.33 ? '➜➜' : '➜';
      }
      this._refreshBrewStatus();
      this.renderAll();
    }
  }
};
