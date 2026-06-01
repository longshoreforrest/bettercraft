/* CopyCraft — blocks, items & procedural textures */
'use strict';

/* ============================ Texture system ============================ */
function _px(c, x, y, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); }
function _rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function _speckle(c, r, cols) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    _px(c, x, y, cols[(r() * cols.length) | 0]);
  }
}
function _blobs(c, r, n, sz, cols) {
  for (let i = 0; i < n; i++) {
    const bx = (r() * 16) | 0, by = (r() * 16) | 0, col = cols[(r() * cols.length) | 0];
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      if (r() < 0.62) _px(c, (bx + dx) & 15, (by + dy) & 15, col);
    }
  }
}

const Tex = {
  COLS: 16, SIZE: 16, painters: [], index: {}, tileURL: [], rows: 1,
  add(name, fn) { const i = this.painters.length; this.painters.push(fn); this.index[name] = i; return i; },
  build() {
    const COLS = this.COLS, S = this.SIZE;
    this.rows = Math.max(1, Math.ceil(this.painters.length / COLS));
    const cv = document.createElement('canvas');
    cv.width = COLS * S; cv.height = this.rows * S;
    const atx = cv.getContext('2d');
    const tcv = document.createElement('canvas'); tcv.width = S; tcv.height = S;
    const tcx = tcv.getContext('2d');
    for (let i = 0; i < this.painters.length; i++) {
      tcx.clearRect(0, 0, S, S);
      this.painters[i](tcx, makeRNG(0x9e3779b9 ^ (i * 2654435761)));
      atx.drawImage(tcv, (i % COLS) * S, ((i / COLS) | 0) * S);
      this.tileURL[i] = tcv.toDataURL();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.texture = tex;
    this.canvas = cv;
  },
  uv(i) {
    const COLS = this.COLS, rows = this.rows, e = 0.0015;
    const col = i % COLS, row = (i / COLS) | 0;
    return [
      col / COLS + e, 1 - (row + 1) / rows + e,
      (col + 1) / COLS - e, 1 - row / rows - e
    ];
  }
};

/* ----- block face textures ----- */
Tex.add('bedrock', (c, r) => _speckle(c, r, ['#2b2b2b', '#3a3a3a', '#1d1d1d', '#4a4a4a']));
Tex.add('sculk', (c, r) => {
  // dark base with subtle pebble pattern
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    _px(c, x, y, v < 0.5 ? '#0a0a14' : v < 0.85 ? '#10101e' : '#1a1a2a');
  }
  // cyan/teal veins — branching
  for (let i = 0; i < 4; i++) {
    let x = (r() * 16) | 0, y = (r() * 16) | 0;
    const len = 4 + ((r() * 6) | 0);
    for (let j = 0; j < len; j++) {
      _px(c, x & 15, y & 15, j === 0 ? '#5af0ff' : (j < 3 ? '#1ad0ee' : '#0078a0'));
      if (r() < 0.5) x++; else y++;
    }
  }
  // few bioluminescent dots
  _px(c, 4, 4, '#a0ffff'); _px(c, 12, 10, '#a0ffff');
});
Tex.add('reinforced_deepslate', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    _px(c, x, y, v < 0.5 ? '#2a2a32' : '#383844');
  }
  // diamond pattern in metallic gray
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if ((x + y) % 4 === 0 && (x - y + 16) % 4 === 0) _px(c, x, y, '#7c7c8c');
  }
  // central rune
  _px(c, 7, 7, '#a0a0d0'); _px(c, 8, 7, '#a0a0d0');
  _px(c, 7, 8, '#a0a0d0'); _px(c, 8, 8, '#a0a0d0');
});
Tex.add('sculk_bench_top', (c, r) => {
  _speckle(c, r, ['#0a0a14', '#10101e', '#1a1a2a']);
  // metal frame around edge
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#8a8a9a'); _px(c, x, 15, '#8a8a9a'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#8a8a9a'); _px(c, 15, y, '#8a8a9a'); }
  // central glowing slot
  _rect(c, 6, 6, 4, 4, '#5af0ff');
  _px(c, 7, 7, '#ffffff'); _px(c, 8, 8, '#ffffff');
  // 4 rivets corners
  _px(c, 2, 2, '#c0c0c0'); _px(c, 13, 2, '#c0c0c0');
  _px(c, 2, 13, '#c0c0c0'); _px(c, 13, 13, '#c0c0c0');
});
Tex.add('sculk_bench_side', (c, r) => {
  _speckle(c, r, ['#1a1a2a', '#10101e']);
  // iron plating
  _rect(c, 1, 2, 14, 6, '#9a9aaa');
  _rect(c, 1, 2, 14, 1, '#c0c0d0');
  _rect(c, 1, 7, 14, 1, '#5a5a6a');
  // sculk vents
  _rect(c, 3, 4, 3, 2, '#0a0a14');
  _rect(c, 10, 4, 3, 2, '#0a0a14');
  _px(c, 4, 5, '#5af0ff'); _px(c, 11, 5, '#5af0ff');
  // base trim
  for (let x = 0; x < 16; x++) _px(c, x, 14, '#5a5a6a');
});
Tex.add('i_sculk_ammo', (c, r) => {
  // bullet/cartridge shape with cyan core
  _rect(c, 5, 3, 6, 2, '#5af0ff');
  _rect(c, 5, 5, 6, 8, '#9a9aaa');
  _rect(c, 5, 5, 6, 1, '#c0c0d0');
  _rect(c, 5, 12, 6, 1, '#5a5a6a');
  _px(c, 7, 8, '#5af0ff'); _px(c, 8, 8, '#a0ffff');
  _px(c, 7, 9, '#5af0ff');
});
Tex.add('i_warden_blaster', (c, r) => {
  // dark gun body with cyan glow strip
  _rect(c, 2, 6, 11, 5, '#1a1a2a');
  _rect(c, 2, 6, 11, 1, '#3a3a4a');
  _rect(c, 2, 10, 11, 1, '#08080e');
  // barrel
  _rect(c, 13, 7, 2, 3, '#0a0a14');
  // glowing core
  _rect(c, 5, 7, 4, 3, '#5af0ff');
  _px(c, 6, 8, '#ffffff'); _px(c, 7, 8, '#a0ffff');
  // grip
  _rect(c, 3, 11, 3, 4, '#5a3a18');
  // sights
  _px(c, 11, 5, '#888'); _px(c, 12, 5, '#888');
});
Tex.add('i_eye_of_sculk', (c, r) => {
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const d = Math.hypot(x - 8, y - 8);
    if (d < 4.5) _px(c, x, y, d < 1.5 ? '#a0ffff' : (d < 3 ? '#1ad0ee' : '#0a4870'));
  }
  // sculk veins around
  _px(c, 4, 4, '#5af0ff'); _px(c, 11, 4, '#5af0ff');
  _px(c, 4, 11, '#5af0ff'); _px(c, 11, 11, '#5af0ff');
  _px(c, 6, 6, '#ffffff'); _px(c, 9, 6, '#ffffff');
});
Tex.add('shulker_box_side', (c, r) => {
  // purple shell sides with dark trim
  _speckle(c, r, ['#6a4a82', '#5a3a72', '#7a5a92']);
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#3a2452'); _px(c, x, 15, '#3a2452'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#3a2452'); _px(c, 15, y, '#3a2452'); }
  // vertical seam lines
  for (let y = 2; y < 14; y++) { _px(c, 5, y, '#4a3068'); _px(c, 10, y, '#4a3068'); }
  // small lid lip near top
  for (let x = 2; x < 14; x++) _px(c, x, 4, '#4a3068');
});
Tex.add('shulker_box_top', (c, r) => {
  // lid with yellow gem-like center
  _speckle(c, r, ['#6a4a82', '#5a3a72', '#7a5a92']);
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#3a2452'); _px(c, x, 15, '#3a2452'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#3a2452'); _px(c, 15, y, '#3a2452'); }
  _rect(c, 5, 5, 6, 6, '#d2b870');
  _rect(c, 6, 6, 4, 4, '#e6cf88');
  _px(c, 7, 7, '#fff5b0'); _px(c, 8, 8, '#fff5b0');
});
Tex.add('shulker_box_bottom', (c, r) => {
  _speckle(c, r, ['#5a3a72', '#4a2a62', '#6a4a82']);
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#3a2452'); _px(c, x, 15, '#3a2452'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#3a2452'); _px(c, 15, y, '#3a2452'); }
});
Tex.add('i_shulker_shell', (c, r) => {
  // curved purple shell with yellow inner
  _rect(c, 3, 4, 10, 8, '#6a4a82');
  _rect(c, 4, 5, 8, 6, '#7a5a92');
  _rect(c, 5, 6, 6, 4, '#d2b870');
  _px(c, 7, 7, '#fff5b0'); _px(c, 8, 8, '#fff5b0');
  // edge trim
  for (let x = 3; x < 13; x++) { _px(c, x, 3, '#3a2452'); _px(c, x, 12, '#3a2452'); }
  for (let y = 4; y < 12; y++) { _px(c, 2, y, '#3a2452'); _px(c, 13, y, '#3a2452'); }
});
Tex.add('i_echo_shard', (c, r) => {
  // crystal shard shape
  for (let y = 2; y < 14; y++) for (let x = 5; x < 11; x++) {
    const dx = x - 7.5, dy = y - 8;
    const d = Math.abs(dx) + Math.abs(dy) * 0.5;
    if (d < 3) _px(c, x, y, d < 1 ? '#a0ffff' : (d < 2 ? '#5ad0ee' : '#1ab0d8'));
  }
  // glints
  _px(c, 6, 5, '#ffffff'); _px(c, 10, 9, '#e0ffff');
});
Tex.add('stone', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    _px(c, x, y, v < 0.4 ? '#8c8c8c' : v < 0.75 ? '#979797' : '#a4a4a4');
  }
  // Embedded darker pebbles (3-4 small clusters)
  for (let k = 0; k < 4; k++) {
    const cx = (r() * 14) | 0, cy = (r() * 14) | 0;
    const sz = 2 + ((r() * 2) | 0);
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      if (r() < 0.7) _px(c, (cx + dx) & 15, (cy + dy) & 15, '#666');
    }
  }
  // Highlights
  for (let i = 0; i < 8; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#b8b8b8');
  // Cracks (dark thin lines)
  for (let k = 0; k < 2; k++) {
    let x = (r() * 16) | 0, y = (r() * 16) | 0;
    for (let s = 0; s < 6; s++) { _px(c, x & 15, y & 15, '#4a4a4a'); if (r() < 0.6) x++; else y++; }
  }
});
Tex.add('dirt', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.45 ? '#79552f' : (v < 0.85 ? '#6b4a28' : '#835f37'));
  }
  // Dirt clods (clusters of darker pixels)
  for (let i = 0; i < 5; i++) {
    const cx = (r() * 14) | 0, cy = (r() * 14) | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      if (r() < 0.7) _px(c, (cx + dx) & 15, (cy + dy) & 15, '#5a3f22');
    }
  }
  // Small pebbles + roots
  for (let i = 0; i < 6; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#3a2a18');
  for (let i = 0; i < 4; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#a08458');
});
Tex.add('grass_top', (c, r) => {
  // base grass layer
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.4 ? '#5aa838' : (v < 0.8 ? '#65b441' : '#509a32'));
  }
  // grass blade tufts (small vertical accents)
  for (let i = 0; i < 14; i++) {
    const x = (r() * 16) | 0, y = (r() * 16) | 0;
    _px(c, x, y, '#86d05a');
    if (y + 1 < 16) _px(c, x, y + 1, '#6cb842');
  }
  // shadow tufts
  for (let i = 0; i < 6; i++) {
    const x = (r() * 16) | 0, y = (r() * 16) | 0;
    _px(c, x, y, '#3f7d28');
  }
  // tiny yellow flower hints
  if (r() < 0.4) { const x = (r() * 14) | 0, y = (r() * 14) | 0; _px(c, x, y, '#ffea4a'); _px(c, x + 1, y, '#dfca20'); }
});
Tex.add('grass_side', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.45 ? '#79552f' : (v < 0.85 ? '#6b4a28' : '#835f37'));
  }
  for (let x = 0; x < 16; x++) {
    const h = 3 + ((r() * 3) | 0);
    for (let y = 0; y < h; y++) _px(c, x, y, r() < 0.5 ? '#5aa838' : '#65b441');
    if (r() < 0.45) _px(c, x, h, '#509a32');
  }
});
Tex.add('sand', (c, r) => _speckle(c, r, ['#e3d6a3', '#ddcd95', '#ece0b0', '#d6c585']));
Tex.add('sandstone', (c, r) => {
  _speckle(c, r, ['#e0d2a0', '#d8c992', '#e8dcae']);
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#c9b87e'); _px(c, x, 8, '#c9b87e'); }
});
Tex.add('cobble', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, '#595959');
  const stones = [[1, 1, 5, 4], [8, 1, 6, 5], [1, 6, 6, 5], [9, 7, 6, 6], [2, 12, 6, 3], [9, 13, 5, 3]];
  for (const st of stones) {
    for (let y = st[1]; y < st[1] + st[3] && y < 16; y++) for (let x = st[0]; x < st[0] + st[2] && x < 16; x++) {
      const v = r(); _px(c, x, y, v < 0.5 ? '#8f8f8f' : (v < 0.85 ? '#9c9c9c' : '#7e7e7e'));
    }
    for (let x = st[0]; x < st[0] + st[2] && x < 16; x++) _px(c, x, st[1], '#aeaeae');
  }
});
Tex.add('log_top', (c, r) => {
  _speckle(c, r, ['#b89058', '#a98248']);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 8, y - 8) | 0;
    if (d % 2 === 0) _px(c, x, y, '#8a6838');
  }
});
Tex.add('log_side', (c, r) => {
  for (let x = 0; x < 16; x++) {
    const groove = (x % 5 === 0 || x % 5 === 4);
    for (let y = 0; y < 16; y++) {
      const v = r();
      _px(c, x, y, groove ? (v < 0.6 ? '#5a4226' : '#664a2c') : (v < 0.55 ? '#6e5230' : '#7c5e3a'));
    }
  }
  const kx = 4 + ((r() * 7) | 0), ky = 5 + ((r() * 6) | 0);
  _px(c, kx, ky, '#48331f'); _px(c, kx + 1, ky, '#48331f');
  _px(c, kx, ky + 1, '#48331f'); _px(c, kx + 1, ky + 1, '#5a4226');
});
Tex.add('leaves', (c, r) => { _speckle(c, r, ['#3f8f2e', '#4aa036', '#357d28', '#2d6b22']); _blobs(c, r, 10, 2, ['#2a5e1e', '#56b040']); });
Tex.add('planks', (c, r) => {
  const shades = ['#b58a52', '#ab8049', '#bd9159', '#a87c47'];
  for (let row = 0; row < 4; row++) {
    const base = shades[row];
    for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < 16; x++)
      _px(c, x, y, r() < 0.8 ? base : '#9a6f3e');
    for (let x = 0; x < 16; x++) _px(c, x, row * 4, '#7e5c34');
    const seam = (row % 2) ? 5 : 12;
    for (let y = row * 4; y < row * 4 + 4; y++) _px(c, seam, y, '#7e5c34');
  }
});
Tex.add('glass', (c, r) => {
  c.fillStyle = 'rgba(190,225,240,0.18)'; c.fillRect(0, 0, 16, 16);
  c.fillStyle = 'rgba(225,245,255,0.85)';
  c.fillRect(0, 0, 16, 1); c.fillRect(0, 0, 1, 16);
  c.fillRect(0, 15, 16, 1); c.fillRect(15, 0, 1, 16);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(3, 3, 5, 1); c.fillRect(3, 3, 1, 5);
});
Tex.add('water', (c, r) => _speckle(c, r, ['#2a6cd8', '#3174de', '#2360c8', '#3a7ce6']));
Tex.add('coal_ore', (c, r) => { _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']); _blobs(c, r, 5, 4, ['#1d1d1d', '#2c2c2c', '#111']); });
Tex.add('iron_ore', (c, r) => { _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']); _blobs(c, r, 5, 4, ['#d3a583', '#c9966f', '#e0b594']); });
Tex.add('gold_ore', (c, r) => { _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']); _blobs(c, r, 5, 4, ['#f4d24b', '#e8c233', '#fbe072']); });
Tex.add('diamond_ore', (c, r) => { _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']); _blobs(c, r, 5, 4, ['#52e6dd', '#39d3c9', '#8af4ee']); });
Tex.add('snow', (c, r) => _speckle(c, r, ['#f4f8fb', '#eef4f8', '#ffffff', '#e6eef4']));
Tex.add('gravel', (c, r) => { _speckle(c, r, ['#7a7268', '#6a6258']); _blobs(c, r, 9, 3, ['#9a9088', '#aaa098', '#5a5248']); });
Tex.add('ctable_top', (c, r) => {
  _speckle(c, r, ['#b58a52', '#a87f49']);
  for (let i = 0; i <= 16; i += 5) { for (let x = 0; x < 16; x++) _px(c, x, Math.min(i, 15), '#5e4426'); for (let y = 0; y < 16; y++) _px(c, Math.min(i, 15), y, '#5e4426'); }
});
Tex.add('ctable_side', (c, r) => {
  _speckle(c, r, ['#9a7340', '#8a6838']);
  _rect(c, 2, 2, 5, 5, '#5e4426'); _rect(c, 9, 4, 5, 8, '#7e5c34');
});
Tex.add('furnace_front', (c, r) => { _speckle(c, r, ['#7c7c7c', '#888', '#6e6e6e']); _rect(c, 4, 7, 8, 6, '#1a1a1a'); _rect(c, 5, 9, 6, 3, '#d9601e'); _rect(c, 3, 3, 10, 2, '#5a5a5a'); });
Tex.add('furnace_side', (c, r) => { _speckle(c, r, ['#6a6a6a', '#5a5a5a']); _blobs(c, r, 6, 4, ['#8a8a8a', '#999']); });
Tex.add('chest_front', (c, r) => {
  _speckle(c, r, ['#9a6e34', '#8a6230', '#a67a3c']);
  _rect(c, 0, 6, 16, 2, '#4a3014'); _rect(c, 6, 6, 4, 4, '#d8c038'); _px(c, 7, 8, '#3a2810'); _px(c, 8, 8, '#3a2810');
});
Tex.add('chest_side', (c, r) => { _speckle(c, r, ['#8a6230', '#7a5628', '#946a36']); _rect(c, 0, 6, 16, 2, '#4a3014'); });
Tex.add('bricks', (c, r) => {
  _speckle(c, r, ['#9c4a3a', '#a85544', '#90443599'.slice(0, 7)]);
  for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) _px(c, x, y, '#c9b8a8');
  for (let y = 0; y < 16; y++) { const off = (y % 8 < 4) ? 0 : 4; _px(c, (off) & 15, y, '#c9b8a8'); _px(c, (off + 8) & 15, y, '#c9b8a8'); }
});
Tex.add('stone_bricks', (c, r) => {
  _speckle(c, r, ['#888', '#7c7c7c', '#949494']);
  for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x++) _px(c, x, y, '#5a5a5a');
  for (let y = 0; y < 16; y++) { const off = (y % 16 < 8) ? 8 : 0; _px(c, off & 15, y, '#5a5a5a'); }
});
Tex.add('cactus_top', (c, r) => { _speckle(c, r, ['#3f8f3a', '#4aa044']); _rect(c, 5, 5, 6, 6, '#357d33'); });
Tex.add('cactus_side', (c, r) => {
  _speckle(c, r, ['#3f8f3a', '#4aa044', '#357d33']);
  _rect(c, 0, 0, 2, 16, '#2c6b2a'); _rect(c, 14, 0, 2, 16, '#2c6b2a');
  for (let y = 1; y < 16; y += 4) { _px(c, 4, y, '#dfe8c0'); _px(c, 11, y, '#dfe8c0'); }
});
Tex.add('glowstone', (c, r) => { _speckle(c, r, ['#f6d96a', '#ffe98a', '#e8c850']); _blobs(c, r, 6, 3, ['#fff6c0', '#fff']); });
Tex.add('wool', (c, r) => _speckle(c, r, ['#ececed', '#e2e2e4', '#f4f4f6', '#dadadc']));
Tex.add('obsidian', (c, r) => { _speckle(c, r, ['#1a1426', '#221a33', '#120e1c']); _blobs(c, r, 4, 3, ['#3a2a55', '#2c2042']); });
Tex.add('pumpkin_top', (c, r) => { _speckle(c, r, ['#e08828', '#d57e22']); _rect(c, 6, 6, 4, 4, '#4a7c28'); });
Tex.add('pumpkin_side', (c, r) => {
  for (let x = 0; x < 16; x++) { const cs = (x % 5 < 1) ? ['#b8651a'] : ['#e08828', '#d57e22', '#ec9234']; for (let y = 0; y < 16; y++) _px(c, x, y, cs[(r() * cs.length) | 0]); }
  c.fillStyle = '#3a2a10'; c.fillRect(4, 7, 2, 3); c.fillRect(10, 7, 2, 3); c.fillRect(6, 11, 4, 2); _px(c, 5, 10, '#3a2a10'); _px(c, 10, 10, '#3a2a10');
});
Tex.add('ice', (c, r) => {
  c.fillStyle = 'rgba(150,200,240,0.55)'; c.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 24; i++) { c.fillStyle = 'rgba(225,242,255,0.7)'; c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
});
Tex.add('torch', (c, r) => {
  _rect(c, 7, 6, 2, 9, '#7a5630');
  _rect(c, 6, 3, 4, 4, '#ffd84a'); _px(c, 7, 2, '#fff2b0'); _px(c, 8, 2, '#fff2b0');
});
Tex.add('bed_top', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (y < 5) _px(c, x, y, r() < 0.85 ? '#f0f0f0' : '#dcdcdc');
    else _px(c, x, y, r() < 0.55 ? '#d23a2a' : '#b8281c');
  }
  _rect(c, 1, 1, 14, 3, '#ffffff');
  for (let x = 0; x < 16; x++) _px(c, x, 4, '#9a9a9a');
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#6e4a26'); _px(c, x, 15, '#6e4a26'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#6e4a26'); _px(c, 15, y, '#6e4a26'); }
  for (let i = 8; i < 14; i += 2) { _px(c, 4, i, '#9c2218'); _px(c, 11, i, '#9c2218'); }
});
Tex.add('bed_side', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (y > 10) _px(c, x, y, r() < 0.55 ? '#8a6038' : '#7a5028');
    else _px(c, x, y, r() < 0.55 ? '#d23a2a' : '#b8281c');
  }
  for (let x = 0; x < 16; x++) { _px(c, x, 10, '#5e3a18'); _px(c, x, 15, '#5e3a18'); }
  for (let x = 2; x < 14; x += 4) _px(c, x, 13, '#4a2c14');
});
Tex.add('bed_bottom', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    _px(c, x, y, r() < 0.5 ? '#5e3a18' : '#6e4a26');
  }
});

