/**
 * Esquema único de producto. Cada artículo del catálogo tiene esta forma;
 * solo cambian los datos. Ver schema/product.schema.json para la versión
 * documentada (JSON Schema) que puedes usar en VS Code.
 */
export const STATUSES = ['draft', 'approved', 'published', 'archived'];
export const IMAGE_TYPES = ['packshot', 'mannequin', 'model', 'detail', 'size_chart', 'discard', 'unknown'];
export const STOCK_MODES = ['in_stock', 'on_demand', 'out_of_stock'];

export function emptyProduct() {
  return {
    id: '',
    status: 'draft',
    source: { platform: '', url: '', shop: '', cost_cny: null, imported_at: '' },
    title: '',
    title_original: '',
    category: '',
    price_eur: null,
    compare_at_eur: null,
    composition: '',
    care: '',
    fit_note: '',
    colors: [],
    sizes: [],
    variants: [],
    size_chart_cm: {},
    images: [],
    tags: [],
    review: { notes: '', approved_at: null },
  };
}

/**
 * Devuelve { errors, warnings }.
 * - errors: impiden aprobar/publicar.
 * - warnings: se muestran en el panel pero no bloquean.
 */
export function validateProduct(p, { categories = [], forPublish = false } = {}) {
  const errors = [];
  const warnings = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };

  need(typeof p.id === 'string' && /^[a-z0-9-]+$/.test(p.id), 'id inválido (solo a-z, 0-9 y guiones)');
  need(STATUSES.includes(p.status), `status inválido: ${p.status}`);
  need(typeof p.title === 'string' && p.title.trim().length >= 3, 'falta título');
  need(Array.isArray(p.images), 'images debe ser una lista');
  need(Array.isArray(p.variants), 'variants debe ser una lista');

  if (categories.length) {
    need(categories.some((c) => c.id === p.category), `categoría desconocida: "${p.category}"`);
  }

  const ready = forPublish || p.status === 'approved' || p.status === 'published';
  if (ready) {
    need(Number.isFinite(p.price_eur) && p.price_eur > 0, 'falta precio de venta');
    // Obligatorio en la UE: composición de fibras (Reglamento UE 1007/2011).
    need(typeof p.composition === 'string' && /\d+\s*%/.test(p.composition), 'falta composición textil con porcentajes (obligatoria en la UE)');
    need(publishableImages(p).length >= 1, 'necesita al menos 1 foto publicable');
    need(p.variants.length >= 1, 'necesita al menos 1 variante (color/talla)');
  }

  const pub = publishableImages(p);
  warn(pub.length === 0 || pub[0].type === 'packshot', 'la portada no es una foto de producto en primer plano');
  warn(Object.keys(p.size_chart_cm || {}).length > 0, 'sin tabla de medidas en cm (más devoluciones por talla)');
  warn(!p.title || !/[一-鿿]/.test(p.title), 'el título contiene caracteres chinos');
  if (p.compare_at_eur != null) {
    warn(p.compare_at_eur > p.price_eur, 'compare_at_eur debe ser mayor que el precio');
  }

  for (const [i, v] of (p.variants || []).entries()) {
    if (!v.sku) errors.push(`variante ${i + 1}: falta sku`);
    if (v.stock && !STOCK_MODES.includes(v.stock)) errors.push(`variante ${i + 1}: stock inválido`);
  }
  const skus = (p.variants || []).map((v) => v.sku);
  if (new Set(skus).size !== skus.length) errors.push('SKUs duplicados');

  for (const [i, img] of (p.images || []).entries()) {
    if (!IMAGE_TYPES.includes(img.type)) errors.push(`foto ${i + 1}: tipo inválido "${img.type}"`);
  }

  return { errors, warnings };
}

export function publishableImages(p) {
  return (p.images || [])
    .filter((img) => !['discard', 'size_chart'].includes(img.type) && img.publish !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function makeSku(productId, color, size) {
  const part = (s) => String(s || 'U').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4) || 'U';
  const base = productId.split('-').slice(0, 3).map((w) => w.slice(0, 3)).join('').toUpperCase();
  return `${base}-${part(color)}-${part(size)}`;
}
