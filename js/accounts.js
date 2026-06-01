/* Bettercraft — Firebase-backed accounts & world saves.
 * Shared identity via /users (same format as Lisko Racing).
 * Game-specific data at /bettercraft/users and /bettercraft/worlds. */
'use strict';

const FIREBASE_DB_URL = 'https://lisko-racing-default-rtdb.europe-west1.firebasedatabase.app';

const Accounts = {
  AUTH_KEY: 'cc_session_v2',
  current: null,         // playerId (lowercase, sanitized)
  currentName: null,     // display username (original case)

  /* ---------------- shared identity helpers ---------------- */
  hashPassword(password) {
    // Matches Lisko Racing hashPassword exactly so /users is interoperable.
    const salt = 'lisko_racing_2024';
    const salted = salt + password + salt;
    let h = 0;
    for (let i = 0; i < salted.length; i++) {
      h = ((h << 5) - h) + salted.charCodeAt(i);
      h = h & h;
    }
    let result = Math.abs(h).toString(16);
    for (let j = 1; j <= 4; j++) {
      let h2 = h * j;
      for (let i = 0; i < salted.length; i++) {
        h2 = ((h2 << 5) - h2) + salted.charCodeAt(i) * j;
        h2 = h2 & h2;
      }
      result += Math.abs(h2).toString(16);
    }
    return result.padStart(32, '0');
  },

  getPlayerId(name) {
    return (name || '').trim().toLowerCase().replace(/[^a-z0-9äöå]/gi, '_');
  },

  /* ---------------- auth ---------------- */
  async create(user, pass) {
    user = (user || '').trim();
    if (user.length < 2) return 'Käyttäjänimi liian lyhyt';
    if ((pass || '').length < 3) return 'Salasana liian lyhyt (väh. 3 merkkiä)';
    const playerId = this.getPlayerId(user);
    let existing;
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/users/${playerId}.json`);
      existing = await r.json();
    } catch (e) {
      return 'Yhteys Firebaseen epäonnistui';
    }
    if (existing) return 'Tili on jo olemassa';
    await fetch(`${FIREBASE_DB_URL}/users/${playerId}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user,
        password: this.hashPassword(pass),
        created: new Date().toISOString()
      })
    });
    return null;
  },

  async login(user, pass) {
    user = (user || '').trim();
    if (!user) return 'Anna käyttäjänimi';
    const playerId = this.getPlayerId(user);
    let info;
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/users/${playerId}.json`);
      info = await r.json();
    } catch (e) {
      return 'Yhteys Firebaseen epäonnistui';
    }
    if (!info) return 'Tiliä ei löydy';
    if (info.password !== this.hashPassword(pass)) return 'Väärä salasana';
    this.current = playerId;
    this.currentName = info.username;
    try {
      localStorage.setItem(this.AUTH_KEY, JSON.stringify({ playerId, username: info.username, ts: Date.now() }));
    } catch (e) {}
    // Migrate any local cc_world_* worlds that aren't already in Firebase
    await this._migrateLocalWorlds();
    return null;
  },

  async restore() {
    try {
      const raw = localStorage.getItem(this.AUTH_KEY);
      if (!raw) return false;
      const sess = JSON.parse(raw);
      if (!sess || !sess.playerId) return false;
      const r = await fetch(`${FIREBASE_DB_URL}/users/${sess.playerId}.json`);
      const info = await r.json();
      if (!info) return false;
      this.current = sess.playerId;
      this.currentName = info.username;
      return true;
    } catch (e) { return false; }
  },

  logout() {
    this.current = null;
    this.currentName = null;
    try { localStorage.removeItem(this.AUTH_KEY); } catch (e) {}
  },

  /* ---------------- world data ---------------- */
  newWorldId() { return 'w' + Date.now() + Math.floor(Math.random() * 1000); },

  async worlds() {
    if (!this.current) return [];
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/worldIds.json`);
      const meta = (await r.json()) || {};
      const out = [];
      for (const id in meta) {
        const m = meta[id];
        if (m && typeof m === 'object') {
          out.push({ id, name: m.name || 'Maailma', type: m.type || 'normal', mode: m.mode || 'survival', played: m.played || 0 });
        }
      }
      out.sort((x, y) => y.played - x.played);
      return out;
    } catch (e) {
      console.warn('worlds() failed:', e);
      return [];
    }
  },

  async loadWorld(id) {
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${id}.json`);
      return await r.json();
    } catch (e) {
      console.warn('loadWorld() failed:', e);
      return null;
    }
  },

  async saveWorld(data) {
    if (!this.current) throw new Error('Ei kirjautunut');
    data.owner = this.current;
    data.played = Date.now();
    // Push full world data
    await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${data.id}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    // Update the user's metadata index (fast worlds() listing)
    await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/worldIds/${data.id}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, type: data.type, mode: data.mode, played: data.played })
    });
  },

  async deleteWorld(id) {
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${id}.json`, { method: 'DELETE' });
      if (this.current) {
        await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/worldIds/${id}.json`, { method: 'DELETE' });
      }
    } catch (e) { console.warn('deleteWorld() failed:', e); }
  },

  /* ---------------- friends ---------------- */
  async _heartbeat() {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/profile.json`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.currentName, lastSeen: Date.now() })
      });
    } catch (e) {}
  },

  async searchUser(name) {
    const playerId = this.getPlayerId(name);
    if (!playerId) return null;
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/users/${playerId}.json`);
      const info = await r.json();
      if (!info) return null;
      const r2 = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${playerId}/profile.json`);
      const prof = (await r2.json()) || {};
      return { playerId, username: info.username, lastSeen: prof.lastSeen || 0 };
    } catch (e) { return null; }
  },

  async sendFriendRequest(targetId, targetName) {
    if (!this.current || targetId === this.current) return 'Et voi lisätä itseäsi';
    try {
      // Check if already friends
      const fr = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friends/${targetId}.json`);
      if (await fr.json()) return 'Olette jo kavereita';
      // Write pending request on target's side
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${targetId}/friendRequests/${this.current}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.currentName, ts: Date.now() })
      });
      return null;
    } catch (e) { return 'Pyyntö epäonnistui'; }
  },

  async getFriendRequests() {
    if (!this.current) return [];
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friendRequests.json`);
      const data = (await r.json()) || {};
      return Object.entries(data).map(([id, m]) => ({ id, from: (m && m.from) || id, ts: (m && m.ts) || 0 }));
    } catch (e) { return []; }
  },

  async acceptFriend(otherId, otherName) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friends/${otherId}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: otherName, since: Date.now() })
      });
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${otherId}/friends/${this.current}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.currentName, since: Date.now() })
      });
      // Remove pending request
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friendRequests/${otherId}.json`, { method: 'DELETE' });
    } catch (e) { console.warn('acceptFriend failed', e); }
  },

  async rejectFriend(otherId) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friendRequests/${otherId}.json`, { method: 'DELETE' });
    } catch (e) {}
  },

  async getFriends() {
    if (!this.current) return [];
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friends.json`);
      const data = (await r.json()) || {};
      const friends = [];
      for (const [id, m] of Object.entries(data)) {
        // Fetch their lastSeen
        let lastSeen = 0;
        try {
          const r2 = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${id}/profile.json`);
          const prof = await r2.json();
          if (prof && prof.lastSeen) lastSeen = prof.lastSeen;
        } catch (e) {}
        friends.push({ id, name: (m && m.name) || id, since: (m && m.since) || 0, lastSeen });
      }
      friends.sort((a, b) => b.lastSeen - a.lastSeen);
      return friends;
    } catch (e) { return []; }
  },

  /* ---------------- voice signaling (WebRTC) ---------------- */
  async sendSignal(worldId, toUid, payload) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/voice/${toUid}/${this.current}.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ts: Date.now() })
      });
    } catch (e) {}
  },
  async fetchSignals(worldId) {
    if (!this.current) return [];
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/voice/${this.current}.json`);
      const data = (await r.json()) || {};
      const out = [];
      for (const [fromUid, byId] of Object.entries(data)) {
        if (!byId) continue;
        for (const [id, msg] of Object.entries(byId)) out.push({ fromUid, id, ...msg });
      }
      out.sort((a, b) => a.ts - b.ts);
      return out;
    } catch (e) { return []; }
  },
  async clearSignal(worldId, fromUid, id) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/voice/${this.current}/${fromUid}/${id}.json`, { method: 'DELETE' });
    } catch (e) {}
  },

  /* ---------------- co-op multiplayer ---------------- */
  async markWorldOpen(worldId, name, dimension) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/open.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: this.current, hostName: this.currentName, name, dimension: dimension || 'overworld', ts: Date.now() })
      });
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/profile.json`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openWorldId: worldId, openWorldName: name })
      });
    } catch (e) {}
  },
  async markWorldClosed(worldId) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/open.json`, { method: 'DELETE' });
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/profile.json`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openWorldId: null, openWorldName: null })
      });
    } catch (e) {}
  },
  async getFriendOpenWorld(friendId) {
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${friendId}/profile.json`);
      const prof = (await r.json()) || {};
      if (!prof.openWorldId) return null;
      const r2 = await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${prof.openWorldId}/open.json`);
      const open = await r2.json();
      if (!open) return null;
      return { worldId: prof.openWorldId, name: prof.openWorldName || open.name, host: open.host, hostName: open.hostName };
    } catch (e) { return null; }
  },
  async syncPlayerState(worldId, state) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/players/${this.current}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, name: this.currentName, ts: Date.now() })
      });
    } catch (e) {}
  },
  async leaveWorld(worldId) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/players/${this.current}.json`, { method: 'DELETE' });
    } catch (e) {}
  },
  async fetchOtherPlayers(worldId) {
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/players.json`);
      const data = (await r.json()) || {};
      const now = Date.now();
      const out = [];
      for (const [uid, p] of Object.entries(data)) {
        if (uid === this.current) continue;
        if (!p || (now - (p.ts || 0)) > 20000) continue;
        out.push({ uid, ...p });
      }
      return out;
    } catch (e) { return []; }
  },
  async pushLiveEdit(worldId, x, y, z, blockId, dim) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/liveEdits.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, z, b: blockId, d: dim || 'overworld', uid: this.current, ts: Date.now() })
      });
    } catch (e) {}
  },
  async pushPlayerDamage(worldId, toUid, dmg, fromName, fx, fz) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/damage/${toUid}.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.current, fromName: this.currentName || fromName, dmg, fx, fz, ts: Date.now() })
      });
    } catch (e) {}
  },
  async fetchPlayerDamage(worldId) {
    if (!this.current) return [];
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/damage/${this.current}.json`);
      const data = (await r.json()) || {};
      return Object.entries(data).map(([id, d]) => ({ id, ...d }));
    } catch (e) { return []; }
  },
  async clearPlayerDamage(worldId, id) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/damage/${this.current}/${id}.json`, { method: 'DELETE' });
    } catch (e) {}
  },

  async fetchLiveEdits(worldId, sinceTs) {
    try {
      const url = `${FIREBASE_DB_URL}/bettercraft/worlds/${worldId}/liveEdits.json?orderBy="ts"&startAt=${sinceTs + 1}&limitToLast=200`;
      const r = await fetch(url);
      const data = (await r.json()) || {};
      const out = Object.entries(data).map(([id, e]) => ({ id, ...e }));
      out.sort((a, b) => a.ts - b.ts);
      return out;
    } catch (e) { return []; }
  },

  /* ---------------- chat ---------------- */
  async sendChatMessage(text, channel) {
    if (!this.current || !text) return;
    channel = channel || 'global';
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/chat/${channel}.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: this.currentName, uid: this.current, text: text.slice(0, 200), ts: Date.now() })
      });
    } catch (e) {}
  },

  async fetchChatSince(sinceTs, channel) {
    channel = channel || 'global';
    try {
      const url = `${FIREBASE_DB_URL}/bettercraft/chat/${channel}.json?orderBy="ts"&startAt=${sinceTs + 1}&limitToLast=50`;
      const r = await fetch(url);
      const data = (await r.json()) || {};
      const out = Object.entries(data).map(([id, m]) => ({ id, ...m }));
      out.sort((a, b) => a.ts - b.ts);
      return out;
    } catch (e) { return []; }
  },

  async removeFriend(otherId) {
    if (!this.current) return;
    try {
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/friends/${otherId}.json`, { method: 'DELETE' });
      await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${otherId}/friends/${this.current}.json`, { method: 'DELETE' });
    } catch (e) {}
  },

  /* ---------------- migration from old localStorage ---------------- */
  async _migrateLocalWorlds() {
    if (!this.current) return;
    let existingMeta;
    try {
      const r = await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/worldIds.json`);
      existingMeta = (await r.json()) || {};
    } catch (e) { existingMeta = {}; }
    const localKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('cc_world_') === 0) localKeys.push(k);
    }
    let migrated = 0;
    for (const k of localKeys) {
      const id = k.slice('cc_world_'.length);
      if (existingMeta[id]) continue;
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (!data) continue;
        data.id = id;
        data.owner = this.current;
        data.played = data.played || Date.now();
        await fetch(`${FIREBASE_DB_URL}/bettercraft/worlds/${id}.json`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        await fetch(`${FIREBASE_DB_URL}/bettercraft/users/${this.current}/worldIds/${id}.json`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name || 'Maailma', type: data.type || 'normal', mode: data.mode || 'survival', played: data.played })
        });
        migrated++;
      } catch (e) { console.warn('migrate failed for', id, e); }
    }
    if (migrated > 0) console.log('Bettercraft: migrated', migrated, 'maailmaa localStoragesta Firebaseen');
  }
};
