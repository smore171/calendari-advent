/**
 * Adaptador: salida "cruda" de Sourcebase (o cualquier importador) → producto en borrador.
 *
 * Formato crudo esperado (flexible: acepta varios nombres de campo habituales):
 * {
 *   "url": "https://weidian.com/item.html?itemID=...",
 *   "platform": "weidian" | "1688",
 *   "shop": "nombre tienda",
 *   "title": "原标题 ...",
 *   "price_cny": 128,                       // o "price", "cost"
 *   "images": ["https://...jpg", "./local.jpg"],   // o "imgs", "pictures", "main_images"+"detail_images"
 *   "skus": [{ "color": "灰色", "size": "M", "price_cny": 128 }],   // o "variants"
 *   "attributes": { "面料": "70%羊毛 30%聚酯纤维" },
 *   "size_chart": { "M": { "胸围": 112, "衣长": 70 } }
 * }
 *
 * Cuando conectes Sourcebase, solo tienes que tocar `pick()` si sus nombres de campo difieren.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { emptyProduct, makeSku } from '../lib/schema.js';
import { suggestPrice } from '../lib/pricing.js';
import { slugify, nowIso } from '../lib/util.js';
import { supplierIdFor } from '../lib/suppliers.js';
import { translateTerm, translateSizeChart, translateComposition, guessCategory, provisionalTitle } from './glossary.js';

function pick(obj, ...keys) {
  for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

function detectPlatform(url = '') {
  if (/weidian\.com/i.test(url)) return 'weidian';
  if (/1688\.com/i.test(url)) return '1688';
  if (/taobao\.com|tmall\.com/i.test(url)) return 'taobao';
  if (/yupoo\.com/i.test(url)) return 'yupoo';
  return 'manual';
}

export function rawToProduct(raw, { config, rawDir = '.', existingIds = new Set() } = {}) {
  const p = emptyProduct();
  const url = pick(raw, 'url', 'link', 'source_url') || '';
  const titleOriginal = String(pick(raw, 'title', 'name', 'subject') || '').trim();
  const cost = Number(pick(raw, 'price_cny', 'price', 'cost', 'cost_cny'));

  p.source = {
    platform: pick(raw, 'platform') || detectPlatform(url),
    url,
    shop: pick(raw, 'shop', 'seller', 'store') || '',
    cost_cny: Number.isFinite(cost) ? cost : null,
    imported_at: pick(raw, 'imported_at') || nowIso(),
    ...(pick(raw, 'referer') ? { referer: pick(raw, 'referer') } : {}),
    supplier_url: pick(raw, 'supplier_url', 'store_url') || '',
  };
  p.source.supplier_id = pick(raw, 'supplier_id') || supplierIdFor({ platform: p.source.platform, shop: p.source.shop, store_id: pick(raw, 'store_id') });
  if (pick(raw, 'supplier_category')) p.source.supplier_category = String(pick(raw, 'supplier_category'));
  p.title_original = titleOriginal;
  if (pick(raw, 'notes')) p.review.notes = String(pick(raw, 'notes'));
  // Título provisional: se traduce/reescribe en el panel (o con el proveedor IA opcional).
  p.category = pick(raw, 'category') || guessCategory(titleOriginal) || '';
  const hasChinese = /[一-鿿]/.test(titleOriginal);
  p.title = pick(raw, 'title_es') || (hasChinese ? provisionalTitle(titleOriginal, p.category) : titleOriginal);

  // id = slug del título + 4 caracteres estables derivados de la URL (no cambia al reimportar).
  const key = url || titleOriginal;
  const short = createHash('sha1').update(key).digest('hex').slice(0, 4);
  const id = pick(raw, 'id', 'slug') ? slugify(pick(raw, 'id', 'slug')) : `${slugify(p.title)}-${short}`;
  let unique = id; let n = 2;
  while (existingIds.has(unique)) unique = `${id}-${n++}`;
  p.id = unique;

  const attrs = pick(raw, 'attributes', 'props', 'specs') || {};
  const compRaw = pick(raw, 'composition') || Object.entries(attrs)
    .find(([k]) => /面料|成分|材质|鞋面|composition|material|fabric/i.test(k))?.[1] || '';
  p.composition = translateComposition(String(compRaw));

  p.size_chart_cm = translateSizeChart(pick(raw, 'size_chart', 'sizeChart') || {});

  const skus = pick(raw, 'skus', 'variants', 'sku_list') || [];
  const colors = new Set(); const sizes = new Set();
  for (const s of skus) {
    const color = translateTerm(String(pick(s, 'color', 'colour', '颜色') || 'Único'));
    const size = String(pick(s, 'size', '尺码') || 'Única').toUpperCase();
    colors.add(color); sizes.add(size);
    const vCost = Number(pick(s, 'price_cny', 'price'));
    p.variants.push({
      sku: makeSku(p.id, color, size),
      color, size,
      stock: Number(pick(s, 'stock')) === 0 && pick(s, 'stock') !== '' && pick(s, 'stock') != null ? 'out_of_stock' : 'on_demand',
      price_eur: Number.isFinite(vCost) && vCost !== cost ? suggestPrice(vCost, config.pricing) : null,
    });
  }
  // de-dup SKUs
  const seen = new Set();
  p.variants = p.variants.filter((v) => (seen.has(v.sku) ? false : seen.add(v.sku)));
  p.colors = [...colors];
  p.sizes = [...sizes];

  p.price_eur = Number(pick(raw, 'price_eur')) || suggestPrice(p.source.cost_cny, config.pricing);
  const compareAt = Number(pick(raw, 'compare_at_eur'));
  p.compare_at_eur = Number.isFinite(compareAt) && compareAt > p.price_eur ? compareAt : null;
  if (pick(raw, 'fit_note')) p.fit_note = pick(raw, 'fit_note');
  if (pick(raw, 'care')) p.care = pick(raw, 'care');

  const main = pick(raw, 'images', 'imgs', 'pictures', 'main_images') || [];
  const detail = pick(raw, 'detail_images', 'desc_images') || [];
  p.images = [...main, ...detail]
    .map((src) => (typeof src === 'string' ? src : src?.url))
    .filter(Boolean)
    .map((src) => ({
      original: /^https?:\/\//.test(src) ? src : path.resolve(rawDir, src),
      type: 'unknown',
      score: 0,
      order: null,
      publish: true,
    }));

  return p;
}