/* ----- nether textures ----- */
Tex.add('netherrack', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.45 ? '#6e2b2b' : (v < 0.8 ? '#7a3232' : '#5e2424'));
  }
  for (let i = 0; i < 11; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#4a1c1c');
  for (let i = 0; i < 6; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#8a4040');
});
Tex.add('soul_sand', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, r() < 0.6 ? '#4f3b2e' : '#5a4537');
  for (const h of [[4, 5], [10, 9], [7, 12], [12, 3]])
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
      if ((dx + dy) % 2 === 0) _px(c, (h[0] + dx) & 15, (h[1] + dy) & 15, '#2e2018');
});
Tex.add('lava', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.4 ? '#e0641e' : (v < 0.8 ? '#ef7d28' : '#d4561a'));
  }
  for (let i = 0; i < 15; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#ffd23a');
  for (let i = 0; i < 8; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#a83c12');
});
Tex.add('fire', (c, r) => {
  // läpinäkyvä tausta, alhaalta nousevat liekit
  for (let x = 0; x < 16; x++) {
    const h = 9 + ((r() * 6) | 0);
    for (let y = 16 - h; y < 16; y++) {
      const t = (y - (16 - h)) / h; // 0 ylhäällä liekin huipulla, 1 alhaalla
      let col;
      if (t > 0.75) col = '#c4300e';
      else if (t > 0.45) col = '#ef7d28';
      else if (t > 0.2) col = '#ffb028';
      else col = '#ffe24a';
      if (r() < 0.85) _px(c, x, y, col);
    }
  }
});
Tex.add('quartz_ore', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, r() < 0.5 ? '#6e2b2b' : '#7a3232');
  _blobs(c, r, 5, 4, ['#e8e4dc', '#f4f0e8', '#d4cfc4']);
});
Tex.add('nether_bricks', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, '#2a1416');
  for (let row = 0; row < 4; row++) {
    const off = (row % 2) ? -4 : 0;
    for (let bx = off; bx < 16; bx += 8)
      for (let y = row * 4 + 1; y < row * 4 + 4; y++)
        for (let x = bx + 1; x < bx + 8 && x < 16; x++) {
          if (x < 0) continue;
          _px(c, x, y, r() < 0.6 ? '#4a2226' : '#3c1c1f');
        }
  }
});
Tex.add('quartz_block', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.6 ? '#ebe7df' : (v < 0.9 ? '#f4f1ea' : '#ddd8cd'));
  }
});
Tex.add('end_stone', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.5 ? '#e8dab0' : (v < 0.85 ? '#dac99e' : '#f0e3bd'));
  }
  for (let i = 0; i < 6; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#c0a880');
});
Tex.add('end_portal_frame_top', (c, r) => {
  // dark green stone-ish
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.5 ? '#2a5238' : (v < 0.85 ? '#1e3e2a' : '#3a6646'));
  }
  // inner socket (empty)
  _rect(c, 4, 4, 8, 8, '#0a1a14');
  _rect(c, 5, 5, 6, 6, '#1a2c20');
});
Tex.add('end_portal_frame_side', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.5 ? '#2a5238' : (v < 0.85 ? '#1e3e2a' : '#3a6646'));
  }
  _rect(c, 0, 0, 16, 4, '#5a7a4a');
});
Tex.add('end_portal_frame_lit_top', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.5 ? '#2a5238' : (v < 0.85 ? '#1e3e2a' : '#3a6646'));
  }
  // eye in socket — green-yellow glowing
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 3.8) _px(c, x, y, d < 1.5 ? '#fff7c0' : (d < 2.6 ? '#cce864' : '#7eb04a'));
  }
});
Tex.add('end_portal', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, '#040810');
  for (let i = 0; i < 30; i++) {
    const v = r();
    c.fillStyle = v < 0.5 ? '#3a5fa0' : (v < 0.85 ? '#8ad0ff' : '#ffffff');
    c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1);
  }
});
Tex.add('purpur', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    _px(c, x, y, v < 0.5 ? '#a070a8' : (v < 0.85 ? '#9060a0' : '#b888c0'));
  }
  // grid lines
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#503058'); _px(c, x, 15, '#503058'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#503058'); _px(c, 15, y, '#503058'); }
});
Tex.add('spawner', (c, r) => {
  // dark metal cage with glowing flame inside
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r();
    _px(c, x, y, v < 0.5 ? '#16140e' : (v < 0.85 ? '#25201a' : '#0a0906'));
  }
  // cage bars (grid)
  for (let i = 0; i < 16; i++) {
    if ((i % 4) === 0) {
      for (let y = 0; y < 16; y++) _px(c, i, y, '#3a342a');
      for (let x = 0; x < 16; x++) _px(c, x, i, '#3a342a');
    }
  }
  // inner flame glow
  for (let y = 5; y < 12; y++) for (let x = 5; x < 12; x++) {
    const v = r();
    if (v < 0.4) _px(c, x, y, '#ffce4a');
    else if (v < 0.75) _px(c, x, y, '#ff8a1c');
    else _px(c, x, y, '#ffe89a');
  }
});
Tex.add('end_crystal_base', (c, r) => {
  // dark stone pillar block (bedrock-like under crystals)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r(); _px(c, x, y, v < 0.5 ? '#1a1a22' : (v < 0.85 ? '#262630' : '#0e0e16'));
  }
  // glowing rune in center
  _rect(c, 6, 6, 4, 4, '#ff80ff');
  _rect(c, 7, 7, 2, 2, '#ffffff');
});
Tex.add('dragon_egg', (c, r) => {
  // dark egg shape
  for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) {
    const dy = (y - 8) / 8;
    const dx = (x - 8) / 6;
    if (dx * dx + dy * dy < 1) {
      const v = r();
      _px(c, x, y, v < 0.5 ? '#0a0418' : (v < 0.85 ? '#1a0a2a' : '#2a1442'));
    }
  }
  // highlights
  _px(c, 6, 4, '#8e62d0'); _px(c, 7, 3, '#8e62d0');
  _px(c, 5, 6, '#5a36a4'); _px(c, 6, 5, '#5a36a4');
});
Tex.add('portal', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    c.fillStyle = 'rgba(' + (115 + (r() * 70 | 0)) + ',38,' + (155 + (r() * 80 | 0)) + ',0.6)';
    c.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 22; i++) { c.fillStyle = 'rgba(212,150,242,0.72)'; c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
});

