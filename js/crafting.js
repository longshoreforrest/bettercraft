/* CopyCraft — crafting recipes & furnace smelting */
'use strict';

const RECIPES = [];

function shaped(pattern, key, resId, resCount) {
  const h = pattern.length;
  let w = 0;
  for (const s of pattern) w = Math.max(w, s.length);
  const cells = [];
  for (let r = 0; r < h; r++) {
    const s = pattern[r];
    for (let c = 0; c < w; c++) {
      const ch = s[c] || ' ';
      cells.push(ch === ' ' ? 0 : (key[ch] || 0));
    }
  }
  RECIPES.push({ type: 'shaped', w, h, cells, result: { id: resId, count: resCount } });
}
function shapeless(ids, resId, resCount) {
  RECIPES.push({ type: 'shapeless', ids: ids.slice().sort((a, b) => a - b), result: { id: resId, count: resCount } });
}

/* basic recipes */
shapeless([B.LOG], B.PLANKS, 4);
shaped(['P', 'P'], { P: B.PLANKS }, I.STICK, 4);
shaped(['PP', 'PP'], { P: B.PLANKS }, B.CRAFTING_TABLE, 1);
shaped(['CCC', 'C C', 'CCC'], { C: B.COBBLE }, B.FURNACE, 1);
shaped(['PPP', 'P P', 'PPP'], { P: B.PLANKS }, B.CHEST, 1);
shaped(['c', 's'], { c: I.COAL, s: I.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE, 1);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
shapeless([I.STRING, I.STRING, I.STRING, I.STRING], B.WOOL, 1);
shaped([' s#', 's #', ' s#'], { s: I.STICK, '#': I.STRING }, I.BOW, 1);
shaped(['c', 's', 'f'], { c: B.COBBLE, s: I.STICK, f: I.FEATHER }, I.ARROW, 4);
shaped(['GGG', 'GGG', 'GGG'], { G: I.GOLD_INGOT }, B.GLOWSTONE, 1);

/* tools — four tiers */
const TOOL_MATS = [
  { m: B.PLANKS, pickaxe: I.WOOD_PICKAXE, axe: I.WOOD_AXE, sword: I.WOOD_SWORD, shovel: I.WOOD_SHOVEL },
  { m: B.COBBLE, pickaxe: I.STONE_PICKAXE, axe: I.STONE_AXE, sword: I.STONE_SWORD, shovel: I.STONE_SHOVEL },
  { m: I.IRON_INGOT, pickaxe: I.IRON_PICKAXE, axe: I.IRON_AXE, sword: I.IRON_SWORD, shovel: I.IRON_SHOVEL },
  { m: I.DIAMOND, pickaxe: I.DIAMOND_PICKAXE, axe: I.DIAMOND_AXE, sword: I.DIAMOND_SWORD, shovel: I.DIAMOND_SHOVEL }
];
for (const t of TOOL_MATS) {
  const key = { M: t.m, S: I.STICK };
  shaped(['MMM', ' S ', ' S '], key, t.pickaxe, 1);
  shaped(['MM', 'MS', ' S'], key, t.axe, 1);
  shaped(['MM', 'SM', 'S '], key, t.axe, 1);
  shaped(['M', 'M', 'S'], key, t.sword, 1);
  shaped(['M', 'S', 'S'], key, t.shovel, 1);
}

/* Pesäpallomaila: 2 materiaalia + 1 tikku (vertikaalisesti) */
const BAT_MATS = [
  { m: B.PLANKS, bat: I.WOOD_BAT },
  { m: B.COBBLE, bat: I.STONE_BAT },
  { m: I.IRON_INGOT, bat: I.IRON_BAT },
  { m: I.DIAMOND, bat: I.DIAMOND_BAT }
];
for (const t of BAT_MATS) {
  shaped(['MMS'], { M: t.m, S: I.STICK }, t.bat, 1);
}

/* armour — leather / iron / diamond */
const ARMOR_RECIPES = [
  { m: I.LEATHER, h: I.LEATHER_HELMET, c: I.LEATHER_CHEST, l: I.LEATHER_LEGS, b: I.LEATHER_BOOTS },
  { m: I.IRON_INGOT, h: I.IRON_HELMET, c: I.IRON_CHEST, l: I.IRON_LEGS, b: I.IRON_BOOTS },
  { m: I.DIAMOND, h: I.DIAMOND_HELMET, c: I.DIAMOND_CHEST, l: I.DIAMOND_LEGS, b: I.DIAMOND_BOOTS }
];
for (const a of ARMOR_RECIPES) {
  const k = { X: a.m };
  shaped(['XXX', 'X X'], k, a.h, 1);
  shaped(['X X', 'XXX', 'XXX'], k, a.c, 1);
  shaped(['XXX', 'X X', 'X X'], k, a.l, 1);
  shaped(['X X', 'X X'], k, a.b, 1);
}

/* mace & wind charge */
shaped(['D', 'I', 'S'], { D: I.DIAMOND, I: I.IRON_INGOT, S: I.STICK }, I.MACE, 1);
shapeless([I.BONE, I.BONE, I.FEATHER], I.WIND_CHARGE, 2);

/* flint & steel, nether building blocks */
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL, 1);
shaped(['NN', 'NN'], { N: B.NETHERRACK }, B.NETHER_BRICKS, 1);
shaped(['QQ', 'QQ'], { Q: I.NETHER_QUARTZ }, B.QUARTZ_BLOCK, 1);

