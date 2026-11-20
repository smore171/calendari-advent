/**
 * Glosario mínimo chino → español para ropa. No es un traductor: cubre los
 * términos que más se repiten en fichas de 1688/Weidian (colores, tallas,
 * medidas y fibras). Para títulos completos usa el proveedor IA opcional o
 * reescríbelos en el panel.
 */
export const COLORS = {
  '黑色': 'Negro', '白色': 'Blanco', '灰色': 'Gris', '深灰': 'Gris oscuro', '浅灰': 'Gris claro',
  '米色': 'Beige', '米白': 'Crudo', '杏色': 'Albaricoque', '卡其': 'Caqui', '卡其色': 'Caqui',
  '咖啡色': 'Marrón', '棕色': 'Marrón', '驼色': 'Camel', '藏青': 'Azul marino', '藏蓝': 'Azul marino',
  '蓝色': 'Azul', '浅蓝': 'Azul claro', '绿色': 'Verde', '军绿': 'Verde militar', '墨绿': 'Verde oscuro',
  '红色': 'Rojo', '酒红': 'Burdeos', '粉色': 'Rosa', '紫色': 'Morado', '黄色': 'Amarillo', '橙色': 'Naranja',
};

export const FIBERS = {
  '棉': 'algodón', '纯棉': 'algodón', '羊毛': 'lana', '羊绒': 'cachemira', '聚酯纤维': 'poliéster',
  '涤纶': 'poliéster', '锦纶': 'poliamida', '尼龙': 'poliamida', '氨纶': 'elastano', '粘纤': 'viscosa',
  '粘胶纤维': 'viscosa', '亚麻': 'lino', '麻': 'lino', '真丝': 'seda', '桑蚕丝': 'seda', '腈纶': 'acrílico',
  '莫代尔': 'modal', '天丝': 'lyocell', '莱赛尔': 'lyocell',
};

export const MEASURES = {
  '胸围': 'pecho', '衣长': 'largo', '袖长': 'manga', '肩宽': 'hombros', '腰围': 'cintura',
  '臀围': 'cadera', '裤长': 'largo', '大腿围': 'muslo', '下摆': 'bajo', '领围': 'cuello',
};

const CATEGORY_HINTS = [
  ['chaquetas', /外套|夹克|大衣|风衣|羽绒|棉服|jacket|coat|chaqueta|abrigo|parka/i],
  ['sudaderas', /卫衣|hoodie|sweatshirt|sudadera/i],
  ['punto', /毛衣|针织|开衫|knit|sweater|cardigan|jersey|punto/i],
  ['camisas', /衬衫|shirt|camisa/i],
  ['camisetas', /T恤|短袖|tee|t-shirt|camiseta/i],
  ['pantalones', /裤|pants|trousers|jeans|pantal/i],
  ['accesorios', /帽|围巾|包|cap|hat|scarf|bag|gorra|bufanda/i],
];

export function translateTerm(text) {
  if (!text) return text;
  let out = String(text);
  for (const [zh, es] of Object.entries(COLORS).sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(zh).join(es);
  }
  return out.trim();
}

export function translateComposition(text) {
  if (!text) return '';
  // "70%羊毛 30%聚酯纤维" | "羊毛70% 聚酯纤维30%"
  const parts = [];
  const re = /(\d{1,3}(?:\.\d+)?)\s*%\s*([^\d%,，;；\s]+)|([^\d%,，;；\s]+?)\s*(\d{1,3}(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(text))) {
    const pct = m[1] || m[4];
    const fiberRaw = (m[2] || m[3] || '').trim();
    const fiber = FIBERS[fiberRaw] || fiberRaw;
    parts.push(`${pct}% ${fiber}`);
  }
  return parts.length ? parts.join(', ') : text.trim();
}

export function translateSizeChart(chart) {
  const out = {};
  for (const [size, measures] of Object.entries(chart || {})) {
    const row = {};
    for (const [k, v] of Object.entries(measures || {})) {
      const num = Number(String(v).replace(/[^\d.]/g, ''));
      if (Number.isFinite(num) && num > 0) row[MEASURES[k] || k] = num;
    }
    if (Object.keys(row).length) out[String(size).toUpperCase()] = row;
  }
  return out;
}

const SINGULAR = { chaquetas: 'Chaqueta', sudaderas: 'Sudadera', punto: 'Jersey de punto', camisas: 'Camisa', camisetas: 'Camiseta', pantalones: 'Pantalón', accesorios: 'Accesorio' };
const MATERIAL_HINTS = [[/羊绒|cashmere/i, 'de cachemira'], [/羊毛|wool/i, 'de lana'], [/亚麻|linen/i, 'de lino'], [/纯棉|全棉|100%棉|cotton/i, 'de algodón'], [/真丝|silk/i, 'de seda'], [/灯芯绒|corduroy/i, 'de pana'], [/牛仔|denim/i, 'denim']];
const STYLE_HINTS = [[/oversize|宽松|落肩/i, 'oversize'], [/短款|cropped/i, 'corta'], [/直筒|straight/i, 'recto'], [/重磅|heavyweight/i, 'gruesa'], [/连帽|hood/i, 'con capucha'], [/长袖/i, 'de manga larga'], [/短袖/i, 'de manga corta']];

/**
 * Título provisional en español a partir de pistas del título chino
 * ("重磅 纯棉 卫衣 宽松" → "Sudadera oversize de algodón"). Se revisa en el panel.
 */
export function provisionalTitle(original, category) {
  const base = SINGULAR[category] || 'Prenda';
  const style = STYLE_HINTS.filter(([re]) => re.test(original)).map(([, w]) => w).slice(0, 2);
  const material = MATERIAL_HINTS.find(([re]) => re.test(original))?.[1];
  return [base, ...style, material].filter(Boolean).join(' ');
}

export function guessCategory(text) {
  for (const [id, re] of CATEGORY_HINTS) if (re.test(text)) return id;
  return '';
}