/* ----- item icon textures ----- */
function _itemBlob(cols) {
  return (c, r) => {
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const d = Math.hypot(x - 8, y - 8);
      if (d < 5.5 + r() * 0.8) _px(c, x, y, cols[(r() * cols.length) | 0]);
    }
  };
}
Tex.add('i_stick', (c) => { for (let i = 0; i < 9; i++) { _px(c, 5 + i, 12 - i, '#8a6838'); _px(c, 6 + i, 12 - i, '#6e5230'); _px(c, 5 + i, 13 - i, '#5e4426'); } });
Tex.add('i_coal', _itemBlob(['#1d1d1d', '#2c2c2c', '#111', '#3a3a3a']));
Tex.add('i_iron', (c) => { _rect(c, 3, 6, 10, 5, '#c8c8c8'); _rect(c, 3, 6, 10, 1, '#eee'); _rect(c, 3, 10, 10, 1, '#9a9a9a'); });
Tex.add('i_gold', (c) => { _rect(c, 3, 6, 10, 5, '#f4d24b'); _rect(c, 3, 6, 10, 1, '#ffe98a'); _rect(c, 3, 10, 10, 1, '#c89a1e'); });
Tex.add('i_diamond', (c, r) => { for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { if (Math.abs(x - 8) + Math.abs(y - 8) < 6) _px(c, x, y, ['#52e6dd', '#39d3c9', '#8af4ee'][(r() * 3) | 0]); } });
Tex.add('i_apple', (c, r) => { for (let y = 4; y < 14; y++) for (let x = 3; x < 14; x++) { if (Math.hypot(x - 8, y - 9) < 5) _px(c, x, y, ['#d8342a', '#e8443a', '#c02a22'][(r() * 3) | 0]); } _rect(c, 8, 2, 1, 3, '#6a4a2c'); _px(c, 9, 3, '#4aa036'); });
Tex.add('i_raw_pork', _itemBlob(['#e89a9a', '#f0a8a8', '#d88a8a']));
Tex.add('i_cooked_pork', _itemBlob(['#c98a5a', '#b87a4a', '#d89a6a']));
Tex.add('i_raw_beef', _itemBlob(['#c04a4a', '#a83a3a', '#d05a5a']));
Tex.add('i_cooked_beef', _itemBlob(['#7a4a2a', '#8a5a36', '#6a3e22']));
Tex.add('i_raw_chicken', _itemBlob(['#f0c8b0', '#e8bca0', '#f8d4c0']));
Tex.add('i_cooked_chicken', _itemBlob(['#d8a040', '#c89030', '#e8b050']));
Tex.add('i_raw_mutton', _itemBlob(['#e07a7a', '#d06a6a', '#ec8a8a']));
Tex.add('i_cooked_mutton', _itemBlob(['#9a5a36', '#8a4e2e', '#a86a40']));
Tex.add('i_string', (c) => { for (let i = 0; i < 14; i++) _px(c, 2 + i, 8 + Math.round(Math.sin(i) * 3), '#e8e8e8'); });
Tex.add('i_feather', (c) => { for (let i = 0; i < 11; i++) { _px(c, 4 + i, 12 - i, '#f4f4f4'); _px(c, 4 + i, 13 - i, '#cfcfcf'); _px(c, 3 + i, 12 - i, '#fff'); } });
Tex.add('i_bone', (c) => { _rect(c, 5, 5, 6, 6, '#eee'); _rect(c, 3, 3, 4, 4, '#fff'); _rect(c, 9, 9, 4, 4, '#fff'); _rect(c, 3, 9, 4, 4, '#ddd'); _rect(c, 9, 3, 4, 4, '#ddd'); });
Tex.add('i_gunpowder', _itemBlob(['#555', '#444', '#666', '#3a3a3a']));
Tex.add('i_leather', (c, r) => { for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) _px(c, x, y, ['#9a6a3a', '#8a5e34', '#a87a44'][(r() * 3) | 0]); });
Tex.add('i_arrow', (c) => {
  for (let i = 0; i < 11; i++) { _px(c, 3 + i, 12 - i, '#9a9a9a'); }
  _px(c, 13, 3, '#ccc'); _px(c, 12, 2, '#ccc'); _px(c, 14, 2, '#ccc'); _px(c, 13, 2, '#ccc');
  _px(c, 3, 13, '#e8e8e8'); _px(c, 2, 12, '#e8e8e8'); _px(c, 4, 14, '#e8e8e8');
});
Tex.add('i_bow', (c) => {
  for (let i = 0; i < 13; i++) { const a = i / 12 * Math.PI; _px(c, 4 + Math.round(Math.sin(a) * 6), 2 + i, '#8a6838'); }
  for (let i = 0; i < 13; i++) _px(c, 4, 2 + i, '#e8e8e8');
});
Tex.add('i_flint', (c, r) => {
  for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
    if (Math.abs(x - 8) + Math.abs(y - 9) < 6) {
      const v = r(); _px(c, x, y, v < 0.5 ? '#3a3a44' : (v < 0.85 ? '#46464f' : '#2c2c34'));
    }
  }
});
Tex.add('i_flint_steel', (c) => {
  for (let i = 0; i < 8; i++) _px(c, 4 + i, 3 + (i < 4 ? i : 7 - i), '#bcbcc4');
  _rect(c, 3, 5, 2, 7, '#9a9aa2');
  _rect(c, 9, 9, 4, 4, '#3a3a44'); _px(c, 9, 9, '#46464f'); _px(c, 12, 12, '#2c2c34');
  _px(c, 7, 11, '#ffd23a'); _px(c, 8, 12, '#ff9020'); _px(c, 6, 12, '#ffb030');
});
Tex.add('i_quartz', (c, r) => {
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    if (Math.abs(x - 8) + Math.abs(y - 8) < 6) _px(c, x, y, ['#e8e4dc', '#f4f0e8', '#d4cfc4'][(r() * 3) | 0]);
  }
});

function _bucketShell(c) {
  _rect(c, 3, 3, 10, 1, '#cfcfcf');                     // top rim
  _rect(c, 4, 4, 8, 1, '#888888');                       // inside lip shadow
  for (let y = 5; y < 13; y++) {
    const inset = Math.floor((y - 5) / 3);
    _px(c, 3 + inset, y, '#a8a8a8');
    _px(c, 12 - inset, y, '#a8a8a8');
  }
  _rect(c, 5, 13, 6, 1, '#888888');                      // bottom
  _px(c, 4, 13, '#5a5a5a'); _px(c, 11, 13, '#5a5a5a');
  // handle
  _px(c, 3, 2, '#888'); _px(c, 12, 2, '#888');
  for (let x = 4; x <= 11; x++) _px(c, x, 1, '#888');
}
Tex.add('i_bucket', (c) => { _bucketShell(c); });
Tex.add('i_water_bucket', (c) => {
  _bucketShell(c);
  for (let y = 5; y < 13; y++) {
    const inset = Math.floor((y - 5) / 3);
    for (let x = 4 + inset; x <= 11 - inset; x++) {
      _px(c, x, y, ((x + y) & 1) ? '#2360c8' : '#3174de');
    }
  }
  // glint
  _px(c, 5, 6, '#a4c4f4'); _px(c, 6, 6, '#a4c4f4');
});
Tex.add('i_ender_pearl', (c, r) => {
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const d = Math.hypot(x - 8, y - 8);
    if (d < 4.5) _px(c, x, y, d < 1.5 ? '#cdf5d5' : (d < 3 ? '#5fb476' : '#1f5a3a'));
  }
});
Tex.add('i_blaze_rod', (c) => {
  for (let i = 0; i < 11; i++) {
    _px(c, 6, 3 + i, '#ffd24a');
    _px(c, 7, 3 + i, '#ffa820');
    _px(c, 8, 3 + i, '#e88018');
    _px(c, 9, 3 + i, '#c46a10');
  }
  // shimmer
  _px(c, 6, 5, '#fff'); _px(c, 9, 11, '#fff');
});
Tex.add('i_blaze_powder', (c, r) => {
  for (let i = 0; i < 60; i++) {
    const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
    const v = r();
    _px(c, x, y, v < 0.5 ? '#ffd24a' : (v < 0.85 ? '#ffa820' : '#fff7a0'));
  }
});
Tex.add('i_elytra', (c, r) => {
  // wings shape
  for (let dy = 0; dy < 10; dy++) for (let dx = 0; dx < 5; dx++) {
    const dxx = 5 - dx, dyy = dy;
    // left wing
    if (dxx > dyy / 2 - 1 && dxx < 5 - dyy / 4) _px(c, 2 + dx, 3 + dy, '#a0a4b8');
    // right wing
    if (dxx > dyy / 2 - 1 && dxx < 5 - dyy / 4) _px(c, 13 - dx, 3 + dy, '#a0a4b8');
  }
  // body / harness
  _rect(c, 7, 3, 2, 8, '#5a4636');
  _rect(c, 6, 5, 4, 1, '#3a2c20');
});
Tex.add('i_eye_of_ender', (c, r) => {
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const d = Math.hypot(x - 8, y - 8);
    if (d < 4.5) _px(c, x, y, d < 1.5 ? '#fff7c0' : (d < 3 ? '#7eb04a' : '#1f5a3a'));
  }
  _px(c, 6, 6, '#fff'); _px(c, 9, 6, '#fff');
});
Tex.add('i_home_button', (c) => {
  // small house silhouette
  // roof (triangle)
  for (let dy = 0; dy < 4; dy++) {
    const x0 = 3 + dy, w = 10 - dy * 2;
    for (let x = x0; x < x0 + w; x++) _px(c, x, 2 + dy, '#aa2c1c');
  }
  // roof crest
  _px(c, 7, 1, '#dd5040'); _px(c, 8, 1, '#dd5040');
  // walls
  _rect(c, 4, 7, 8, 6, '#d76a3a');
  // wall outline
  _rect(c, 3, 6, 10, 1, '#5a2a14');
  for (let y = 6; y < 14; y++) { _px(c, 3, y, '#5a2a14'); _px(c, 12, y, '#5a2a14'); }
  _rect(c, 3, 13, 10, 1, '#5a2a14');
  // door
  _rect(c, 7, 9, 2, 4, '#5a3a18');
  _px(c, 8, 11, '#ffd23a');  // doorknob
  // window
  _rect(c, 5, 8, 2, 2, '#a4c4f4');
  _px(c, 5, 9, '#5a2a14'); _px(c, 7, 9, '#5a2a14');
});
Tex.add('i_lava_bucket', (c) => {
  _bucketShell(c);
  for (let y = 5; y < 13; y++) {
    const inset = Math.floor((y - 5) / 3);
    for (let x = 4 + inset; x <= 11 - inset; x++) {
      _px(c, x, y, ((x + y) & 1) ? '#d4561a' : '#ef7d28');
    }
  }
  // bright hot spot
  _px(c, 7, 7, '#ffd23a'); _px(c, 8, 7, '#ffd23a'); _px(c, 7, 8, '#ffe98a');
});

const TIER_COL = ['#7a5630', '#7a5630', '#9a9a9a', '#e2e2e2', '#52e6dd', '#3a3438', '#1a0a26'];
function _shadeColor(hex, amt) {
  // amt: -1..1 (negative=darker, positive=lighter)
  let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  if (amt < 0) { const m = 1 + amt; r = (r * m) | 0; g = (g * m) | 0; b = (b * m) | 0; }
  else { r = Math.min(255, (r + (255 - r) * amt) | 0); g = Math.min(255, (g + (255 - g) * amt) | 0); b = Math.min(255, (b + (255 - b) * amt) | 0); }
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}
function _toolIcon(kind, tier) {
  const head = TIER_COL[tier];
  // Convert head to numeric for shading
  const headNum = parseInt(head.slice(1), 16);
  const headShine = _shadeColor(headNum, 0.5);
  const headDark = _shadeColor(headNum, -0.4);
  return (c) => {
    if (kind === 'sword') {
      // Blade (diagonal) with shine highlight on one edge, dark on other
      for (let i = 0; i < 10; i++) {
        const x = 11 - i, y = 3 + i;
        _px(c, x, y, headDark);
        _px(c, x + 1, y, head);
        _px(c, x - 1, y, headShine);
      }
      // Crossguard
      _px(c, 2, 12, '#3a2810'); _px(c, 3, 12, '#3a2810');
      _px(c, 4, 12, '#7a5630'); _px(c, 5, 12, '#7a5630');
      // Pommel + hilt
      _px(c, 2, 13, '#7a5630'); _px(c, 3, 13, '#7a5630'); _px(c, 4, 14, '#3a2810');
      // Highlight glint on blade
      _px(c, 9, 5, '#ffffff'); _px(c, 8, 6, '#f0f0f0');
      return;
    }
    if (kind === 'bat') {
      for (let i = 0; i < 14; i++) {
        const x = 2 + i, y = 14 - i;
        const w = Math.min(3, 1 + Math.floor(i / 4));
        for (let dx = -w; dx <= w; dx++) {
          if (x + dx < 0 || x + dx > 15) continue;
          let col;
          if (i < 5) col = (dx === -w) ? '#3a2810' : (dx === w) ? '#9a7a4a' : '#5e4426';
          else col = (dx === -w) ? headDark : (dx === w) ? headShine : head;
          _px(c, x + dx, y, col);
        }
      }
      _px(c, 2, 14, '#3a2810'); _px(c, 3, 13, '#3a2810');
      // Grip tape stripes
      _px(c, 3, 12, '#9a7a4a'); _px(c, 4, 11, '#9a7a4a');
      return;
    }
    // Wood handle for non-sword/bat tools (with shading)
    for (let i = 0; i < 9; i++) {
      _px(c, 5 + i, 13 - i, '#7a5630');
      _px(c, 6 + i, 13 - i, '#5e4426');
      _px(c, 4 + i, 13 - i, '#9a7a4a');  // highlight
    }
    if (kind === 'pickaxe') {
      // Curved top with shadow underneath + shine
      for (let x = 2; x < 14; x++) {
        const y = 4 + Math.round(Math.abs(x - 8) * 0.4);
        _px(c, x, y - 1, headShine);
        _px(c, x, y, head);
        _px(c, x, y + 1, head);
        _px(c, x, y + 2, headDark);
      }
      // Tip highlights
      _px(c, 3, 5, '#ffffff'); _px(c, 12, 5, '#ffffff');
    } else if (kind === 'axe') {
      _rect(c, 8, 2, 5, 6, head);
      _rect(c, 8, 2, 5, 1, headShine);   // top edge highlight
      _rect(c, 8, 7, 5, 1, headDark);    // bottom edge shadow
      _px(c, 13, 3, head); _px(c, 13, 6, head);
      _rect(c, 7, 3, 1, 4, head);
      // Blade glint
      _px(c, 12, 4, '#ffffff'); _px(c, 12, 5, '#f0f0f0');
    } else if (kind === 'shovel') {
      _rect(c, 11, 2, 4, 5, head);
      _rect(c, 11, 2, 4, 1, headShine);  // top highlight
      _rect(c, 11, 6, 4, 1, headDark);   // bottom shadow
      _px(c, 11, 7, head); _px(c, 14, 7, head);
      _px(c, 14, 3, '#ffffff'); // shine
    }
  };
}
const TOOL_KINDS = ['pickaxe', 'axe', 'sword', 'shovel', 'bat'];
const TIER_NAMES = ['', 'wood', 'stone', 'iron', 'diamond', 'netherite', 'enderite'];
for (let t = 1; t <= 6; t++) for (const k of TOOL_KINDS) Tex.add('tool_' + k + '_' + t, _toolIcon(k, t));