/* bed */
shaped(['WWW', 'PPP'], { W: B.WOOL, P: B.PLANKS }, B.BED, 1);

/* bucket — U-shape of iron */
shaped(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET, 1);

/* End-related crafting (the way to beat the game) */
shapeless([I.BLAZE_ROD], I.BLAZE_POWDER, 2);
shapeless([I.ENDER_PEARL, I.BLAZE_POWDER], I.EYE_OF_ENDER, 1);
shapeless([I.ENDERITE_SCRAP, I.ENDER_PEARL], I.EYE_OF_SCULK, 1);

/* Sugar cane → sugar / paper */
shapeless([B.SUGAR_CANE], I.SUGAR, 1);
shaped(['CCC'], { C: B.SUGAR_CANE }, I.PAPER, 1);

/* Books, bookshelves, iron block */
shaped(['PPL'], { P: I.PAPER, L: I.LEATHER }, I.BOOK, 1);
shaped(['PPP', 'BBB', 'PPP'], { P: B.PLANKS, B: I.BOOK }, B.BOOKSHELF, 1);
shaped(['III', 'III', 'III'], { I: I.IRON_INGOT }, B.IRON_BLOCK, 1);

/* Enchanting infrastructure */
shaped([' B ', 'DOD', 'OOO'], { B: I.BOOK, D: I.DIAMOND, O: B.OBSIDIAN }, B.ENCHANT_TABLE, 1);
shaped(['SPS', 'C C'], { S: I.STICK, P: B.PLANKS, C: B.COBBLE }, B.GRINDSTONE, 1);
shaped(['III', ' I ', 'III'], { I: I.IRON_INGOT }, B.ANVIL, 1);

/* Shield */
shaped(['PIP', 'PPP', ' P '], { P: B.PLANKS, I: I.IRON_INGOT }, I.SHIELD, 1);

/* Sculk-työpöytä: 2 sculk + 4 iron */
shaped(['ISI', 'ISI'], { I: I.IRON_INGOT, S: B.SCULK }, B.SCULK_BENCH, 1);

/* Shulker box: 2 shulker shells + 1 chest (vanilla recipe) */
shaped(['S', 'C', 'S'], { S: I.SHULKER_SHELL, C: B.CHEST }, B.SHULKER_BOX, 1);

/* Lapis lazuli block + uncraft */
shaped(['LLL', 'LLL', 'LLL'], { L: I.LAPIS }, B.LAPIS_BLOCK, 1);
shapeless([B.LAPIS_BLOCK], I.LAPIS, 9);

/* Netherite: 4 scrap + 4 gold → 1 ingot; 9 ingots → block (+ uncraft) */
shapeless([I.NETHERITE_SCRAP, I.NETHERITE_SCRAP, I.NETHERITE_SCRAP, I.NETHERITE_SCRAP,
           I.GOLD_INGOT, I.GOLD_INGOT, I.GOLD_INGOT, I.GOLD_INGOT], I.NETHERITE_INGOT, 1);
shaped(['NNN', 'NNN', 'NNN'], { N: I.NETHERITE_INGOT }, B.NETHERITE_BLOCK, 1);
shapeless([B.NETHERITE_BLOCK], I.NETHERITE_INGOT, 9);

/* Smithing table */
shaped(['II', 'PP', 'PP'], { I: I.IRON_INGOT, P: B.PLANKS }, B.SMITHING_TABLE, 1);

/* TNT: 5 gunpowder + 4 sand in checkered X-pattern */
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT, 1);

/* Gold block + uncraft */
shaped(['GGG', 'GGG', 'GGG'], { G: I.GOLD_INGOT }, B.GOLD_BLOCK, 1);
shapeless([B.GOLD_BLOCK], I.GOLD_INGOT, 9);

