/**
 * Genera un catálogo de DEMO (16 productos, 3 grupos) con imágenes sintéticas
 * (SVG → JPG) y fichas "crudas" con campos en chino, como las que exportaría
 * Sourcebase. Sirve para probar todo el flujo sin internet: npm run demo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { suggestPrice, roundPsychological } from '../src/lib/pricing.js';

const pricing = JSON.parse(readFileSync(new URL('../config/store.config.json', import.meta.url))).pricing;

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'raw');
mkdirSync(path.join(dir, 'img'), { recursive: true });

const W = 1000; const H = 1333;
const shade = '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>';
const SHAPES = {
  tee: 'M330 330 l90-60 h160 l90 60 l130 150 l-90 70 l-60-60 v510 h-380 v-510 l-60 60 l-90-70 z',
  long: 'M330 330 l90-60 h160 l90 60 l60 520 l-80 10 l-40-380 v460 h-320 v-460 l-40 380 l-80-10 z',
  jacket: 'M310 320 l110-70 h160 l110 70 l70 540 l-90 10 l-30-330 v400 h-300 v-400 l-30 330 l-90-10 z',
  pants: 'M380 260 h240 l40 820 h-120 l-40-560 l-40 560 h-120 z',
  shorts: 'M370 420 h260 l40 380 h-130 l-40-220 l-40 220 h-130 z',
  sneaker: 'M230 760 q10-120 140-150 l120-60 q60-20 90 30 q90 90 220 110 q60 10 60 70 v40 h-630 z',
  boot: 'M380 400 h170 v300 q170 40 210 120 v60 h-380 z',
  cap: 'M300 700 q0-230 200-230 q200 0 200 230 z M650 690 q160 0 200 40 l-30 20 q-100-20-200-10 z',
  bag: 'M320 520 h360 l40 470 h-440 z M420 520 q0-150 80-150 q80 0 80 150',
  belt: 'M220 640 h560 v60 h-560 z M680 620 h90 v100 h-90 z',
  scarf: 'M380 280 h180 v620 l-40 60 l-40-60 l-40 60 l-40-60 l-20 0 z',
};
const garment = (color, shape) => `<defs>${shade}</defs><path d="${SHAPES[shape]}" fill="${color}" ${shape === 'bag' ? 'stroke="' + color + '" stroke-width="18"' : ''}/><path d="${SHAPES[shape]}" fill="url(#sh)"/>`;

const svgs = {
  packshot: (c, s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f2f1ee"/>${garment(c, s)}</svg>`,
  model: (c, s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a8b99"/><stop offset="1" stop-color="#c9b8a6"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><ellipse cx="500" cy="200" rx="95" ry="120" fill="#e0a98a"/><rect x="455" y="300" width="90" height="60" fill="#d99c7c"/>
    <rect x="300" y="580" width="90" height="260" fill="#d9a080"/><rect x="610" y="580" width="90" height="260" fill="#d9a080"/>${garment(c, s)}</svg>`,
  detail: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="t" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="14" height="14" fill="${c}"/><rect width="5" height="14" fill="#00000030"/></pattern></defs><rect width="100%" height="100%" fill="url(#t)"/></svg>`,
  size_chart: () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
    ${Array.from({ length: 22 }, (_, i) => `<line x1="40" y1="${80 + i * 55}" x2="960" y2="${80 + i * 55}" stroke="#222" stroke-width="3"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="${40 + i * 153}" y1="80" x2="${40 + i * 153}" y2="1235" stroke="#222" stroke-width="3"/>`).join('')}
    ${Array.from({ length: 21 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<text x="${70 + c * 153}" y="${120 + r * 55}" font-size="30" font-family="sans-serif" fill="#111">${100 + r + c}</text>`).join('')).join('')}</svg>`,
  banner: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="2400"><rect width="100%" height="100%" fill="${c}"/><rect y="900" width="100%" height="400" fill="#fff"/></svg>`,
};

const HEX = { 黑色: '#1d1d1f', 白色: '#f7f7f5', 灰色: '#8d8f92', 驼色: '#b08a5b', 米白: '#ece6da', 藏青: '#1f2a44', 浅蓝: '#a9c4e0', 军绿: '#5b6340', 卡其: '#a39167', 酒红: '#6d1a2b', 咖啡色: '#6b4a32', 蓝色: '#2f5fa7' };
const TOPS = ['S', 'M', 'L', 'XL']; const PANTS = ['28', '30', '32', '34']; const SHOES = ['40', '41', '42', '43', '44']; const ONE = ['ÚNICA'];
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

// [slug, título chino, coste CNY, colores, tallas, composición, forma, % de rebaja (o null), días desde alta]
const products = [
  ['abrigo', '羊毛 大衣 长款 男女同款 外套', 268, ['驼色', '黑色'], TOPS, '面料: 80%羊毛 20%聚酯纤维', 'jacket', 0.3, 40],
  ['chaqueta', '秋冬新款 羊毛 短款 夹克 外套', 168, ['黑色', '驼色'], TOPS, '面料: 70%羊毛 30%聚酯纤维', 'jacket', 0.25, 3],
  ['cazadora', '工装 夹克 复古', 139, ['军绿', '卡其'], TOPS, '面料: 100%棉', 'jacket', null, 12],
  ['sudadera', '重磅 纯棉 卫衣 宽松 oversize', 89, ['灰色', '米白', '黑色'], TOPS, '成分: 100%棉', 'long', null, 5],
  ['hoodie', '连帽 卫衣 加绒', 99, ['藏青', '灰色'], TOPS, '成分: 80%棉 20%聚酯纤维', 'long', 0.4, 50],
  ['jersey', '针织 毛衣 圆领 羊毛', 128, ['米白', '酒红', '藏青'], TOPS, '面料: 50%羊毛 50%腈纶', 'long', 0.2, 8],
  ['camisa', '高级感 衬衫 男 长袖 纯色', 69, ['白色', '浅蓝'], TOPS, '面料: 100%棉', 'long', null, 2],
  ['camiseta', '重磅 T恤 短袖 纯棉', 39, ['白色', '黑色', '灰色', '米白'], TOPS, '成分: 100%棉', 'tee', null, 1],
  ['polo', 'POLO衫 针织 短袖', 59, ['藏青', '米白'], TOPS, '面料: 95%棉 5%氨纶', 'tee', 0.3, 30],
  ['pantalon', '直筒 休闲裤 男 垂感 西裤', 75, ['藏青', '黑色'], PANTS, '面料: 65%聚酯纤维 33%粘纤 2%氨纶', 'pants', null, 20],
  ['vaquero', '直筒 牛仔裤 复古', 89, ['蓝色'], PANTS, '面料: 98%棉 2%氨纶', 'pants', 0.25, 15],
  ['bermuda', '工装 短裤 宽松', 55, ['卡其', '军绿'], PANTS, '面料: 100%棉', 'shorts', null, 9],
  ['zapatilla', '复古 板鞋 休闲鞋 皮', 159, ['白色', '黑色'], SHOES, '鞋面: 100%牛皮', 'sneaker', 0.2, 6],
  ['bota', '切尔西 靴 皮', 199, ['咖啡色', '黑色'], SHOES, '鞋面: 100%牛皮', 'boot', null, 25],
  ['gorra', '棒球 帽 纯棉', 29, ['黑色', '卡其', '藏青'], ONE, '面料: 100%棉', 'cap', null, 4],
  ['bolso', '托特 包 大容量 帆布', 79, ['米白', '黑色'], ONE, '面料: 100%棉', 'bag', 0.35, 35],
];

const raws = [];
for (const [slug, title, cost, colors, sizes, comp, shape, off, age] of products) {
  // Precio tachado coherente: el precio actual es el sugerido y el anterior, el de antes de la rebaja.
  const compareAt = off ? roundPsychological(suggestPrice(cost, pricing) / (1 - off)) : null;
  const c1 = HEX[colors[0]]; const c2 = HEX[colors[1]] || '#555';
  const plan = [['banner', c1], ['model', c1], ['size_chart'], ['packshot', c1], ['detail', c1], ['packshot', c2], ['model', c2], ['packshot', c1]];
  const images = [];
  for (const [i, [type, color]] of plan.entries()) {
    const file = `img/${slug}-${i}-${type}.jpg`;
    await sharp(Buffer.from(svgs[type](color, shape))).jpeg({ quality: 86 }).toFile(path.join(dir, file));
    images.push(file);
  }
  const chart = sizes === ONE ? {} : Object.fromEntries(sizes.map((s, i) => [s, shape === 'pants' || shape === 'shorts'
    ? { 腰围: 76 + i * 4, 裤长: shape === 'shorts' ? 48 : 102 + i * 2 } : shape === 'sneaker' || shape === 'boot' ? {} : { 胸围: 108 + i * 4, 衣长: 66 + i * 2, 肩宽: 46 + i * 1.5 }]));
  raws.push({
    url: `https://weidian.com/item.html?itemID=demo-${slug}`, platform: 'weidian', shop: 'Demo Shop',
    title, price_cny: cost, images, imported_at: daysAgo(age),
    ...(compareAt ? { compare_at_eur: compareAt } : {}),
    skus: colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s, price_cny: cost }))),
    attributes: { [comp.split(':')[0]]: comp.split(':')[1] },
    size_chart: Object.fromEntries(Object.entries(chart).filter(([, v]) => Object.keys(v).length)),
  });
}
// Uno sin composición, para ver que el sistema no deja publicarlo.
raws.push({ ...raws[7], url: 'https://weidian.com/item.html?itemID=demo-sincomp', title: '亚麻 衬衫 短袖', attributes: {}, compare_at_eur: undefined });
writeFileSync(path.join(dir, 'demo.json'), JSON.stringify(raws, null, 2));
console.log(`Demo: ${raws.length} productos crudos en examples/raw/demo.json`);