/* ----- armour, mace & wind charge icons ----- */
const ARMOR_COL = { leather: '#9a6a3a', iron: '#d4d4d4', diamond: '#52e6dd', netherite: '#3a3438', enderite: '#1a0a26' };
function _armorIcon(piece, col) {
  return (c) => {
    if (piece === 'helmet') {
      _rect(c, 3, 3, 10, 2, col); _rect(c, 3, 5, 3, 5, col);
      _rect(c, 10, 5, 3, 5, col); _rect(c, 3, 5, 10, 2, col);
    } else if (piece === 'chest') {
      _rect(c, 3, 3, 10, 2, col); _rect(c, 2, 5, 3, 3, col);
      _rect(c, 11, 5, 3, 3, col); _rect(c, 4, 5, 8, 8, col);
    } else if (piece === 'legs') {
      _rect(c, 3, 2, 10, 3, col); _rect(c, 3, 5, 4, 9, col); _rect(c, 9, 5, 4, 9, col);
    } else {
      _rect(c, 2, 7, 5, 3, col); _rect(c, 2, 10, 6, 3, col);
      _rect(c, 9, 7, 5, 3, col); _rect(c, 9, 10, 6, 3, col);
    }
  };
}
for (const tier of ['leather', 'iron', 'diamond', 'netherite', 'enderite'])
  for (const piece of ['helmet', 'chest', 'legs', 'boots'])
    Tex.add('armor_' + tier + '_' + piece, _armorIcon(piece, ARMOR_COL[tier]));

Tex.add('i_mace', (c) => {
  for (let i = 0; i < 8; i++) { _px(c, 3 + i, 13 - i, '#8a6838'); _px(c, 4 + i, 13 - i, '#6e5230'); }
  _rect(c, 8, 1, 6, 6, '#565664'); _rect(c, 9, 0, 4, 1, '#787888');
  _rect(c, 7, 2, 1, 4, '#565664'); _rect(c, 14, 2, 1, 4, '#565664');
  _px(c, 10, 2, '#9aa0b0'); _px(c, 11, 3, '#9aa0b0');
});
function _maceTinted(headDark, headLight) {
  return (c) => {
    for (let i = 0; i < 8; i++) { _px(c, 3 + i, 13 - i, '#8a6838'); _px(c, 4 + i, 13 - i, '#6e5230'); }
    _rect(c, 8, 1, 6, 6, headDark); _rect(c, 9, 0, 4, 1, headLight);
    _rect(c, 7, 2, 1, 4, headDark); _rect(c, 14, 2, 1, 4, headDark);
    _px(c, 10, 2, headLight); _px(c, 11, 3, headLight);
  };
}
Tex.add('i_mace_iron', _maceTinted('#bababa', '#e0e0e0'));
Tex.add('i_mace_diamond', _maceTinted('#4ec0bc', '#7df0ec'));
Tex.add('i_mace_netherite', _maceTinted('#3a3438', '#7a6e7e'));
Tex.add('i_mace_enderite', _maceTinted('#1a0a26', '#a040c0'));
function _shieldTinted(body1, body2, rimColor) {
  return (c) => {
    for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) {
      const dx = x - 7.5, dy = (y - 8) * 1.1;
      const d = Math.hypot(dx, dy);
      if (d > 7) continue;
      if (d > 6) _px(c, x, y, rimColor);
      else if (y > 10 && Math.abs(dx) < 1.5) _px(c, x, y, '#5a3a18');
      else _px(c, x, y, ((x + y) & 1) ? body1 : body2);
    }
    _rect(c, 4, 7, 8, 2, rimColor);
    _rect(c, 7, 4, 2, 8, rimColor);
    _px(c, 7, 7, '#cfcfcf'); _px(c, 8, 7, '#cfcfcf');
    _px(c, 7, 8, '#cfcfcf'); _px(c, 8, 8, '#cfcfcf');
  };
}
Tex.add('i_shield_iron', _shieldTinted('#7a8088', '#5a606a', '#e0e0e0'));
Tex.add('i_shield_diamond', _shieldTinted('#4a8a86', '#3a6c68', '#7df0ec'));
Tex.add('i_shield_netherite', _shieldTinted('#3a342a', '#2a241a', '#7a6e7e'));
Tex.add('i_shield_enderite', _shieldTinted('#1a0a26', '#0a0414', '#c020a0'));
Tex.add('i_shield_shulker', _shieldTinted('#9a6fb0', '#c9a6dc', '#ffe24a'));
function _fishingRod(rodCol, hookCol) {
  return (c) => {
    // Rod (diagonal handle from bottom-left to top-right)
    for (let i = 0; i < 11; i++) {
      _px(c, 2 + i, 13 - i, rodCol);
      _px(c, 3 + i, 13 - i, rodCol);
    }
    // String hanging
    for (let i = 1; i <= 7; i++) _px(c, 13 - Math.floor(i / 3), 3 + i, '#dadada');
    // Hook
    _px(c, 11, 11, hookCol); _px(c, 10, 12, hookCol);
    // Grip
    _px(c, 2, 14, '#3a2810'); _px(c, 3, 13, '#3a2810');
  };
}
Tex.add('i_fishing_rod', _fishingRod('#8a5a2e', '#bbbbbb'));
Tex.add('i_fishing_rod_netherite', _fishingRod('#3a3438', '#7a6e7e'));
Tex.add('i_fishing_rod_enderite', _fishingRod('#1a0a26', '#a040c0'));
Tex.add('i_raw_fish', (c, r) => {
  // Fish body (oval)
  for (let y = 5; y < 12; y++) for (let x = 3; x < 13; x++) {
    const dx = x - 7.5, dy = (y - 8) * 1.4;
    if (Math.hypot(dx, dy) < 4) _px(c, x, y, ((x + y) & 1) ? '#80a4c4' : '#6090b4');
  }
  // tail
  _px(c, 12, 6, '#6090b4'); _px(c, 13, 5, '#6090b4'); _px(c, 13, 7, '#6090b4');
  _px(c, 12, 11, '#6090b4'); _px(c, 13, 10, '#6090b4'); _px(c, 13, 12, '#6090b4');
  // eye
  _px(c, 5, 7, '#1a1a1a'); _px(c, 5, 8, '#ffffff');
});
Tex.add('i_cooked_fish', (c, r) => {
  for (let y = 5; y < 12; y++) for (let x = 3; x < 13; x++) {
    const dx = x - 7.5, dy = (y - 8) * 1.4;
    if (Math.hypot(dx, dy) < 4) _px(c, x, y, ((x + y) & 1) ? '#c4844a' : '#a06832');
  }
  _px(c, 12, 6, '#a06832'); _px(c, 13, 5, '#a06832'); _px(c, 13, 7, '#a06832');
  _px(c, 12, 11, '#a06832'); _px(c, 13, 10, '#a06832'); _px(c, 13, 12, '#a06832');
  _px(c, 5, 7, '#1a1a1a');
});
Tex.add('i_windcharge', (c, r) => {
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const d = Math.hypot(x - 8, y - 8);
    if (d < 5.7) _px(c, x, y, d < 2 ? '#ffffff' : (d < 4 ? '#c4ecf6' : '#84c4dd'));
  }
  for (let a = 0; a < 16; a++) {
    const rr = 1.4 + a * 0.27, an = a * 0.72;
    _px(c, (8 + Math.cos(an) * rr) | 0, (8 + Math.sin(an) * rr) | 0, '#ffffff');
  }
});