/* Golden apple: apple surrounded by 8 gold ingots */
shaped(['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }, I.GOLDEN_APPLE, 1);
/* Enchanted golden apple: apple surrounded by 8 gold blocks */
shaped(['GGG', 'GAG', 'GGG'], { G: B.GOLD_BLOCK, A: I.APPLE }, I.ENCHANTED_GOLDEN_APPLE, 1);

/* Enderite: 4 scrap + 4 diamonds → 1 ingot (replaces gold in netherite recipe) */
shapeless([I.ENDERITE_SCRAP, I.ENDERITE_SCRAP, I.ENDERITE_SCRAP, I.ENDERITE_SCRAP,
           I.DIAMOND, I.DIAMOND, I.DIAMOND, I.DIAMOND], I.ENDERITE_INGOT, 1);
/* Enderite block + uncraft */
shaped(['EEE', 'EEE', 'EEE'], { E: I.ENDERITE_INGOT }, B.ENDERITE_BLOCK, 1);
shapeless([B.ENDERITE_BLOCK], I.ENDERITE_INGOT, 9);

/* Brewing stand: 3 mukulakiveä + 1 liekkijauhe (mukulakivi koska kiveä on vaikea saada) */
shaped([' B ', 'SSS'], { B: I.BLAZE_POWDER, S: B.COBBLE }, B.BREWING_STAND, 1);

/* Enderite Elytra: combine enderite chest + elytra + 2 netherite + 2 enderite in crafting table */
shaped(['NEN', 'CEC', ' E '], { N: I.NETHERITE_INGOT, E: I.ENDERITE_INGOT, C: I.ELYTRA }, I.ENDERITE_ELYTRA, 1);

/* Glass bottle: 3 glass in V */
shaped(['G G', ' G '], { G: B.GLASS }, I.GLASS_BOTTLE, 3);

/* Fishing rod: 3 sticks diagonal + 2 string */
shaped(['  R', ' RS', 'R S'], { R: I.STICK, S: I.STRING }, I.FISHING_ROD, 1);

/* trim a flat w*w grid of ids to its minimal bounding box */
function trimGrid(ids, w) {
  let minc = w, maxc = -1, minr = w, maxr = -1;
  for (let r = 0; r < w; r++) for (let c = 0; c < w; c++) {
    if (ids[r * w + c]) {
      if (c < minc) minc = c; if (c > maxc) maxc = c;
      if (r < minr) minr = r; if (r > maxr) maxr = r;
    }
  }
  if (maxc < 0) return { w: 0, h: 0, cells: [] };
  const tw = maxc - minc + 1, th = maxr - minr + 1, cells = [];
  for (let r = 0; r < th; r++) for (let c = 0; c < tw; c++) cells.push(ids[(r + minr) * w + (c + minc)]);
  return { w: tw, h: th, cells };
}

/* match a crafting grid (array of {id,count}|null, length w*w) to a recipe */
function matchRecipe(slots, w) {
  const ids = slots.map((s) => (s ? s.id : 0));
  const tg = trimGrid(ids, w);
  if (tg.w === 0) return null;
  for (const rec of RECIPES) {
    if (rec.type === 'shaped') {
      if (rec.w !== tg.w || rec.h !== tg.h) continue;
      let ok = true;
      for (let i = 0; i < rec.cells.length; i++) {
        if (rec.cells[i] !== tg.cells[i]) { ok = false; break; }
      }
      if (ok) return rec.result;
    } else {
      const got = ids.filter((x) => x).sort((a, b) => a - b);
      if (got.length !== rec.ids.length) continue;
      let ok = true;
      for (let i = 0; i < got.length; i++) if (got[i] !== rec.ids[i]) { ok = false; break; }
      if (ok) return rec.result;
    }
  }
  return null;
}

/* furnace smelting */
const SMELT = {};
SMELT[B.IRON_ORE] = I.IRON_INGOT;
SMELT[B.GOLD_ORE] = I.GOLD_INGOT;
SMELT[B.SAND] = B.GLASS;
SMELT[B.COBBLE] = B.STONE;
SMELT[B.LOG] = I.COAL;
SMELT[B.ANCIENT_DEBRIS] = I.NETHERITE_SCRAP;
SMELT[I.RAW_FISH] = I.COOKED_FISH;
SMELT[I.RAW_PORK] = I.COOKED_PORK;
SMELT[I.RAW_BEEF] = I.COOKED_BEEF;
SMELT[I.RAW_CHICKEN] = I.COOKED_CHICKEN;
SMELT[I.RAW_MUTTON] = I.COOKED_MUTTON;

const SMELT_TIME = 6;        // seconds per item
function fuelValue(id) {
  const d = defOf(id);
  return d && d.fuel ? d.fuel : 0;
}
function smeltResult(id) { return SMELT[id] || 0; }
