/* CopyCraft — player: movement, stats, inventory */
'use strict';

function miningTime(blockId, toolItem) {
  const bd = BLOCKS[blockId];
  if (!bd || bd.hardness === Infinity) return Infinity;
  // Warden Blaster mines sculk instantly
  if (toolItem && toolItem.id === I.WARDEN_BLASTER && blockId === B.SCULK) return 0.05;
  let mul = 1;
  // toolItem may be the inventory entry {id,count,ench?} OR a bare id (back-compat)
  let toolId = 0, ench = null;
  if (toolItem && typeof toolItem === 'object') { toolId = toolItem.id; ench = toolItem.ench; }
  else if (toolItem) toolId = toolItem;
  const tool = toolId ? ITEMS[toolId] : null;
  if (tool && tool.type === 'tool' && tool.kind === bd.tool && bd.tool !== 'none') mul = tool.mineSpeed;
  // Efficiency: each level adds level^2 + 1 to mining speed when tool matches block
  if (ench && tool && tool.type === 'tool' && tool.kind === bd.tool && bd.tool !== 'none') {
    for (const e of ench) if (e.n === 'efficiency') mul += e.l * e.l + 1;
  }
  return Math.max(0.05, bd.hardness * 1.5 / mul);
}
function canHarvest(blockId, toolId) {
  const bd = BLOCKS[blockId];
  if (!bd || bd.tool !== 'pickaxe') return true;
  const tool = toolId ? ITEMS[toolId] : null;
  const tier = (tool && tool.type === 'tool' && tool.kind === 'pickaxe') ? tool.tier : 0;
  return tier >= (bd.minTier || 1);
}

class Player {
  constructor(spawn, mode) {
    this.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spawn = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.yaw = 0; this.pitch = 0;
    this.hw = 0.3; this.height = 1.8; this.eye = 1.62;
    this.mode = mode;
    this.flying = mode === 'creative';
    this.onGround = false;
    this.health = 20; this.maxHealth = 20;
    this.hunger = 20; this.maxHunger = 20;
    this.alive = true;
    this.kbx = 0; this.kbz = 0;
    this.peakY = spawn.y;
    this.windJump = false;
    this.hurtCD = 0;
    this.fireTimer = 0;           // sekunteja jäljellä palamista
    this._burnAcc = 0;            // palovahingon ajastin
    this.regenT = 0; this.starveT = 0;
    this.selected = 0;
    this.inv = new Array(36).fill(null);
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this.offhand = null;
    this.home = null;
    this.homeSet = false;
    this.xp = 0;
    this.xpLevel = 0;
    this.xpInLevel = 0;
    this.xpToNext = 7;
    this.absorption = 0;          // extra HP eaten before health
    this.resistanceUntil = 0;     // ms timestamp, 50% damage reduction while active
    this.fireResUntil = 0;        // ms timestamp, immune to fire/lava
    this.regenUntil = 0;          // ms timestamp, fast HP regen while active
    this.regenTimer = 0;
    this.swiftnessUntil = 0;      // ms timestamp, +30% move speed
    this.strengthUntil = 0;       // ms timestamp, +50% melee damage
    this.levitationUntil = 0;     // ms timestamp, kelluu ylöspäin (shulker-efekti)
    this.shieldDisabledUntil = 0; // ms timestamp, kilpi pois käytöstä (kirves)
    if (mode === 'creative') {
      this.give(I.WOOD_PICKAXE, 1); this.give(I.WOOD_SWORD, 1);
      this.give(I.BOW, 1); this.give(I.ARROW, 64);
      this.give(B.TORCH, 64);
    } else {
      this.give(B.LOG, 6); this.give(I.APPLE, 3);
    }
    this.give(I.HOME_BUTTON, 1);
  }

  currentItem() { return this.inv[this.selected]; }