/* ----- enchantment / sugar cane / lapis textures (block) ----- */
Tex.add('sugar_cane', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, 'rgba(0,0,0,0)');
  for (let x = 6; x < 10; x++) for (let y = 0; y < 16; y++) {
    const v = r(); _px(c, x, y, v < 0.45 ? '#5fa852' : (v < 0.85 ? '#86c87a' : '#3d8a36'));
  }
  for (let y = 2; y < 16; y += 4) for (let x = 6; x < 10; x++) _px(c, x, y, '#2c6b28');
});
Tex.add('lapis_ore', (c, r) => {
  _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']);
  _blobs(c, r, 5, 4, ['#2a4ac8', '#3858d0', '#1d3aa0', '#5070e2']);
});
Tex.add('emerald_ore', (c, r) => {
  _speckle(c, r, ['#8f8f8f', '#9a9a9a', '#848484']);
  _blobs(c, r, 4, 4, ['#1ea05e', '#23bf6e', '#0e7a3e', '#3ad080']);
});
Tex.add('i_emerald', (c, r) => {
  for (let y = 3; y < 13; y++) for (let x = 4; x < 12; x++) {
    const d = Math.abs(x - 7.5) + Math.abs(y - 8) * 0.7;
    if (d < 4) _px(c, x, y, d < 1.5 ? '#5ff09c' : (d < 2.6 ? '#2ec078' : '#1a8a52'));
  }
  _px(c, 6, 5, '#aaffd0'); _px(c, 5, 6, '#aaffd0');
});
Tex.add('gold_block', (c, r) => {
  _speckle(c, r, ['#fbe25a', '#ffd24a', '#e4b22a', '#fff080']);
  for (let i = 0; i < 6; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#fffacd');
});
Tex.add('enderite_block', (c, r) => {
  _speckle(c, r, ['#1a0a26', '#2a1438', '#0a0414', '#3a2050']);
  // ender shimmer dots
  for (let i = 0; i < 10; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, ['#c020a0', '#e040d0', '#fff7c0', '#8a40c0'][(r() * 4) | 0]);
});
Tex.add('i_enderite_scrap', (c, r) => {
  for (let i = 0; i < 28; i++) {
    const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
    _px(c, x, y, r() < 0.5 ? '#3a2050' : (r() < 0.8 ? '#5a3070' : '#8050a0'));
  }
});
Tex.add('i_enderite_ingot', (c, r) => {
  _rect(c, 3, 5, 10, 6, '#1a0a26');
  _rect(c, 3, 5, 10, 1, '#3a2050');
  _rect(c, 3, 10, 10, 1, '#08020c');
  // glints
  _px(c, 5, 7, '#c020a0'); _px(c, 9, 7, '#e040d0'); _px(c, 7, 8, '#fff7c0');
  for (let i = 0; i < 3; i++) _px(c, 4 + i * 3, 9, '#a040c0');
});
Tex.add('i_enderite_elytra', (c, r) => {
  const body = '#2a1438';
  const dark = '#1a0a26';
  // Elytra wings extending out to sides
  for (let dy = 1; dy < 12; dy++) for (let dx = 0; dx < 4; dx++) {
    const dxx = 4 - dx, dyy = dy;
    if (dxx > dyy / 2 - 1 && dxx < 4 - dyy / 4) {
      _px(c, 0 + dx, 3 + dy, body);
      _px(c, 15 - dx, 3 + dy, body);
    }
  }
  // Chestplate body (centered)
  _rect(c, 4, 3, 8, 2, body);     // shoulders top
  _rect(c, 3, 5, 2, 3, body);      // shoulder left
  _rect(c, 11, 5, 2, 3, body);     // shoulder right
  _rect(c, 4, 5, 8, 8, body);      // main torso
  // chest plate detail/seam
  _rect(c, 7, 6, 2, 6, dark);
  _rect(c, 4, 8, 8, 1, dark);
  // purple ender glints
  _px(c, 5, 7, '#c020a0'); _px(c, 10, 9, '#e040d0');
  _px(c, 6, 11, '#a040c0'); _px(c, 9, 6, '#a040c0');
  _px(c, 2, 6, '#c020a0'); _px(c, 13, 10, '#e040d0');
});
Tex.add('brewing_top', (c, r) => {
  _speckle(c, r, ['#3a3a3a', '#2a2a2a', '#444']);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) _px(c, x, y, '#1a1a1a');
  _px(c, 7, 7, '#a040c0'); _px(c, 8, 8, '#a040c0');
});
Tex.add('brewing_side', (c, r) => {
  _speckle(c, r, ['#444', '#3a3a3a', '#2c2c2c']);
  // bottle outlines
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 5;
    _rect(c, x, 4, 3, 8, '#1a1a1a');
    _px(c, x, 4, '#444'); _px(c, x + 2, 4, '#444');
    _px(c, x + 1, 6, '#a040c0');
    _px(c, x + 1, 9, '#5060e0');
  }
});
function _bottleShape(c, liquidColors) {
  // glass outline + neck + corked top
  _rect(c, 6, 2, 4, 1, '#9a9a9a');
  _rect(c, 7, 1, 2, 1, '#5a3a18');
  _rect(c, 7, 3, 2, 3, '#cccccc');
  // bulb
  for (let y = 6; y < 14; y++) for (let x = 4; x < 12; x++) {
    const dx = x - 7.5, dy = y - 9.5;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      const liq = (d > 3 || y === 13) ? '#cccccc' : liquidColors[(d * 2) | 0] || liquidColors[0];
      _px(c, x, y, liq);
    }
  }
  // shine
  _px(c, 5, 8, '#ffffff'); _px(c, 5, 9, '#f4f4f4');
}
Tex.add('i_glass_bottle', (c) => _bottleShape(c, ['#e4f4ff', '#d4e4f0', '#c4d4e0']));
Tex.add('i_water_bottle', (c) => _bottleShape(c, ['#5a90f4', '#3a70d8', '#2a60c0']));
Tex.add('i_potion_healing', (c) => _bottleShape(c, ['#ff7080', '#e04060', '#a02040']));
Tex.add('i_potion_swiftness', (c) => _bottleShape(c, ['#7adcff', '#3aacf4', '#107cd0']));
Tex.add('i_potion_strength', (c) => _bottleShape(c, ['#ffc070', '#e08030', '#a04010']));
Tex.add('i_potion_fire_resistance', (c) => _bottleShape(c, ['#ffd24a', '#e8a020', '#a06010']));
Tex.add('i_potion_regeneration', (c) => _bottleShape(c, ['#ff70c4', '#e0408c', '#9a2060']));
Tex.add('i_golden_apple', (c, r) => {
  // Apple shape (round-ish), gold-tinted
  for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) {
    const dx = x - 7.5, dy = y - 9;
    const d = Math.hypot(dx * 1.1, dy);
    if (d < 4.5) {
      _px(c, x, y, d < 1.5 ? '#fff080' : (d < 3.0 ? '#ffd24a' : '#e4a220'));
    }
  }
  // Stem
  _px(c, 8, 2, '#5a3a18'); _px(c, 8, 3, '#5a3a18');
  // Leaf
  _px(c, 9, 3, '#3e8a32'); _px(c, 10, 3, '#3e8a32');
  // Highlight
  _px(c, 5, 6, '#ffffe0'); _px(c, 5, 7, '#fffacd');
});
Tex.add('i_enchanted_golden_apple', (c, r) => {
  // Same as golden apple but with purple-pink shimmer overlay
  for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) {
    const dx = x - 7.5, dy = y - 9;
    const d = Math.hypot(dx * 1.1, dy);
    if (d < 4.5) {
      _px(c, x, y, d < 1.5 ? '#fff080' : (d < 3.0 ? '#ffd24a' : '#e4a220'));
    }
  }
  _px(c, 8, 2, '#5a3a18'); _px(c, 8, 3, '#5a3a18');
  _px(c, 9, 3, '#3e8a32'); _px(c, 10, 3, '#3e8a32');
  // Enchant glints (purple-magenta)
  _px(c, 4, 7, '#e060ff'); _px(c, 6, 10, '#c040d8');
  _px(c, 10, 8, '#e080ff'); _px(c, 11, 11, '#a040c0');
  _px(c, 7, 5, '#ffd0ff');
});
Tex.add('bookshelf_side', (c, r) => {
  _speckle(c, r, ['#a06a30', '#8a5824', '#b27838']);
  for (let row = 0; row < 2; row++) for (let bx = 1; bx < 16; bx += 5) {
    const yy = row * 7 + 2;
    _rect(c, bx, yy, 4, 5, row === 0 ? '#d4a868' : '#c89c5e');
    _px(c, bx, yy + 1, '#5e3a18'); _px(c, bx + 3, yy + 1, '#5e3a18');
    _px(c, bx + 1, yy + 2, '#8f1e1e'); _px(c, bx + 2, yy + 2, '#2a4ac8');
  }
});
Tex.add('bookshelf_top', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    _px(c, x, y, r() < 0.6 ? '#8a5824' : '#7a4a18');
  }
});
Tex.add('enchant_top', (c, r) => {
  _speckle(c, r, ['#1a1a1a', '#2a2a2a', '#222']);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    if (Math.hypot(x - 7.5, y - 7.5) < 3.2) _px(c, x, y, ((x + y) % 2) ? '#ed3' : '#fc6');
  }
});
Tex.add('enchant_side', (c, r) => {
  _speckle(c, r, ['#1a1a1a', '#2a2a2a', '#222']);
  for (let i = 0; i < 8; i++) {
    const x = (r() * 16) | 0, y = (r() * 16) | 0;
    _px(c, x, y, ['#a049d8', '#ed3', '#7ea4f2'][(r() * 3) | 0]);
  }
});
Tex.add('enchant_bottom', (c, r) => _speckle(c, r, ['#5a3a1a', '#6e4a26', '#4a2c14']));
Tex.add('grindstone_top', (c, r) => {
  _speckle(c, r, ['#7a7a7a', '#888', '#6e6e6e']);
  _rect(c, 1, 6, 14, 4, '#3a2418');
  for (let x = 2; x < 14; x++) _px(c, x, 7, '#5a4030');
  for (let x = 2; x < 14; x++) _px(c, x, 8, '#5a4030');
});
Tex.add('grindstone_side', (c, r) => {
  _speckle(c, r, ['#3a2418', '#4a3020', '#2e1a12']);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    if (Math.hypot(x - 7.5, y - 7.5) < 3.6) _px(c, x, y, '#888');
  }
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) {
    if (Math.hypot(x - 7.5, y - 7.5) < 2.4) _px(c, x, y, '#bbb');
  }
});
Tex.add('anvil_top', (c, r) => {
  _speckle(c, r, ['#3a3a3a', '#444', '#2c2c2c']);
  _rect(c, 3, 3, 10, 10, '#5a5a5a');
  _rect(c, 4, 4, 8, 8, '#6a6a6a');
  _px(c, 7, 7, '#888'); _px(c, 8, 8, '#888');
});
Tex.add('anvil_side', (c, r) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let col = '#2a2a2a';
    if (y < 4) { if (x > 1 && x < 14) col = '#444'; }
    else if (y < 7) { if (x > 4 && x < 11) col = '#3a3a3a'; }
    else if (y < 12) { if (x > 3 && x < 12) col = '#3a3a3a'; }
    else { if (x > 0 && x < 15) col = '#444'; }
    _px(c, x, y, col);
  }
});
Tex.add('iron_block', (c, r) => _speckle(c, r, ['#d4d4d4', '#c0c0c0', '#e0e0e0', '#b5b5b5']));
Tex.add('lapis_block', (c, r) => {
  _speckle(c, r, ['#2a4ac8', '#3858d0', '#1d3aa0', '#5070e2']);
  // sprinkle of bright flecks
  for (let i = 0; i < 8; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#a4c4f4');
});
Tex.add('ancient_debris_top', (c, r) => {
  _speckle(c, r, ['#5a3220', '#6a4030', '#4a2818']);
  _blobs(c, r, 4, 4, ['#a08070', '#8c6e5e', '#705244']);
});
Tex.add('ancient_debris_side', (c, r) => {
  _speckle(c, r, ['#3a2418', '#4a3020', '#2e1a12']);
  _blobs(c, r, 5, 3, ['#a08070', '#8c6e5e', '#6a4030']);
});
Tex.add('netherite_block', (c, r) => {
  _speckle(c, r, ['#3a3438', '#48424a', '#2e2830', '#5a525a']);
  for (let i = 0; i < 6; i++) _px(c, (r() * 16) | 0, (r() * 16) | 0, '#7a6e7e');
});
Tex.add('tnt_top', (c, r) => {
  _speckle(c, r, ['#e3d6a3', '#ddcd95', '#ece0b0', '#d6c585']);
  // red ring around the top (the fuse band)
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#bd2c1c'); _px(c, x, 15, '#bd2c1c'); }
  for (let y = 0; y < 16; y++) { _px(c, 0, y, '#bd2c1c'); _px(c, 15, y, '#bd2c1c'); }
  // fuse on top center
  _px(c, 7, 7, '#3a2418'); _px(c, 8, 8, '#3a2418');
});
Tex.add('tnt_side', (c) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) _px(c, x, y, '#bd2c1c');
  // sand band top + bottom
  for (let x = 0; x < 16; x++) { _px(c, x, 0, '#e3d6a3'); _px(c, x, 1, '#ddcd95'); }
  for (let x = 0; x < 16; x++) { _px(c, x, 14, '#ddcd95'); _px(c, x, 15, '#e3d6a3'); }
  // dark middle band with "TNT" letters
  _rect(c, 1, 6, 14, 4, '#5a0e0e');
  // T
  _px(c, 2, 7, '#fff'); _px(c, 3, 7, '#fff'); _px(c, 4, 7, '#fff');
  _px(c, 3, 8, '#fff'); _px(c, 3, 9, '#fff');
  // N
  _px(c, 6, 7, '#fff'); _px(c, 6, 8, '#fff'); _px(c, 6, 9, '#fff');
  _px(c, 7, 8, '#fff');
  _px(c, 8, 7, '#fff'); _px(c, 8, 8, '#fff'); _px(c, 8, 9, '#fff');
  // T
  _px(c, 10, 7, '#fff'); _px(c, 11, 7, '#fff'); _px(c, 12, 7, '#fff');
  _px(c, 11, 8, '#fff'); _px(c, 11, 9, '#fff');
});
Tex.add('smithing_top', (c, r) => {
  _speckle(c, r, ['#3a3a3a', '#444', '#2c2c2c']);
  _rect(c, 2, 2, 12, 12, '#2a2a2a');
  _rect(c, 3, 3, 10, 10, '#3e3a3a');
  // central dimple
  _px(c, 7, 7, '#1a1a1a'); _px(c, 8, 7, '#1a1a1a');
  _px(c, 7, 8, '#1a1a1a'); _px(c, 8, 8, '#1a1a1a');
});
Tex.add('smithing_side', (c, r) => {
  _speckle(c, r, ['#5a3a18', '#6e4a26', '#4a2c14']);
  _rect(c, 0, 0, 16, 3, '#3a2418');
  _rect(c, 0, 13, 16, 3, '#3a2418');
});
Tex.add('i_netherite_scrap', (c, r) => {
  for (let i = 0; i < 28; i++) {
    const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
    _px(c, x, y, r() < 0.5 ? '#6a5848' : (r() < 0.8 ? '#5a4838' : '#8a7868'));
  }
});
Tex.add('i_netherite_ingot', (c, r) => {
  _rect(c, 3, 5, 10, 6, '#3a3438');
  _rect(c, 3, 5, 10, 1, '#5a525a');
  _rect(c, 3, 10, 10, 1, '#1e1a22');
  for (let i = 0; i < 4; i++) _px(c, 4 + i * 2, 7, '#5a525a');
});
Tex.add('i_upgrade_template', (c, r) => {
  _rect(c, 2, 2, 12, 12, '#dccc9c');
  _rect(c, 2, 2, 12, 1, '#a08850');
  _rect(c, 2, 13, 12, 1, '#a08850');
  _rect(c, 2, 2, 1, 12, '#a08850');
  _rect(c, 13, 2, 1, 12, '#a08850');
  _rect(c, 5, 5, 6, 6, '#2a2418');
  _rect(c, 6, 6, 4, 4, '#3a3438');
  _px(c, 7, 7, '#7a6e7e'); _px(c, 8, 8, '#7a6e7e');
  _px(c, 2, 2, '#ffd23a'); _px(c, 13, 2, '#ffd23a');
  _px(c, 2, 13, '#ffd23a'); _px(c, 13, 13, '#ffd23a');
});
Tex.add('i_enderite_template', (c, r) => {
  // parchment frame
  _rect(c, 2, 2, 12, 12, '#dccc9c');
  _rect(c, 2, 2, 12, 1, '#a08850');
  _rect(c, 2, 13, 12, 1, '#a08850');
  _rect(c, 2, 2, 1, 12, '#a08850');
  _rect(c, 13, 2, 1, 12, '#a08850');
  // enderite-tinted rune
  _rect(c, 5, 5, 6, 6, '#1a0a26');
  _rect(c, 6, 6, 4, 4, '#2a1438');
  _px(c, 7, 7, '#c020a0'); _px(c, 8, 8, '#e040d0');
  _px(c, 6, 7, '#a040c0'); _px(c, 9, 8, '#a040c0');
  // purple corner accents
  _px(c, 2, 2, '#c020a0'); _px(c, 13, 2, '#c020a0');
  _px(c, 2, 13, '#c020a0'); _px(c, 13, 13, '#c020a0');
});

/* ----- new item textures ----- */
Tex.add('i_sugar_cane', (c, r) => {
  for (let y = 1; y < 15; y++) {
    _px(c, 7, y, r() < 0.5 ? '#5fa852' : '#86c87a');
    _px(c, 8, y, r() < 0.5 ? '#3d8a36' : '#5fa852');
  }
  _px(c, 7, 4, '#2c6b28'); _px(c, 8, 9, '#2c6b28'); _px(c, 7, 12, '#2c6b28');
});
Tex.add('i_sugar', (c, r) => {
  for (let i = 0; i < 70; i++) {
    const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
    _px(c, x, y, r() < 0.7 ? '#ffffff' : '#eaeaea');
  }
});
Tex.add('i_paper', (c, r) => {
  _rect(c, 3, 2, 10, 12, '#f4f0e2');
  _rect(c, 3, 2, 10, 1, '#d6d0bc');
  _rect(c, 3, 13, 10, 1, '#a8a294');
  for (let i = 4; i < 12; i += 2) _rect(c, 5, i, 6, 1, '#888070');
});
Tex.add('i_book', (c, r) => {
  _rect(c, 2, 3, 12, 10, '#8f1e1e');
  _rect(c, 2, 3, 1, 10, '#5a0e0e');
  _rect(c, 13, 3, 1, 10, '#5a0e0e');
  _rect(c, 3, 4, 10, 8, '#f4f0e2');
  _rect(c, 4, 5, 8, 1, '#888070');
  _rect(c, 4, 7, 8, 1, '#888070');
  _rect(c, 4, 9, 6, 1, '#888070');
  _px(c, 8, 3, '#ffd24a'); _px(c, 8, 12, '#ffd24a');
});
Tex.add('i_enchanted_book', (c, r) => {
  _rect(c, 2, 3, 12, 10, '#5a1e8e');
  _rect(c, 2, 3, 1, 10, '#3a0e5e');
  _rect(c, 13, 3, 1, 10, '#3a0e5e');
  _rect(c, 3, 4, 10, 8, '#f4f0e2');
  _rect(c, 4, 5, 8, 1, '#a049d8');
  _rect(c, 4, 7, 8, 1, '#a049d8');
  _rect(c, 4, 9, 6, 1, '#a049d8');
  _px(c, 8, 3, '#ed3'); _px(c, 8, 12, '#ed3');
  _px(c, 4, 6, '#fff'); _px(c, 11, 10, '#fff');
});
Tex.add('i_lapis', (c, r) => {
  for (let i = 0; i < 30; i++) {
    const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
    _px(c, x, y, r() < 0.4 ? '#3858d0' : (r() < 0.7 ? '#2a4ac8' : '#5070e2'));
  }
});
Tex.add('i_shield', (c) => {
  // shield body: rounded rectangle with iron rim
  for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) {
    const dx = x - 7.5, dy = (y - 8) * 1.1;
    const d = Math.hypot(dx, dy);
    if (d > 7) continue;
    if (d > 6) _px(c, x, y, '#c0c0c0');
    else if (y > 10 && Math.abs(dx) < 1.5) _px(c, x, y, '#5a3a18');
    else _px(c, x, y, ((x + y) & 1) ? '#8a5828' : '#7a4a1c');
  }
  // metal cross
  _rect(c, 4, 7, 8, 2, '#aaa');
  _rect(c, 7, 4, 2, 8, '#aaa');
  // boss center
  _px(c, 7, 7, '#cfcfcf'); _px(c, 8, 7, '#cfcfcf');
  _px(c, 7, 8, '#cfcfcf'); _px(c, 8, 8, '#cfcfcf');
});

/* ============================ Block registry ============================ */
const B = {
  AIR: 0, BEDROCK: 1, STONE: 2, DIRT: 3, GRASS: 4, SAND: 5, SANDSTONE: 6,
  COBBLE: 7, LOG: 8, LEAVES: 9, PLANKS: 10, GLASS: 11, WATER: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16, SNOW: 17,
  GRAVEL: 18, CRAFTING_TABLE: 19, FURNACE: 20, CHEST: 21, BRICKS: 22,
  STONE_BRICKS: 23, CACTUS: 24, GLOWSTONE: 25, TORCH: 26, WOOL: 27,
  OBSIDIAN: 28, PUMPKIN: 29, ICE: 30,
  NETHERRACK: 31, SOUL_SAND: 32, LAVA: 33, QUARTZ_ORE: 34,
  NETHER_BRICKS: 35, PORTAL: 36, QUARTZ_BLOCK: 37, BED: 38,
  END_STONE: 39, END_PORTAL_FRAME: 40, END_PORTAL_FRAME_LIT: 41,
  END_PORTAL: 42, DRAGON_EGG: 43, PURPUR_BLOCK: 44, END_CRYSTAL_BASE: 45,
  SPAWNER: 46, SUGAR_CANE: 47, LAPIS_ORE: 48, BOOKSHELF: 49,
  ENCHANT_TABLE: 50, GRINDSTONE: 51, ANVIL: 52, IRON_BLOCK: 53,
  LAPIS_BLOCK: 54, ANCIENT_DEBRIS: 55, NETHERITE_BLOCK: 56,
  SMITHING_TABLE: 57, TNT: 58, EMERALD_ORE: 59, GOLD_BLOCK: 60,
  ENDERITE_BLOCK: 61, BREWING_STAND: 62, SCULK: 63,
  SCULK_BENCH: 200,
  SHULKER_BOX: 201,
  FIRE: 202
};

const BLOCKS = {};
function defBlock(id, cfg) {
  cfg.id = id; cfg.isBlock = true;
  if (cfg.solid === undefined) cfg.solid = true;
  if (cfg.opaque === undefined) cfg.opaque = true;
  if (cfg.stack === undefined) cfg.stack = 64;
  if (cfg.minTier === undefined) cfg.minTier = 0;
  if (cfg.tool === undefined) cfg.tool = 'none';
  if (cfg.light === undefined) cfg.light = 0;
  BLOCKS[id] = cfg;
}
const T = (n) => Tex.index[n];

