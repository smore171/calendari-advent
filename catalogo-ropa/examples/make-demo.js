/**
 * Genera un catálogo de DEMO con imágenes sintéticas (SVG → JPG) y fichas
 * "crudas" con campos en chino, como las que exportaría Sourcebase.
 * Sirve para probar todo el flujo sin internet: npm run demo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'raw');
mkdirSync(path.join(dir, 'img'), { recursive: true });

const W = 1000; const H = 1333;
const garment = (color, kind) => {
  if (kind === 'pants') return `<path d="M380 260 h240 l40 820 h-120 l-40-560 l-40 560 h-120 z" fill="${color}"/>`;
  return `<path d="M330 300 l90-60 h160 l90 60 l130 180 l-90 70 l-60-80 v520 h-380 v-520 l-60 80 l-90-70 z" fill="${color}"/>
          <path d="M450 240 q50 60 100 0" stroke="#00000033" stroke-width="6" fill="none"/>`;
};

const svgs = {
  packshot: (c, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f2f1ee"/>${garment(c, k)}</svg>`,
  model: (c, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a8b99"/><stop offset="1" stop-color="#c9b8a6"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><ellipse cx="500" cy="200" rx="95" ry="120" fill="#e0a98a"/><rect x="455" y="300" width="90" height="60" fill="#d99c7c"/>
    <rect x="300" y="580" width="90" height="260" fill="#d9a080"/><rect x="610" y="580" width="90" height="260" fill="#d9a080"/>${garment(c, k)}</svg>`,
  // Tejido tipo sarga: rayas diagonales finas que llenan todo el encuadre.
  detail: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="t" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="14" height="14" fill="${c}"/><rect width="5" height="14" fill="#00000030"/></pattern></defs><rect width="100%" height="100%" fill="url(#t)"/></svg>`,
  size_chart: () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
    ${Array.from({ length: 22 }, (_, i) => `<line x1="40" y1="${80 + i * 55}" x2="960" y2="${80 + i * 55}" stroke="#222" stroke-width="3"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="${40 + i * 153}" y1="80" x2="${40 + i * 153}" y2="1235" stroke="#222" stroke-width="3"/>`).join('')}
    ${Array.from({ length: 21 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<text x="${70 + c * 153}" y="${120 + r * 55}" font-size="30" font-family="sans-serif" fill="#111">${100 + r + c}</text>`).join('')).join('')}</svg>`,
  banner: (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="2400"><rect width="100%" height="100%" fill="${c}"/><rect y="900" width="100%" height="400" fill="#fff"/></svg>`,
};

const products = [
  { slug: 'chaqueta', title: '秋冬新款 羊毛 短款 夹克 外套 男女同款', price: 168, colors: [['黑色', '#1d1d1f'], ['驼色', '#b08a5b']], sizes: ['S', 'M', 'L', 'XL'],
    comp: '面料: 70%羊毛 30%聚酯纤维', kind: 'top', chart: { S: { 胸围: 108, 衣长: 64, 袖长: 58 }, M: { 胸围: 112, 衣长: 66, 袖长: 59 }, L: { 胸围: 116, 衣长: 68, 袖长: 60 }, XL: { 胸围: 120, 衣长: 70, 袖长: 61 } } },
  { slug: 'sudadera', title: '重磅 纯棉 卫衣 宽松 oversize', price: 89, colors: [['灰色', '#8d8f92'], ['米白', '#ece6da']], sizes: ['M', 'L', 'XL'],
    comp: '成分: 100%棉', kind: 'top', chart: { M: { 胸围: 120, 衣长: 70 }, L: { 胸围: 124, 衣长: 72 }, XL: { 胸围: 128, 衣长: 74 } } },
  { slug: 'pantalon', title: '直筒 休闲裤 男 垂感 西裤', price: 75, colors: [['藏青', '#1f2a44']], sizes: ['30', '32', '34'],
    comp: '面料: 65%聚酯纤维 33%粘纤 2%氨纶', kind: 'pants', chart: { 30: { 腰围: 78, 裤长: 102 }, 32: { 腰围: 82, 裤长: 104 }, 34: { 腰围: 86, 裤长: 106 } } },
  { slug: 'camisa', title: '高级感 衬衫 男 长袖 纯色', price: 69, colors: [['白色', '#fbfbfb'], ['浅蓝', '#a9c4e0']], sizes: ['M', 'L'],
    comp: '', kind: 'top', chart: {} }, // sin composición: debe quedarse en borrador
];

const raws = [];
for (const p of products) {
  const [mainColor] = p.colors;
  // Orden "de proveedor" desordenado a propósito: banner primero, modelo, tabla, packshot…
  const plan = [
    ['banner', mainColor[1]], ['model', mainColor[1]], ['size_chart'], ['packshot', mainColor[1]],
    ['detail', mainColor[1]], ['packshot', p.colors[1]?.[1] || '#555'], ['model', p.colors[1]?.[1] || '#555'], ['packshot', mainColor[1]], // duplicada
  ];
  const images = [];
  for (const [i, [type, color]] of plan.entries()) {
    const file = `img/${p.slug}-${i}-${type}.jpg`;
    await sharp(Buffer.from(svgs[type](color, p.kind))).jpeg({ quality: 88 }).toFile(path.join(dir, file));
    images.push(file);
  }
  raws.push({
    url: `https://weidian.com/item.html?itemID=demo-${p.slug}`,
    platform: 'weidian', shop: 'Demo Shop', title: p.title, price_cny: p.price,
    images,
    skus: p.colors.flatMap(([c]) => p.sizes.map((s) => ({ color: c, size: s, price_cny: p.price }))),
    attributes: p.comp ? { [p.comp.split(':')[0]]: p.comp.split(':')[1] } : {},
    size_chart: p.chart,
  });
}
writeFileSync(path.join(dir, 'demo.json'), JSON.stringify(raws, null, 2));
console.log(`Demo: ${raws.length} productos crudos en examples/raw/demo.json`);