  give(id, count) {
    const max = (defOf(id) && defOf(id).stack) || 64;
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.inv[i];
      if (s && s.id === id && s.count < max) {
        const add = Math.min(max - s.count, count);
        s.count += add; count -= add;
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.inv[i]) {
        const add = Math.min(max, count);
        this.inv[i] = { id, count: add }; count -= add;
      }
    }
    return count;
  }

  // Lisää valmis stack-objekti reppuun säilyttäen lisäkentät (esim. shulker-laatikon sisältö)
  giveStack(stack) {
    if (!stack) return false;
    for (let i = 0; i < 36; i++) {
      if (!this.inv[i]) { this.inv[i] = stack; return true; }
    }
    return false;   // täynnä
  }

  // Leijunta (shulker-efekti): kelluu ylöspäin annetuksi ajaksi
  levitate(seconds) {
    if (!this.alive || this.mode === 'creative' || this.mode === 'spectator') return;
    this.levitationUntil = Math.max(this.levitationUntil, Date.now() + seconds * 1000);
  }

  // Kilpi pois käytöstä (kirves)
  disableShield(seconds) {
    this.shieldDisabledUntil = Math.max(this.shieldDisabledUntil, Date.now() + seconds * 1000);
  }

  _recalcXP() {
    let lvl = 0, remain = this.xp;
    while (remain >= 2 * lvl + 7) { remain -= 2 * lvl + 7; lvl++; }
    this.xpLevel = lvl;
    this.xpInLevel = remain;
    this.xpToNext = 2 * lvl + 7;
  }
  addXP(n) { this.xp += n; this._recalcXP(); }
  spendLevels(n) {
    if (this.xpLevel < n) return false;
    let needed = 0;
    for (let k = 0; k < this.xpLevel - n; k++) needed += 2 * k + 7;
    this.xp = needed;
    this._recalcXP();
    return true;
  }

  consumeSelected(n) {
    const s = this.inv[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inv[this.selected] = null;
  }

  armorPoints() {
    let pts = 0;
    for (const k in this.armor) {
      const it = this.armor[k];
      if (it) { const d = defOf(it.id); if (d && d.defense) pts += d.defense; }
    }
    return pts;
  }
  protectionLevel() {
    let sum = 0;
    for (const k in this.armor) sum += enchantLevel(this.armor[k], 'protection');
    return sum;
  }

  // Sytytä pelaaja palamaan annetuksi ajaksi (sekunteina)
  ignite(seconds) {
    if (!this.alive || this.mode === 'creative' || this.mode === 'spectator') return;
    if (this.fireResUntil > Date.now()) return;   // tulisuoja estää syttymisen
    this.fireTimer = Math.max(this.fireTimer, seconds);
  }

  hurt(dmg, fromX, fromZ, cause) {
    if (!this.alive || this.mode === 'creative' || this.mode === 'spectator' || this.hurtCD > 0) return;
    // Fire resistance: skip lava/fire damage entirely
    if (this.fireResUntil > Date.now() && cause && /laava|tuli|palo/.test(cause)) return;
    const reduce = Math.min(0.8, this.armorPoints() * 0.04 + this.protectionLevel() * 0.04);
    dmg = Math.max(1, Math.round(dmg * (1 - reduce)));
    // Resistance buff: -50% damage
    if (this.resistanceUntil > Date.now()) dmg = Math.max(1, Math.floor(dmg * 0.5));
    // Absorption hearts soak first
    if (this.absorption > 0) {
      const soak = Math.min(this.absorption, dmg);
      this.absorption -= soak; dmg -= soak;
    }
    if (dmg > 0) this.health -= dmg;
    this.hurtCD = 0.5;
    if (cause) this.lastDamageCause = cause;
    if (fromX !== undefined) {
      const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
      const L = Math.hypot(dx, dz) || 1;
      this.kbx += dx / L * 5; this.kbz += dz / L * 5;
      this.vel.y = Math.max(this.vel.y, 5);
    }
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  feed(n) { this.hunger = Math.min(this.maxHunger, this.hunger + n); }

  respawn() {
    this.pos = { x: this.spawn.x, y: this.spawn.y + 2, z: this.spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.alive = true;
    this.peakY = this.pos.y;
    this.kbx = this.kbz = 0;
  }

  update(dt, input, game) {
    if (!this.alive) return;
    this.hurtCD = Math.max(0, this.hurtCD - dt);

    const world = game.world;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos, rx = cos, rz = -sin;
    const fb = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
    const lr = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let wx = fx * fb + rx * lr, wz = fz * fb + rz * lr;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const headBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.4), Math.floor(this.pos.z));
    const feetBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z));
    const inWater = headBlock === B.WATER || feetBlock === B.WATER;
    const inLava = headBlock === B.LAVA || feetBlock === B.LAVA;

    let speed = this.flying ? 9.5 : (input.sprint && fb > 0 && this.hunger > 6 ? 5.8 : 4.3);
    if (input.sneak && !this.flying) speed *= 0.4;
    if (inLava && !this.flying) speed *= 0.45;   // laavassa liikkuu hitaasti
    // Haste (bat enchant): boost speed while holding an enchanted bat
    const held = this.currentItem();
    if (held) {
      const haste = enchantLevel(held, 'haste');
      const heldDef = ITEMS[held.id];
      if (haste > 0 && heldDef && heldDef.kind === 'bat') speed *= (1 + haste * 0.15);
    }
    // Swiftness potion — selvä nopeusboosti
    if (this.swiftnessUntil > Date.now()) speed *= 1.7;

    this.vel.x = wx * speed + this.kbx;
    this.vel.z = wz * speed + this.kbz;
    this.kbx *= 0.8; this.kbz *= 0.8;

    // Elytra glide — chest slot must be elytra, in air, not flying-creative
    const hasElytra = this.armor && this.armor.chest && defOf(this.armor.chest.id) && defOf(this.armor.chest.id).elytra;
    const elytraGliding = hasElytra && !this.flying && !this.onGround && input.jump && !inWater;
    const levitating = this.levitationUntil > Date.now() && !this.flying;
    if (this.flying) {
      this.vel.y = (input.jump ? 1 : 0) * 9 - (input.sneak ? 1 : 0) * 9;
    } else if (levitating) {
      // Leijunta: nousee tasaisesti ylöspäin (kuten Minecraftin Levitation)
      this.vel.y = 3.0;
      this.peakY = this.pos.y;   // ei putoamisvahinkoa leijunnan aikana
    } else if (elytraGliding) {
      // glide: slow descent, forward thrust from look direction
      const lookCos = Math.cos(this.pitch);
      const fwdX = -Math.sin(this.yaw) * lookCos, fwdZ = -Math.cos(this.yaw) * lookCos;
      const glideSpeed = 12;
      this.vel.x = fwdX * glideSpeed + this.kbx;
      this.vel.z = fwdZ * glideSpeed + this.kbz;
      // vertical depends on pitch: looking down → faster fall, looking up → climb briefly
      this.vel.y = -Math.sin(this.pitch) * 12 - 2;
      this.peakY = this.pos.y;  // no fall damage during glide
    } else if (inWater) {
      this.vel.y -= 9 * dt;
      if (this.vel.y < -3.5) this.vel.y = -3.5;
      if (input.jump) this.vel.y = 4.5;
    } else if (inLava) {
      // Laavassa uidaan hitaasti: vajoaa hitaasti, hypyllä nousee — pääsee pois
      this.vel.y -= 7 * dt;
      if (this.vel.y < -2.0) this.vel.y = -2.0;
      if (input.jump) this.vel.y = 3.2;
    } else {
      this.vel.y -= 30 * dt;
      if (input.jump && this.onGround) { this.vel.y = 8.7; this.onGround = false; }
    }
    if (this.vel.y < -55) this.vel.y = -55;

    let res;
    if (this.mode === 'spectator') {
      // No collision — fly through walls
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.pos.z += this.vel.z * dt;
      this.vel.y *= 0.9; // damping so you don't accelerate forever
      res = { onGround: false, hitX: false, hitZ: false };
    } else {
      res = moveAndCollide(world, this.pos, this.vel, this.hw, this.height, dt);
    }
    const landed = res.onGround && !this.onGround;
    this.onGround = res.onGround;

    // fall damage
    if (!this.flying) {
      if (this.onGround || inWater || inLava) {
        if (landed && !inWater && !inLava) {
          if (this.windJump) {
            this.windJump = false;          // wind-charge launches don't hurt on landing
          } else {
            const fall = this.peakY - this.pos.y;
            if (fall > 4) {
              const ff = enchantLevel(this.armor.feet, 'feather_falling');
              const dmg = Math.max(0, Math.floor((fall - 3) * (1 - ff * 0.12)));
              if (dmg > 0) this.hurt(dmg, undefined, undefined, 'putosit liian korkealta');
            }
          }
        }
        this.peakY = this.pos.y;
      } else {
        this.peakY = Math.max(this.peakY, this.pos.y);
      }
    }

    // cactus / void
    if (this.hurtCD <= 0) {
      for (const dx of [-this.hw, this.hw]) for (const dz of [-this.hw, this.hw]) {
        if (world.getBlock(Math.floor(this.pos.x + dx), Math.floor(this.pos.y + 0.6), Math.floor(this.pos.z + dz)) === B.CACTUS) {
          this.hurt(1, undefined, undefined, 'kaktus piikit'); break;
        }
      }
    }
    // Void = instant death (bypasses armor, absorption and resistance)
    // In the End the void starts higher: dropping below the central island (y=38) means certain death
    const voidY = (game.dimension === 'end') ? 25 : -3;
    if (this.pos.y < voidY && this.mode !== 'creative' && this.mode !== 'spectator') {
      this.health = 0;
      this.absorption = 0;
      this.alive = false;
      this.lastDamageCause = 'tyhjyys (void)';
    }
    // Laava ja tuli: vahingoittaa ja sytyttää pelaajan palamaan
    const midBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z));
    if (inWater) this.fireTimer = 0;   // vesi sammuttaa
    if (inLava || midBlock === B.LAVA) {
      if (this.hurtCD <= 0) this.hurt(4, undefined, undefined, 'paloit laavassa');
      this.ignite(8);   // jää palamaan vielä laavasta noustua
    } else if (feetBlock === B.FIRE || headBlock === B.FIRE || midBlock === B.FIRE) {
      this.ignite(5);   // tulessa palaa
    }
    // Palaminen: jatkuva vahinko ajan myötä (tulisuoja estää)
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      if (this.fireResUntil > Date.now()) { this.fireTimer = 0; this._burnAcc = 0; }
      else {
        this._burnAcc += dt;
        while (this._burnAcc >= 1.0) {
          this._burnAcc -= 1.0;
          if (this.hurtCD <= 0) this.hurt(1, undefined, undefined, 'palat tulessa');
        }
      }
      if (this.fireTimer < 0) this.fireTimer = 0;
    }

    // Regeneration buff — nopea elämän palautus (2 hp/s)
    if (this.regenUntil > Date.now() && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 0.5) { this.regenTimer -= 0.5; this.heal(1); }
    } else { this.regenTimer = 0; }

    // hunger & regen
    if (this.mode !== 'creative') {
      this.hunger -= dt * (0.012 + (input.sprint && fb > 0 ? 0.05 : 0) + (Math.abs(wx) + Math.abs(wz) > 0 ? 0.01 : 0));
      if (this.hunger < 0) this.hunger = 0;
      if (this.health < this.maxHealth && this.hunger >= 17) {
        this.regenT += dt;
        if (this.regenT >= 3) { this.regenT = 0; this.heal(1); this.hunger -= 0.6; }
      }
      if (this.hunger <= 0 && this.health > 1) {
        this.starveT += dt;
        if (this.starveT >= 4) {
          this.starveT = 0;
          this.health -= 1;
          this.lastDamageCause = 'nälkä';
          if (this.health <= 0) { this.health = 0; this.alive = false; }
        }
      }
    }
  }
}