defBlock(B.BEDROCK, { name: 'Peruskallio', hardness: Infinity, all: T('bedrock') });
defBlock(B.STONE, { name: 'Kivi', hardness: 1.5, tool: 'pickaxe', minTier: 1, drop: B.COBBLE, all: T('stone') });
defBlock(B.DIRT, { name: 'Multa', hardness: 0.6, tool: 'shovel', all: T('dirt') });
defBlock(B.GRASS, { name: 'Ruoho', hardness: 0.7, tool: 'shovel', drop: B.DIRT, top: T('grass_top'), side: T('grass_side'), bottom: T('dirt') });
defBlock(B.SAND, { name: 'Hiekka', hardness: 0.6, tool: 'shovel', gravity: true, all: T('sand') });
defBlock(B.SANDSTONE, { name: 'Hiekkakivi', hardness: 0.9, tool: 'pickaxe', minTier: 1, all: T('sandstone') });
defBlock(B.COBBLE, { name: 'Mukulakivi', hardness: 2.0, tool: 'pickaxe', minTier: 1, all: T('cobble') });
defBlock(B.LOG, { name: 'Puunrunko', hardness: 2.0, tool: 'axe', top: T('log_top'), side: T('log_side'), bottom: T('log_top') });
defBlock(B.LEAVES, { name: 'Lehdet', hardness: 0.25, tool: 'none', all: T('leaves') });
defBlock(B.PLANKS, { name: 'Lankut', hardness: 2.0, tool: 'axe', all: T('planks') });
defBlock(B.GLASS, { name: 'Lasi', hardness: 0.4, tool: 'none', opaque: false, drop: -1, all: T('glass') });
defBlock(B.WATER, { name: 'Vesi', hardness: Infinity, solid: false, opaque: false, liquid: true, all: T('water') });
defBlock(B.COAL_ORE, { name: 'Hiilimalmi', hardness: 3.0, tool: 'pickaxe', minTier: 1, drop: 65, all: T('coal_ore') });
defBlock(B.IRON_ORE, { name: 'Rautamalmi', hardness: 3.0, tool: 'pickaxe', minTier: 2, all: T('iron_ore') });
defBlock(B.GOLD_ORE, { name: 'Kultamalmi', hardness: 3.0, tool: 'pickaxe', minTier: 3, all: T('gold_ore') });
defBlock(B.DIAMOND_ORE, { name: 'Timanttimalmi', hardness: 3.0, tool: 'pickaxe', minTier: 3, drop: 68, all: T('diamond_ore') });
defBlock(B.SNOW, { name: 'Lumi', hardness: 0.3, tool: 'shovel', all: T('snow') });
defBlock(B.GRAVEL, { name: 'Sora', hardness: 0.6, tool: 'shovel', gravity: true, all: T('gravel') });
defBlock(B.CRAFTING_TABLE, { name: 'Työpöytä', hardness: 2.5, tool: 'axe', interact: 'craft', top: T('ctable_top'), side: T('ctable_side'), bottom: T('planks') });
defBlock(B.FURNACE, { name: 'Uuni', hardness: 3.5, tool: 'pickaxe', minTier: 1, interact: 'furnace', top: T('furnace_side'), side: T('furnace_side'), front: T('furnace_front'), bottom: T('furnace_side') });
defBlock(B.CHEST, { name: 'Arkku', hardness: 2.5, tool: 'axe', interact: 'chest', top: T('chest_side'), side: T('chest_side'), front: T('chest_front'), bottom: T('chest_side') });
defBlock(B.BRICKS, { name: 'Tiilet', hardness: 2.0, tool: 'pickaxe', minTier: 1, all: T('bricks') });
defBlock(B.STONE_BRICKS, { name: 'Kivitiilet', hardness: 2.0, tool: 'pickaxe', minTier: 1, all: T('stone_bricks') });
defBlock(B.CACTUS, { name: 'Kaktus', hardness: 0.4, tool: 'none', hurt: true, top: T('cactus_top'), side: T('cactus_side'), bottom: T('cactus_top') });
defBlock(B.GLOWSTONE, { name: 'Hohkakivi', hardness: 0.3, tool: 'none', light: 15, all: T('glowstone') });
defBlock(B.TORCH, { name: 'Soihtu', hardness: 0, tool: 'none', solid: false, opaque: false, special: 'torch', light: 14, all: T('torch') });
defBlock(B.WOOL, { name: 'Villa', hardness: 0.8, tool: 'none', all: T('wool') });
defBlock(B.OBSIDIAN, { name: 'Obsidiaani', hardness: 12, tool: 'pickaxe', minTier: 4, all: T('obsidian') });
defBlock(B.PUMPKIN, { name: 'Kurpitsa', hardness: 1.0, tool: 'axe', top: T('pumpkin_top'), side: T('pumpkin_side'), front: T('pumpkin_side'), bottom: T('pumpkin_top') });
defBlock(B.ICE, { name: 'Jää', hardness: 0.5, tool: 'pickaxe', opaque: false, drop: -1, all: T('ice') });
defBlock(B.NETHERRACK, { name: 'Helvetinkivi', hardness: 0.7, tool: 'pickaxe', minTier: 1, all: T('netherrack') });
defBlock(B.SOUL_SAND, { name: 'Sieluhiekka', hardness: 0.7, tool: 'shovel', all: T('soul_sand') });
defBlock(B.LAVA, { name: 'Laava', hardness: Infinity, solid: false, opaque: true, liquid: true, light: 15, all: T('lava') });
defBlock(B.FIRE, { name: 'Tuli', hardness: 0, tool: 'none', solid: false, opaque: false, drop: -1, light: 14, all: T('fire'), special: 'fire' });
defBlock(B.QUARTZ_ORE, { name: 'Kvartsimalmi', hardness: 3.0, tool: 'pickaxe', minTier: 1, drop: 117, all: T('quartz_ore') });
defBlock(B.NETHER_BRICKS, { name: 'Helvetintiilet', hardness: 2.0, tool: 'pickaxe', minTier: 1, all: T('nether_bricks') });
defBlock(B.QUARTZ_BLOCK, { name: 'Kvartsilohko', hardness: 0.8, tool: 'pickaxe', minTier: 1, all: T('quartz_block') });
defBlock(B.PORTAL, { name: 'Portaali', hardness: Infinity, solid: false, opaque: false, light: 12, all: T('portal') });
defBlock(B.BED, { name: 'Sänky', hardness: 0.4, tool: 'axe', interact: 'sleep', top: T('bed_top'), side: T('bed_side'), bottom: T('bed_bottom') });
defBlock(B.END_STONE, { name: 'Loppukivi', hardness: 3.0, tool: 'pickaxe', minTier: 1, all: T('end_stone') });
defBlock(B.END_PORTAL_FRAME, { name: 'Loppuportaalin kehys', hardness: Infinity, tool: 'none', interact: 'endframe', top: T('end_portal_frame_top'), side: T('end_portal_frame_side'), bottom: T('end_stone') });
defBlock(B.END_PORTAL_FRAME_LIT, { name: 'Loppuportaalin kehys (silmä)', hardness: Infinity, tool: 'none', light: 7, top: T('end_portal_frame_lit_top'), side: T('end_portal_frame_side'), bottom: T('end_stone') });
defBlock(B.END_PORTAL, { name: 'Loppuportaali', hardness: Infinity, solid: false, opaque: false, light: 15, all: T('end_portal') });
defBlock(B.DRAGON_EGG, { name: 'Lohikäärmeen muna', hardness: 3.0, tool: 'pickaxe', minTier: 3, all: T('dragon_egg') });
defBlock(B.PURPUR_BLOCK, { name: 'Purpurilohko', hardness: 1.5, tool: 'pickaxe', minTier: 1, all: T('purpur') });
defBlock(B.END_CRYSTAL_BASE, { name: 'Loppukristallikanta', hardness: 5, tool: 'pickaxe', minTier: 3, light: 8, all: T('end_crystal_base') });
defBlock(B.SPAWNER, { name: 'Hirviötynnyri', hardness: 5, tool: 'pickaxe', minTier: 2, drop: -1, light: 8, all: T('spawner') });
defBlock(B.SUGAR_CANE, { name: 'Sokeriruoko', hardness: 0.1, tool: 'none', solid: false, opaque: false, drop: -1, all: T('sugar_cane'), special: 'cane' });
defBlock(B.LAPIS_ORE, { name: 'Lapis lazuli -malmi', hardness: 3.0, tool: 'pickaxe', minTier: 2, drop: -1, all: T('lapis_ore') });
defBlock(B.BOOKSHELF, { name: 'Kirjahylly', hardness: 1.5, tool: 'axe', top: T('bookshelf_top'), side: T('bookshelf_side'), bottom: T('bookshelf_top') });
defBlock(B.ENCHANT_TABLE, { name: 'Lumouspöytä', hardness: 5.0, tool: 'pickaxe', minTier: 1, interact: 'enchant', top: T('enchant_top'), side: T('enchant_side'), bottom: T('enchant_bottom'), light: 5 });
defBlock(B.GRINDSTONE, { name: 'Hiomakivi', hardness: 2.0, tool: 'pickaxe', minTier: 1, interact: 'grindstone', top: T('grindstone_top'), side: T('grindstone_side'), bottom: T('grindstone_side') });
defBlock(B.ANVIL, { name: 'Alasin', hardness: 5.0, tool: 'pickaxe', minTier: 2, interact: 'anvil', top: T('anvil_top'), side: T('anvil_side'), bottom: T('anvil_side') });
defBlock(B.IRON_BLOCK, { name: 'Rautalohko', hardness: 5.0, tool: 'pickaxe', minTier: 2, all: T('iron_block') });
defBlock(B.LAPIS_BLOCK, { name: 'Lapis lazuli -lohko', hardness: 3.0, tool: 'pickaxe', minTier: 2, all: T('lapis_block') });
defBlock(B.ANCIENT_DEBRIS, { name: 'Ikivanha jäänne', hardness: 30, tool: 'pickaxe', minTier: 4, drop: -1, top: T('ancient_debris_top'), side: T('ancient_debris_side'), bottom: T('ancient_debris_top') });
defBlock(B.NETHERITE_BLOCK, { name: 'Netherite-lohko', hardness: 50, tool: 'pickaxe', minTier: 4, all: T('netherite_block') });
defBlock(B.SMITHING_TABLE, { name: 'Sepänpöytä', hardness: 2.5, tool: 'axe', interact: 'smithing', top: T('smithing_top'), side: T('smithing_side'), bottom: T('smithing_side') });
defBlock(B.TNT, { name: 'TNT', hardness: 0, tool: 'none', top: T('tnt_top'), side: T('tnt_side'), bottom: T('tnt_top') });
defBlock(B.EMERALD_ORE, { name: 'Smaragdimalmi', hardness: 3.0, tool: 'pickaxe', minTier: 2, drop: -1, all: T('emerald_ore') });
defBlock(B.GOLD_BLOCK, { name: 'Kultalohko', hardness: 3.0, tool: 'pickaxe', minTier: 2, all: T('gold_block') });
defBlock(B.ENDERITE_BLOCK, { name: 'Enderite-lohko', hardness: 60, tool: 'pickaxe', minTier: 5, light: 4, all: T('enderite_block') });
defBlock(B.BREWING_STAND, { name: 'Pankkijalka', hardness: 1.5, tool: 'pickaxe', minTier: 1, interact: 'brewing', top: T('brewing_top'), side: T('brewing_side'), bottom: T('brewing_side') });
defBlock(B.SCULK, { name: 'Sculk', hardness: 0.6, tool: 'none', light: 2, all: T('sculk') });
defBlock(B.SCULK_BENCH, { name: 'Sculk-työpöytä', hardness: 3.5, tool: 'pickaxe', minTier: 1, interact: 'sculkbench', top: T('sculk_bench_top'), side: T('sculk_bench_side'), bottom: T('sculk_bench_side') });
defBlock(B.SHULKER_BOX, { name: 'Shulker-laatikko', hardness: 2.0, tool: 'pickaxe', stack: 1, interact: 'shulker', top: T('shulker_box_top'), side: T('shulker_box_side'), bottom: T('shulker_box_bottom') });

/* ============================ Item registry ============================ */
const I = {
  STICK: 64, COAL: 65, IRON_INGOT: 66, GOLD_INGOT: 67, DIAMOND: 68, APPLE: 69,
  RAW_PORK: 70, COOKED_PORK: 71, RAW_BEEF: 72, COOKED_BEEF: 73,
  RAW_CHICKEN: 74, COOKED_CHICKEN: 75, RAW_MUTTON: 76, COOKED_MUTTON: 77,
  STRING: 78, FEATHER: 79, BONE: 80, GUNPOWDER: 81, LEATHER: 82,
  ARROW: 83, BOW: 84,
  WOOD_PICKAXE: 85, STONE_PICKAXE: 86, IRON_PICKAXE: 87, DIAMOND_PICKAXE: 88,
  WOOD_AXE: 89, STONE_AXE: 90, IRON_AXE: 91, DIAMOND_AXE: 92,
  WOOD_SWORD: 93, STONE_SWORD: 94, IRON_SWORD: 95, DIAMOND_SWORD: 96,
  WOOD_SHOVEL: 97, STONE_SHOVEL: 98, IRON_SHOVEL: 99, DIAMOND_SHOVEL: 100,
  LEATHER_HELMET: 101, LEATHER_CHEST: 102, LEATHER_LEGS: 103, LEATHER_BOOTS: 104,
  IRON_HELMET: 105, IRON_CHEST: 106, IRON_LEGS: 107, IRON_BOOTS: 108,
  DIAMOND_HELMET: 109, DIAMOND_CHEST: 110, DIAMOND_LEGS: 111, DIAMOND_BOOTS: 112,
  MACE: 113, WIND_CHARGE: 114,
  FLINT: 115, FLINT_AND_STEEL: 116, NETHER_QUARTZ: 117,
  BUCKET: 118, WATER_BUCKET: 119, LAVA_BUCKET: 120,
  HOME_BUTTON: 121,
  ENDER_PEARL: 122, BLAZE_ROD: 123, BLAZE_POWDER: 124, EYE_OF_ENDER: 125,
  ELYTRA: 126,
  SUGAR_CANE: 127, SUGAR: 128, PAPER: 129, BOOK: 130, ENCHANTED_BOOK: 131,
  LAPIS: 132, SHIELD: 133, NETHERITE_SCRAP: 134, NETHERITE_INGOT: 135,
  NETHERITE_PICKAXE: 136, NETHERITE_AXE: 137, NETHERITE_SWORD: 138, NETHERITE_SHOVEL: 139,
  NETHERITE_HELMET: 140, NETHERITE_CHEST: 141, NETHERITE_LEGS: 142, NETHERITE_BOOTS: 143,
  UPGRADE_TEMPLATE: 144,
  IRON_MACE: 145, DIAMOND_MACE: 146, NETHERITE_MACE: 147,
  IRON_SHIELD: 148, DIAMOND_SHIELD: 149, NETHERITE_SHIELD: 150,
  WOOD_BAT: 151, STONE_BAT: 152, IRON_BAT: 153, DIAMOND_BAT: 154, NETHERITE_BAT: 155,
  EMERALD: 156, GOLDEN_APPLE: 157, ENCHANTED_GOLDEN_APPLE: 158,
  ENDERITE_SCRAP: 159, ENDERITE_INGOT: 160,
  ENDERITE_PICKAXE: 161, ENDERITE_AXE: 162, ENDERITE_SWORD: 163, ENDERITE_SHOVEL: 164,
  ENDERITE_HELMET: 165, ENDERITE_CHEST: 166, ENDERITE_LEGS: 167, ENDERITE_BOOTS: 168,
  ENDERITE_ELYTRA: 169,
  GLASS_BOTTLE: 170, WATER_BOTTLE: 171,
  POTION_HEALING: 172, POTION_SWIFTNESS: 173, POTION_STRENGTH: 174,
  POTION_FIRE_RESISTANCE: 175, POTION_REGENERATION: 176,
  ENDERITE_TEMPLATE: 177,
  ENDERITE_MACE: 178, ENDERITE_SHIELD: 179, ENDERITE_BAT: 180,
  FISHING_ROD: 181, NETHERITE_FISHING_ROD: 182, ENDERITE_FISHING_ROD: 183,
  RAW_FISH: 184, COOKED_FISH: 185,
  ECHO_SHARD: 186, EYE_OF_SCULK: 187, WARDEN_BLASTER: 188,
  SCULK_AMMO: 189,
  SHULKER_SHELL: 190,
  SHULKER_SHIELD: 191
};

