/**
 * Adaptador Sourcebase → formato crudo del catálogo.
 *
 *   npm run sourcebase -- <ruta>/Sourcebase/server/data/catalog.json --store 1407325822 --limit 100
 *   opciones: --store <id> (repetible)  --q <texto en el título>  --ids wd_..,wd_..  --limit N
 *
 * FILTRO DE MARCAS (siempre activo, sin opción para desactivarlo):
 * Sourcebase etiqueta marcas con su diccionario (tagger.js). Cualquier producto
 * con marca o modelo detectado, o con expresiones típicas de réplica
 * (三标齐全, 原版, 1:1, 复刻, 莆田…), se descarta. Vender productos con marca
 * ajena sin licencia es falsificación: este catálogo es para marca blanca.
 * El filtro reduce el riesgo, no lo elimina: revisa cada producto en el panel.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPLICA_PATTERNS = [
  /三标|原版|原单|复刻|高仿|仿品|1[:：比]1|顶级版本|公司级|莆田|纯原|正品级|代购级|专柜品质|高版本|联名|官网同款|大牌/,
  /\b(nike|adidas|jordan|yeezy|supreme|gucci|prada|balenciaga|dior|louis ?vuitton|lv|chanel|moncler|stone ?island|arc'?teryx|north ?face|canada ?goose|ralph ?lauren|lacoste|burberry|essentials|fear of god|corteiz|stussy|bape|off-?white|new balance|asics|salomon|carhartt|patagonia|kailas)\b/i,
  /耐克|阿迪|乔丹|椰子|始祖鸟|北面|加拿大鹅|盟可睐|石头岛|巴黎世家|古驰|普拉达|迪奥|香奈儿|博柏利|拉夫劳伦|鳄鱼|凯乐石|萨洛蒙|亚瑟士|新百伦|卡哈特|巴塔哥尼亚/,
];

const COLOR_OPT = /颜色|颜色分类|色|colou?r/i;
const SIZE_OPT = /尺码|尺寸|码|size|规格/i;

export async function loadTagger(catalogPath, explicit) {
  const candidates = [explicit, path.resolve(path.dirname(catalogPath), '..', 'tagger.js')].filter(Boolean);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const mod = await import(pathToFileURL(file).href);
      try { mod.loadDictionary?.(); } catch { /* diccionario opcional */ }
      if (typeof mod.tagTitle === 'function') return (title) => mod.tagTitle(title) || {};
    } catch { /* sigue con el siguiente */ }
  }
  return null;
}

export function brandReason(title, tagger) {
  const t = tagger ? tagger(title) : {};
  if (t.brand || t.model) return `marca detectada por Sourcebase: ${t.brand || t.model}`;
  const hit = REPLICA_PATTERNS.map((re) => title.match(re)).find(Boolean);
  return hit ? `expresión de marca/réplica: "${hit[0]}"` : null;
}

/** Divide el título de un SKU ("黑色;M", "黑色 XL", "灰色/均码") usando los valores de las opciones. */
export function splitVariantTitle(title, options = []) {
  const colorOpt = options.find((o) => COLOR_OPT.test(o.name));
  const sizeOpt = options.find((o) => SIZE_OPT.test(o.name) && o !== colorOpt);
  const has = (opt) => opt?.values.find((v) => title.includes(v));
  let color = has(colorOpt); let size = has(sizeOpt);
  if (!color || !size) {
    const parts = title.split(/[;；,，/\s|]+/).filter(Boolean);
    const sizeLike = (x) => /^(XXS|XS|S|M|L|XL|XXL|[2-6]XL|\d{2,3}|均码|F|FREE)$/i.test(x);
    size ||= parts.find(sizeLike);
    color ||= parts.find((p) => !sizeLike(p)) || null;
  }
  if (size && /^(均码|F|FREE)$/i.test(size)) size = 'Única';
  return { color: color || 'Único', size: size || 'Única' };
}

export function sourcebaseToRaw(p) {
  const skus = (p.variants || []).map((v) => {
    const { color, size } = splitVariantTitle(v.title || '', p.options || []);
    return { color, size, price_cny: v.price ?? p.price_original, stock: v.stock };
  });
  return {
    url: p.source_url,
    platform: (p.marketplace || 'weidian').toLowerCase(),
    shop: p.store_name || p.store_id,
    title: p.name,
    price_cny: p.price_original || null,
    images: p.image_source_urls?.length ? p.image_source_urls : [p.image_source_url].filter(Boolean),
    skus,
    imported_at: p.first_seen_at || p.imported_at,
    notes: `Sourcebase ${p.id}${p.variants_status === 'pending' ? ' · variantes pendientes en Sourcebase' : ''}`,
  };
}

export async function importSourcebase(catalogPath, { stores = [], ids = [], q = '', limit = 200, tagger: taggerPath, log = console.log } = {}) {
  const data = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const all = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
  const blocked = new Set(Object.keys(data.blocked || {}));
  const tagger = await loadTagger(catalogPath, taggerPath);
  if (!tagger) log('  ⚠ No encontré tagger.js de Sourcebase: el filtro de marcas usará solo la lista básica.');

  const idSet = new Set(ids);
  const sel = all.filter((p) => !blocked.has(String(p.id))
    && (!stores.length || stores.includes(String(p.store_id)))
    && (!idSet.size || idSet.has(String(p.id)))
    && (!q || String(p.name).toLowerCase().includes(q.toLowerCase())));

  const out = []; const rejected = [];
  for (const p of sel) {
    if (out.length >= limit) break;
    const reason = brandReason(String(p.name || ''), tagger);
    if (reason) { rejected.push({ id: p.id, name: p.name, reason }); continue; }
    if (Number(p.stock) === 0) { rejected.push({ id: p.id, name: p.name, reason: 'agotado' }); continue; }
    out.push(sourcebaseToRaw(p));
  }
  log(`Sourcebase: ${sel.length} candidatos → ${out.length} importables, ${rejected.length} descartados`);
  const byReason = rejected.reduce((m, r) => { const k = r.reason.split(':')[0]; m[k] = (m[k] || 0) + 1; return m; }, {});
  for (const [k, n] of Object.entries(byReason)) log(`  descartados (${k}): ${n}`);
  return { raws: out, rejected };
}