const ITEMS = {};
function defItem(id, cfg) { cfg.id = id; cfg.isBlock = false; if (cfg.stack === undefined) cfg.stack = 64; ITEMS[id] = cfg; }

defItem(I.STICK, { name: 'Keppi', tile: T('i_stick') });
defItem(I.COAL, { name: 'Hiili', tile: T('i_coal'), fuel: 8 });
defItem(I.IRON_INGOT, { name: 'Rautaharkko', tile: T('i_iron') });
defItem(I.GOLD_INGOT, { name: 'Kultaharkko', tile: T('i_gold') });
defItem(I.DIAMOND, { name: 'Timantti', tile: T('i_diamond') });
defItem(I.APPLE, { name: 'Omena', tile: T('i_apple'), food: 4 });
defItem(I.RAW_PORK, { name: 'Raaka possu', tile: T('i_raw_pork'), food: 3 });
defItem(I.COOKED_PORK, { name: 'Paistettu possu', tile: T('i_cooked_pork'), food: 8 });
defItem(I.RAW_BEEF, { name: 'Raaka naudanliha', tile: T('i_raw_beef'), food: 3 });
defItem(I.COOKED_BEEF, { name: 'Pihvi', tile: T('i_cooked_beef'), food: 8 });
defItem(I.RAW_CHICKEN, { name: 'Raaka kana', tile: T('i_raw_chicken'), food: 2 });
defItem(I.COOKED_CHICKEN, { name: 'Paistettu kana', tile: T('i_cooked_chicken'), food: 6 });
defItem(I.RAW_MUTTON, { name: 'Raaka lammas', tile: T('i_raw_mutton'), food: 2 });
defItem(I.COOKED_MUTTON, { name: 'Paistettu lammas', tile: T('i_cooked_mutton'), food: 6 });
defItem(I.STRING, { name: 'Lanka', tile: T('i_string') });
defItem(I.FEATHER, { name: 'Höyhen', tile: T('i_feather') });
defItem(I.BONE, { name: 'Luu', tile: T('i_bone') });
defItem(I.GUNPOWDER, { name: 'Ruuti', tile: T('i_gunpowder') });
defItem(I.LEATHER, { name: 'Nahka', tile: T('i_leather') });
defItem(I.ARROW, { name: 'Nuoli', tile: T('i_arrow') });
defItem(I.BOW, { name: 'Jousi', tile: T('i_bow'), stack: 1, type: 'bow', damage: 5 });

const TOOL_DMG = {
  pickaxe: [0, 2, 3, 4, 5, 6, 7], axe: [0, 3, 4, 5, 6, 7, 8],
  sword: [0, 4, 5, 6, 7, 8, 9], shovel: [0, 2, 3, 4, 5, 6, 7],
  bat: [0, 4, 5, 6, 7, 8, 9]
};
const TOOL_SPEED = [0, 2, 4, 6, 8, 10, 12];
function defTool(id, kind, tier) {
  defItem(id, {
    name: TIER_NAMES[tier] + ' ' + kind, tile: T('tool_' + kind + '_' + tier),
    stack: 1, type: 'tool', kind, tier,
    damage: TOOL_DMG[kind][tier], mineSpeed: TOOL_SPEED[tier]
  });
}
defTool(I.WOOD_PICKAXE, 'pickaxe', 1); defTool(I.STONE_PICKAXE, 'pickaxe', 2);
defTool(I.IRON_PICKAXE, 'pickaxe', 3); defTool(I.DIAMOND_PICKAXE, 'pickaxe', 4);
defTool(I.WOOD_AXE, 'axe', 1); defTool(I.STONE_AXE, 'axe', 2);
defTool(I.IRON_AXE, 'axe', 3); defTool(I.DIAMOND_AXE, 'axe', 4);
defTool(I.WOOD_SWORD, 'sword', 1); defTool(I.STONE_SWORD, 'sword', 2);
defTool(I.IRON_SWORD, 'sword', 3); defTool(I.DIAMOND_SWORD, 'sword', 4);
defTool(I.WOOD_SHOVEL, 'shovel', 1); defTool(I.STONE_SHOVEL, 'shovel', 2);
defTool(I.IRON_SHOVEL, 'shovel', 3); defTool(I.DIAMOND_SHOVEL, 'shovel', 4);
defTool(I.NETHERITE_PICKAXE, 'pickaxe', 5); defTool(I.NETHERITE_AXE, 'axe', 5);
defTool(I.NETHERITE_SWORD, 'sword', 5); defTool(I.NETHERITE_SHOVEL, 'shovel', 5);
defTool(I.ENDERITE_PICKAXE, 'pickaxe', 6); defTool(I.ENDERITE_AXE, 'axe', 6);
defTool(I.ENDERITE_SWORD, 'sword', 6); defTool(I.ENDERITE_SHOVEL, 'shovel', 6);
defTool(I.WOOD_BAT, 'bat', 1); defTool(I.STONE_BAT, 'bat', 2);
defTool(I.IRON_BAT, 'bat', 3); defTool(I.DIAMOND_BAT, 'bat', 4);
defTool(I.NETHERITE_BAT, 'bat', 5);
defTool(I.ENDERITE_BAT, 'bat', 6);
ITEMS[I.ENDERITE_BAT].name = 'Enderite-maila';
// Override generic English names with Finnish for bats
defItem(I.EMERALD, { name: 'Smaragdi', tile: T('i_emerald') });
defItem(I.GOLDEN_APPLE, { name: 'Kultainen omena', tile: T('i_golden_apple'), stack: 16, type: 'golden_apple', food: 4 });
defItem(I.ENCHANTED_GOLDEN_APPLE, { name: 'Lumottu kultainen omena', tile: T('i_enchanted_golden_apple'), stack: 16, type: 'enchanted_golden_apple', food: 4 });
defItem(I.ENDERITE_SCRAP, { name: 'Enderite-sirpale', tile: T('i_enderite_scrap') });
defItem(I.ENDERITE_INGOT, { name: 'Enderite-harkko', tile: T('i_enderite_ingot') });
defItem(I.ENDERITE_ELYTRA, { name: 'Enderite-elytra', tile: T('i_enderite_elytra'), stack: 1, type: 'armor', slot: 'chest', defense: 11, elytra: true });
defItem(I.GLASS_BOTTLE, { name: 'Lasipullo', tile: T('i_glass_bottle'), stack: 64, type: 'glass_bottle' });
defItem(I.WATER_BOTTLE, { name: 'Vesipullo', tile: T('i_water_bottle'), stack: 1, type: 'water_bottle' });
defItem(I.POTION_HEALING, { name: 'Parannusjuoma', tile: T('i_potion_healing'), stack: 1, type: 'potion', potion: 'healing' });
defItem(I.POTION_SWIFTNESS, { name: 'Nopeusjuoma', tile: T('i_potion_swiftness'), stack: 1, type: 'potion', potion: 'swiftness' });
defItem(I.POTION_STRENGTH, { name: 'Voimajuoma', tile: T('i_potion_strength'), stack: 1, type: 'potion', potion: 'strength' });
defItem(I.POTION_FIRE_RESISTANCE, { name: 'Tulisuojajuoma', tile: T('i_potion_fire_resistance'), stack: 1, type: 'potion', potion: 'fire_resistance' });
defItem(I.POTION_REGENERATION, { name: 'Regeneraatiojuoma', tile: T('i_potion_regeneration'), stack: 1, type: 'potion', potion: 'regeneration' });

/* Brewing recipes: ingredient + water bottle → potion */
const BREWING = {};
BREWING[I.APPLE] = I.POTION_HEALING;
BREWING[I.SUGAR] = I.POTION_SWIFTNESS;
BREWING[I.BLAZE_POWDER] = I.POTION_STRENGTH;
BREWING[I.BLAZE_ROD] = I.POTION_FIRE_RESISTANCE;
BREWING[I.GHAST_TEAR || I.ENDER_PEARL] = I.POTION_REGENERATION; // ender pearl as substitute
ITEMS[I.WOOD_BAT].name = 'Puumaila';
ITEMS[I.STONE_BAT].name = 'Kivimaila';
ITEMS[I.IRON_BAT].name = 'Rautamaila';
ITEMS[I.DIAMOND_BAT].name = 'Timanttimaila';
ITEMS[I.NETHERITE_BAT].name = 'Netherite-maila';

/* armour */
const ARMOR_DEFENSE = {
  leather: { helmet: 1, chest: 3, legs: 2, boots: 1 },
  iron: { helmet: 2, chest: 6, legs: 5, boots: 2 },
  diamond: { helmet: 3, chest: 8, legs: 6, boots: 3 },
  netherite: { helmet: 4, chest: 9, legs: 7, boots: 4 },
  enderite: { helmet: 5, chest: 11, legs: 8, boots: 5 }
};
const ARMOR_SLOT = { helmet: 'head', chest: 'chest', legs: 'legs', boots: 'feet' };
const ARMOR_FI = { leather: 'Nahka', iron: 'Rauta', diamond: 'Timantti', netherite: 'Netherite', enderite: 'Enderite' };
const PIECE_FI = { helmet: 'kypärä', chest: 'haarniska', legs: 'housut', boots: 'saappaat' };
function defArmor(id, tier, piece) {
  defItem(id, {
    name: ARMOR_FI[tier] + '-' + PIECE_FI[piece],
    tile: T('armor_' + tier + '_' + piece), stack: 1,
    type: 'armor', slot: ARMOR_SLOT[piece], defense: ARMOR_DEFENSE[tier][piece]
  });
}
defArmor(I.LEATHER_HELMET, 'leather', 'helmet'); defArmor(I.LEATHER_CHEST, 'leather', 'chest');
defArmor(I.LEATHER_LEGS, 'leather', 'legs'); defArmor(I.LEATHER_BOOTS, 'leather', 'boots');
defArmor(I.IRON_HELMET, 'iron', 'helmet'); defArmor(I.IRON_CHEST, 'iron', 'chest');
defArmor(I.IRON_LEGS, 'iron', 'legs'); defArmor(I.IRON_BOOTS, 'iron', 'boots');
defArmor(I.DIAMOND_HELMET, 'diamond', 'helmet'); defArmor(I.DIAMOND_CHEST, 'diamond', 'chest');
defArmor(I.DIAMOND_LEGS, 'diamond', 'legs'); defArmor(I.DIAMOND_BOOTS, 'diamond', 'boots');
defArmor(I.NETHERITE_HELMET, 'netherite', 'helmet'); defArmor(I.NETHERITE_CHEST, 'netherite', 'chest');
defArmor(I.NETHERITE_LEGS, 'netherite', 'legs'); defArmor(I.NETHERITE_BOOTS, 'netherite', 'boots');
defArmor(I.ENDERITE_HELMET, 'enderite', 'helmet'); defArmor(I.ENDERITE_CHEST, 'enderite', 'chest');
defArmor(I.ENDERITE_LEGS, 'enderite', 'legs'); defArmor(I.ENDERITE_BOOTS, 'enderite', 'boots');

/* Smithing-pöydän päivityskartta: timanttiesine -> netherite-vastine */
const DIAMOND_TO_NETHERITE = {};
DIAMOND_TO_NETHERITE[I.DIAMOND_PICKAXE] = I.NETHERITE_PICKAXE;
DIAMOND_TO_NETHERITE[I.DIAMOND_AXE]     = I.NETHERITE_AXE;
DIAMOND_TO_NETHERITE[I.DIAMOND_SWORD]   = I.NETHERITE_SWORD;
DIAMOND_TO_NETHERITE[I.DIAMOND_SHOVEL]  = I.NETHERITE_SHOVEL;
DIAMOND_TO_NETHERITE[I.DIAMOND_HELMET]  = I.NETHERITE_HELMET;
DIAMOND_TO_NETHERITE[I.DIAMOND_CHEST]   = I.NETHERITE_CHEST;
DIAMOND_TO_NETHERITE[I.DIAMOND_LEGS]    = I.NETHERITE_LEGS;
DIAMOND_TO_NETHERITE[I.DIAMOND_BOOTS]   = I.NETHERITE_BOOTS;
DIAMOND_TO_NETHERITE[I.DIAMOND_BAT]     = I.NETHERITE_BAT;

/* Netherite -> Enderite smithing upgrade map */
const NETHERITE_TO_ENDERITE = {};
NETHERITE_TO_ENDERITE[I.NETHERITE_PICKAXE] = I.ENDERITE_PICKAXE;
NETHERITE_TO_ENDERITE[I.NETHERITE_AXE]     = I.ENDERITE_AXE;
NETHERITE_TO_ENDERITE[I.NETHERITE_SWORD]   = I.ENDERITE_SWORD;
NETHERITE_TO_ENDERITE[I.NETHERITE_SHOVEL]  = I.ENDERITE_SHOVEL;
NETHERITE_TO_ENDERITE[I.NETHERITE_HELMET]  = I.ENDERITE_HELMET;
NETHERITE_TO_ENDERITE[I.NETHERITE_CHEST]   = I.ENDERITE_CHEST;
NETHERITE_TO_ENDERITE[I.NETHERITE_LEGS]    = I.ENDERITE_LEGS;
NETHERITE_TO_ENDERITE[I.NETHERITE_BOOTS]   = I.ENDERITE_BOOTS;
NETHERITE_TO_ENDERITE[I.NETHERITE_MACE]    = I.ENDERITE_MACE;
NETHERITE_TO_ENDERITE[I.NETHERITE_SHIELD]  = I.ENDERITE_SHIELD;
NETHERITE_TO_ENDERITE[I.NETHERITE_BAT]     = I.ENDERITE_BAT;
NETHERITE_TO_ENDERITE[I.NETHERITE_FISHING_ROD] = I.ENDERITE_FISHING_ROD;
DIAMOND_TO_NETHERITE[I.FISHING_ROD]        = I.NETHERITE_FISHING_ROD;

/* Yleinen sepänpöytä-päivitystaulukko: [base, material] -> result */
const SMITHING_UPGRADES = [
  // Mace tiers
  { from: I.MACE,           mat: I.IRON_INGOT,       to: I.IRON_MACE },
  { from: I.MACE,           mat: I.DIAMOND,          to: I.DIAMOND_MACE },
  { from: I.MACE,           mat: I.NETHERITE_INGOT,  to: I.NETHERITE_MACE },
  { from: I.IRON_MACE,      mat: I.DIAMOND,          to: I.DIAMOND_MACE },
  { from: I.IRON_MACE,      mat: I.NETHERITE_INGOT,  to: I.NETHERITE_MACE },
  { from: I.DIAMOND_MACE,   mat: I.NETHERITE_INGOT,  to: I.NETHERITE_MACE },
  // Shield tiers
  { from: I.SHIELD,         mat: I.IRON_INGOT,       to: I.IRON_SHIELD },
  { from: I.SHIELD,         mat: I.DIAMOND,          to: I.DIAMOND_SHIELD },
  { from: I.SHIELD,         mat: I.NETHERITE_INGOT,  to: I.NETHERITE_SHIELD },
  { from: I.IRON_SHIELD,    mat: I.DIAMOND,          to: I.DIAMOND_SHIELD },
  { from: I.IRON_SHIELD,    mat: I.NETHERITE_INGOT,  to: I.NETHERITE_SHIELD },
  { from: I.DIAMOND_SHIELD, mat: I.NETHERITE_INGOT,  to: I.NETHERITE_SHIELD }
];
function smithingUpgrade(baseId, matId) {
  if (DIAMOND_TO_NETHERITE[baseId] !== undefined && matId === I.NETHERITE_INGOT) {
    return DIAMOND_TO_NETHERITE[baseId];
  }
  if (NETHERITE_TO_ENDERITE[baseId] !== undefined && matId === I.ENDERITE_INGOT) {
    return NETHERITE_TO_ENDERITE[baseId];
  }
  for (const u of SMITHING_UPGRADES) if (u.from === baseId && u.mat === matId) return u.to;
  return null;
}
function smithingAcceptsBase(id) {
  if (DIAMOND_TO_NETHERITE[id] !== undefined) return true;
  if (NETHERITE_TO_ENDERITE[id] !== undefined) return true;
  for (const u of SMITHING_UPGRADES) if (u.from === id) return true;
  return false;
}
function smithingAcceptsMaterial(id) {
  if (id === I.NETHERITE_INGOT || id === I.ENDERITE_INGOT || id === B.NETHERRACK || id === B.PURPUR_BLOCK) return true;
  for (const u of SMITHING_UPGRADES) if (u.mat === id) return true;
  return false;
}

defItem(I.MACE, { name: 'Sotanuija', tile: T('i_mace'), stack: 1, type: 'tool', kind: 'mace', damage: 7, mineSpeed: 1 });
defItem(I.WIND_CHARGE, { name: 'Tuulipanos', tile: T('i_windcharge'), stack: 16, type: 'windcharge' });
defItem(I.FLINT, { name: 'Piikivi', tile: T('i_flint') });
defItem(I.FLINT_AND_STEEL, { name: 'Tuluskivi', tile: T('i_flint_steel'), stack: 1, type: 'igniter' });
defItem(I.NETHER_QUARTZ, { name: 'Kvartsi', tile: T('i_quartz') });
defItem(I.BUCKET, { name: 'Ämpäri', tile: T('i_bucket'), stack: 16, type: 'bucket_empty' });
defItem(I.WATER_BUCKET, { name: 'Vesiämpäri', tile: T('i_water_bucket'), stack: 1, type: 'bucket_water' });
defItem(I.LAVA_BUCKET, { name: 'Laavaämpäri', tile: T('i_lava_bucket'), stack: 1, type: 'bucket_lava' });
defItem(I.HOME_BUTTON, { name: 'Kotinappi', tile: T('i_home_button'), stack: 1, type: 'home' });
defItem(I.ENDER_PEARL, { name: 'Endermies-helmi', tile: T('i_ender_pearl'), stack: 16, type: 'enderpearl' });
defItem(I.BLAZE_ROD, { name: 'Liekkisauva', tile: T('i_blaze_rod'), stack: 16, fuel: 12 });
defItem(I.BLAZE_POWDER, { name: 'Liekkijauhe', tile: T('i_blaze_powder'), stack: 64 });
defItem(I.EYE_OF_ENDER, { name: 'Loppusilmä', tile: T('i_eye_of_ender'), stack: 16, type: 'endeye' });
defItem(I.ELYTRA, { name: 'Elytra', tile: T('i_elytra'), stack: 1, type: 'armor', slot: 'chest', defense: 0, elytra: true });
defItem(I.SUGAR_CANE, { name: 'Sokeriruoko', tile: T('i_sugar_cane'), placeable: B.SUGAR_CANE });
defItem(I.SUGAR, { name: 'Sokeri', tile: T('i_sugar') });
defItem(I.PAPER, { name: 'Paperi', tile: T('i_paper') });
defItem(I.BOOK, { name: 'Kirja', tile: T('i_book'), stack: 16 });
defItem(I.ENCHANTED_BOOK, { name: 'Lumottu kirja', tile: T('i_enchanted_book'), stack: 1, type: 'enchbook' });
defItem(I.LAPIS, { name: 'Lapis lazuli', tile: T('i_lapis') });
defItem(I.SHIELD, { name: 'Kilpi', tile: T('i_shield'), stack: 1, type: 'shield', shieldMul: 0.25 });
defItem(I.IRON_SHIELD, { name: 'Rautakilpi', tile: T('i_shield_iron'), stack: 1, type: 'shield', shieldMul: 0.18 });
defItem(I.DIAMOND_SHIELD, { name: 'Timanttikilpi', tile: T('i_shield_diamond'), stack: 1, type: 'shield', shieldMul: 0.12 });
defItem(I.NETHERITE_SHIELD, { name: 'Netherite-kilpi', tile: T('i_shield_netherite'), stack: 1, type: 'shield', shieldMul: 0.07 });
defItem(I.ENDERITE_SHIELD, { name: 'Enderite-kilpi', tile: T('i_shield_enderite'), stack: 1, type: 'shield', shieldMul: 0.04 });
defItem(I.IRON_MACE, { name: 'Rauta-sotanuija', tile: T('i_mace_iron'), stack: 1, type: 'tool', kind: 'mace', damage: 8, mineSpeed: 1 });
defItem(I.DIAMOND_MACE, { name: 'Timantti-sotanuija', tile: T('i_mace_diamond'), stack: 1, type: 'tool', kind: 'mace', damage: 9, mineSpeed: 1 });
defItem(I.NETHERITE_MACE, { name: 'Netherite-sotanuija', tile: T('i_mace_netherite'), stack: 1, type: 'tool', kind: 'mace', damage: 10, mineSpeed: 1 });
defItem(I.ENDERITE_MACE, { name: 'Enderite-sotanuija', tile: T('i_mace_enderite'), stack: 1, type: 'tool', kind: 'mace', damage: 12, mineSpeed: 1 });
defItem(I.FISHING_ROD, { name: 'Onkivapa', tile: T('i_fishing_rod'), stack: 1, type: 'fishing_rod', tier: 1 });
defItem(I.NETHERITE_FISHING_ROD, { name: 'Netherite-onkivapa', tile: T('i_fishing_rod_netherite'), stack: 1, type: 'fishing_rod', tier: 2 });
defItem(I.ENDERITE_FISHING_ROD, { name: 'Enderite-onkivapa', tile: T('i_fishing_rod_enderite'), stack: 1, type: 'fishing_rod', tier: 3 });
defItem(I.RAW_FISH, { name: 'Raaka kala', tile: T('i_raw_fish'), food: 2 });
defItem(I.COOKED_FISH, { name: 'Paistettu kala', tile: T('i_cooked_fish'), food: 6 });
defItem(I.ECHO_SHARD, { name: 'Kaiun sirpale', tile: T('i_echo_shard'), stack: 64 });
defItem(I.EYE_OF_SCULK, { name: 'Sculk-silmä', tile: T('i_eye_of_sculk'), stack: 16, type: 'sculkeye' });
defItem(I.WARDEN_BLASTER, { name: 'Warden Blaster', tile: T('i_warden_blaster'), stack: 1, type: 'warden_blaster' });
defItem(I.SCULK_AMMO, { name: 'Sculk-panos', tile: T('i_sculk_ammo'), stack: 64 });
defItem(I.SHULKER_SHELL, { name: 'Shulker-kuori', tile: T('i_shulker_shell'), stack: 64 });
defItem(I.SHULKER_SHIELD, { name: 'Shulker-kilpi', tile: T('i_shield_shulker'), stack: 1, type: 'shield', shieldMul: 0.03, shulkerShield: true });
defItem(I.NETHERITE_SCRAP, { name: 'Netherite-sirpale', tile: T('i_netherite_scrap') });
defItem(I.NETHERITE_INGOT, { name: 'Netherite-harkko', tile: T('i_netherite_ingot') });
defItem(I.UPGRADE_TEMPLATE, { name: 'Netherite-päivityssabluuna', tile: T('i_upgrade_template'), stack: 16 });
defItem(I.ENDERITE_TEMPLATE, { name: 'Enderite-päivityssabluuna', tile: T('i_enderite_template'), stack: 16 });

ITEMS[I.COAL].fuel = 8;
BLOCKS[B.LOG].fuel = 1.5;
BLOCKS[B.PLANKS].fuel = 1.5;
ITEMS[I.STICK].fuel = 0.5;
BLOCKS[B.CRAFTING_TABLE].fuel = 1.5;

/* ============================ Helpers ============================ */
// Lookup that handles both standard blocks (1-63), items (64-199) and extended-range blocks (200+)
function defOf(id) { return BLOCKS[id] || ITEMS[id]; }
function isBlockId(id) { return id > 0 && BLOCKS[id] !== undefined; }
function blockName(id) { const d = defOf(id); return d ? d.name : '???'; }
function tileURLof(id) {
  if (id <= 0) return null;
  const d = defOf(id);
  if (!d) return null;
  const tile = d.isBlock ? (d.all !== undefined ? d.all : (d.front !== undefined ? d.front : d.side)) : d.tile;
  return Tex.tileURL[tile];
}
function isSolid(id) {
  return id !== B.AIR && id !== B.WATER && id !== B.TORCH && id !== B.LAVA && id !== B.PORTAL && id !== B.FIRE;
}
function isOpaqueCube(id) {
  if (id === B.AIR || id === B.TORCH) return false;
  const d = BLOCKS[id];
  return d ? d.opaque : false;
}
function isTransparentMesh(id) {
  return id === B.WATER || id === B.GLASS || id === B.ICE || id === B.PORTAL || id === B.SUGAR_CANE;
}

/* ============================ Enchantments ============================ */
const ENCH_INFO = {
  sharpness:        { name: 'Terävyys',     max: 5, kinds: ['sword', 'axe'] },
  efficiency:       { name: 'Tehokkuus',    max: 5, kinds: ['pickaxe', 'axe', 'shovel'] },
  protection:       { name: 'Suoja',        max: 4, slots: ['head', 'chest', 'legs', 'feet'] },
  unbreaking:       { name: 'Kestävyys',    max: 3, anyTool: true, anyArmor: true, shield: true },
  fortune:          { name: 'Onni',         max: 3, kinds: ['pickaxe', 'shovel'] },
  silk_touch:       { name: 'Silkkikosketus', max: 1, kinds: ['pickaxe'] },
  smelter:          { name: 'Sulatus',      max: 1, kinds: ['pickaxe'] },
  looting:          { name: 'Saalis',       max: 3, kinds: ['sword'] },
  fire_aspect:      { name: 'Tuliaspekti',  max: 2, kinds: ['sword', 'mace'] },
  flame:            { name: 'Liekki',       max: 2, types: ['bow', 'warden_blaster'] },
  power:            { name: 'Voima',        max: 5, types: ['bow'] },
  feather_falling:  { name: 'Höyhenputous', max: 4, slots: ['feet'] },
  wind_burst:       { name: 'Tuulipuuska',  max: 3, kinds: ['mace'] },
  density:          { name: 'Raskaus',      max: 5, kinds: ['mace'] },
  deflection:       { name: 'Kimmotus',     max: 3, types: ['shield'] },
  haste:            { name: 'Vauhti',       max: 3, kinds: ['bat'] },
  spikes:           { name: 'Piikit',       max: 5, kinds: ['bat'] },
  bat_knockback:    { name: 'Lykkäys',      max: 3, kinds: ['bat'] },
  lure:             { name: 'Vetovoima',    max: 3, types: ['fishing_rod'] },
  luck_of_the_sea:  { name: 'Meren onni',   max: 3, types: ['fishing_rod'] },
  sonic_power:      { name: 'Ääniaalto',    max: 5, types: ['warden_blaster'] },
  drill:            { name: 'Pora',         max: 3, types: ['warden_blaster'] },
  beam_knockback:   { name: 'Sysäys',       max: 3, types: ['warden_blaster'] },
  conservation:     { name: 'Säästö',       max: 3, types: ['warden_blaster'] },
  piercing:         { name: 'Lävistys',     max: 3, types: ['warden_blaster'] },
  shockwave:        { name: 'Säde',         max: 3, types: ['warden_blaster'] }
};

function enchantLevel(item, name) {
  if (!item || !item.ench) return 0;
  for (const e of item.ench) if (e.n === name) return e.l;
  return 0;
}
function romanNumeral(n) { return ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n); }
function applicableEnchants(item) {
  if (!item) return [];
  // Plain book accepts any enchantment (becomes enchanted book)
  if (item.id === I.BOOK) return Object.keys(ENCH_INFO);
  const d = defOf(item.id);
  if (!d) return [];
  const out = [];
  for (const key in ENCH_INFO) {
    const info = ENCH_INFO[key];
    let ok = false;
    if (info.kinds && d.kind && info.kinds.includes(d.kind)) ok = true;
    if (info.slots && d.slot && info.slots.includes(d.slot)) ok = true;
    if (info.types && d.type && info.types.includes(d.type)) ok = true;
    if (info.anyTool && d.type === 'tool') ok = true;
    if (info.anyArmor && d.type === 'armor') ok = true;
    if (info.shield && d.type === 'shield') ok = true;
    if (ok) out.push(key);
  }
  return out;
}
function itemDisplayName(it) {
  if (!it) return '';
  const d = defOf(it.id);
  let base = (d && d.name) || '???';
  if (it.ench && it.ench.length) {
    base += ' [' + it.ench.map((e) => (ENCH_INFO[e.n] ? ENCH_INFO[e.n].name : e.n) + ' ' + romanNumeral(e.l)).join(', ') + ']';
  }
  return base;
}
function faceTile(d, faceIndex) {
  // faceIndex: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  if (d.all !== undefined) return d.all;
  if (faceIndex === 2) return d.top;
  if (faceIndex === 3) return d.bottom;
  if (faceIndex === 4 && d.front !== undefined) return d.front;
  return d.side;
}
