import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPrice, roundPsychological, landedCost } from '../src/lib/pricing.js';
import { validateProduct, emptyProduct, makeSku } from '../src/lib/schema.js';
import { translateComposition, translateSizeChart, provisionalTitle, guessCategory } from '../src/import/glossary.js';
import { rawToProduct } from '../src/import/from-raw.js';
import { orderImages, markDuplicates } from '../src/images/order.js';
import { classify } from '../src/images/providers/heuristic.js';
import { priceOrder, validateCustomer, verifyStripeSignature } from '../src/server/orders.js';
import { markdownToHtml } from '../src/site/markdown.js';
import { createHmac } from 'node:crypto';

const pricing = { cny_to_eur: 0.13, shipping_per_unit_eur: 3.5, import_duty_rate: 0.12, import_vat_rate: 0.21, multiplier: 2.6, min_price_eur: 14.95, round_to: [0.95, 0.99] };

test('precio: coste puesto y redondeo psicológico', () => {
  assert.equal(+landedCost(100, pricing).toFixed(2), 22.36);
  assert.equal(roundPsychological(57.2), 57.95);
  assert.equal(roundPsychological(57.96), 57.99);
  assert.equal(suggestPrice(100, pricing), 58.95);
  assert.equal(suggestPrice(5, pricing), 14.95); // mínimo
  assert.equal(suggestPrice(null, pricing), null);
});

test('glosario: composición, medidas, título y categoría', () => {
  assert.equal(translateComposition('70%羊毛 30%聚酯纤维'), '70% lana, 30% poliéster');
  assert.equal(translateComposition('棉95% 氨纶5%'), '95% algodón, 5% elastano');
  assert.deepEqual(translateSizeChart({ m: { 胸围: '112cm', 衣长: 70 } }), { M: { pecho: 112, largo: 70 } });
  assert.equal(guessCategory('重磅 纯棉 卫衣'), 'sudaderas');
  assert.equal(provisionalTitle('重磅 纯棉 卫衣 宽松', 'sudaderas'), 'Sudadera oversize gruesa de algodón');
});

test('importador: crudo → borrador con variantes, SKU únicos y precio', () => {
  const raw = { url: 'https://weidian.com/item.html?itemID=1', title: '羊毛 夹克', price_cny: 168,
    images: ['https://x/a.jpg', 'https://x/b.jpg'], skus: [{ color: '黑色', size: 'm' }, { color: '黑色', size: 'M' }, { color: '驼色', size: 'L' }],
    attributes: { 面料: '70%羊毛 30%聚酯纤维' } };
  const p = rawToProduct(raw, { config: { pricing } });
  assert.equal(p.status, 'draft');
  assert.equal(p.category, 'chaquetas');
  assert.match(p.id, /^chaqueta-de-lana-[0-9a-f]{4}$/);
  assert.equal(p.variants.length, 2, 'M duplicada eliminada');
  assert.deepEqual(p.colors, ['Negro', 'Camel']);
  assert.equal(p.composition, '70% lana, 30% poliéster');
  assert.equal(p.images.length, 2);
  // Reimportar la misma URL da el mismo id
  assert.equal(rawToProduct(raw, { config: { pricing } }).id, p.id);
});

test('validación: no se aprueba sin composición, precio o fotos', () => {
  const p = { ...emptyProduct(), id: 'test-1', title: 'Camisa', category: 'camisas', status: 'approved', variants: [{ sku: 'A' }] };
  const { errors } = validateProduct(p, { categories: [{ id: 'camisas' }] });
  assert.ok(errors.some((e) => e.includes('precio')));
  assert.ok(errors.some((e) => e.includes('composición')));
  assert.ok(errors.some((e) => e.includes('foto')));
  p.price_eur = 29.95; p.composition = '100% algodón';
  p.images = [{ type: 'packshot', order: 1, publish: true }];
  assert.deepEqual(validateProduct(p, { categories: [{ id: 'camisas' }] }).errors, []);
});

test('SKU legible', () => {
  assert.equal(makeSku('chaqueta-corta-de-lana-e5c8', 'Negro', 'XL'), 'CHACORDE-NEGR-XL');
});

test('orden de fotos: packshot portada, tablas y descartes fuera', () => {
  const imgs = [
    { type: 'model', score: 0.8 }, { type: 'discard', score: 0.9 }, { type: 'size_chart', score: 0.7 },
    { type: 'detail', score: 0.5 }, { type: 'packshot', score: 0.6 }, { type: 'packshot', score: 0.9 }, { type: 'mannequin', score: 0.7 },
  ];
  const out = orderImages(imgs);
  const published = out.filter((i) => i.publish).sort((a, b) => a.order - b.order).map((i) => `${i.type}:${i.score}`);
  assert.deepEqual(published, ['packshot:0.9', 'packshot:0.6', 'mannequin:0.7', 'model:0.8', 'detail:0.5']);
  assert.equal(out.filter((i) => !i.publish).length, 2);
  assert.equal(orderImages(imgs, { maxPublished: 2 }).filter((i) => i.publish).length, 2);
});

test('duplicados: misma foto = duplicada; mismo encuadre otro color = variante', () => {
  const ham = (a, b) => (a === b ? 0 : 64);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = markDuplicates([
    { type: 'packshot', hash: 'aa', color: [20, 20, 20], width: 800, height: 800 },
    { type: 'packshot', hash: 'aa', color: [22, 21, 20], width: 1200, height: 1200 },
    { type: 'packshot', hash: 'aa', color: [176, 138, 91], width: 1200, height: 1200 },
  ], ham, 6, dist);
  assert.equal(out[0].type, 'discard', 'la de menor resolución se descarta');
  assert.equal(out[1].type, 'packshot');
  assert.equal(out[2].type, 'packshot', 'otro color no es duplicado');
});

test('heurístico: banner, tabla de tallas y packshot', () => {
  const base = { width: 1000, height: 1333, aspect: 1.333, saturation: 0.05, skinRatio: 0, skinCenterRatio: 0, edgeDensity: 0.01, brightRatio: 0.7 };
  assert.equal(classify({ ...base, aspect: 3.2 }).type, 'discard');
  assert.equal(classify({ ...base, width: 300, height: 400 }).type, 'discard');
  assert.equal(classify({ ...base, saturation: 0.01, edgeDensity: 0.1, brightRatio: 0.62, borderSd: 18, borderMean: 246, centerMean: 229, centerSd: 25 }).type, 'size_chart');
  const ps = classify({ ...base, borderSd: 0, borderMean: 240, centerMean: 84, centerSd: 90 });
  assert.equal(ps.type, 'packshot');
  assert.ok(ps.score >= 0.6);
});

test('checkout: el servidor recalcula precios y aplica reglas', () => {
  const catalog = { A: { title: 'Chaqueta', price: 89.95, stock: 'on_demand' }, B: { title: 'Camiseta', price: 19.95, stock: 'in_stock' } };
  const shipping = { free_from_eur: 60, standard_eur: 4.95, cod_fee_eur: 2.5, cod_enabled: true, cod_max_order_eur: 300 };
  const card = priceOrder([{ sku: 'B', qty: 2, price: 0.01 }], 'card', catalog, shipping);
  assert.equal(card.subtotal, 39.9); assert.equal(card.shipping, 4.95); assert.equal(card.total, 44.85);
  const cod = priceOrder([{ sku: 'A', qty: 1 }], 'cod', catalog, shipping);
  assert.equal(cod.shipping, 0); assert.equal(cod.cod_fee, 2.5); assert.equal(cod.total, 92.45);
  assert.throws(() => priceOrder([{ sku: 'A', qty: 4 }], 'cod', catalog, shipping), /hasta 300/);
  assert.throws(() => priceOrder([{ sku: 'X', qty: 1 }], 'card', catalog, shipping), /no disponible/);
  assert.throws(() => priceOrder([{ sku: 'A', qty: 0 }], 'card', catalog, shipping), /Cantidad/);
  assert.throws(() => priceOrder([], 'card', catalog, shipping), /vacío/);
});

test('checkout: validación de cliente español', () => {
  const ok = { name: 'Ana', email: 'a@b.es', phone: '+34 612 345 678', address: 'C/ Mayor 1', postal_code: '08240', city: 'Manresa' };
  assert.deepEqual(validateCustomer(ok), []);
  assert.ok(validateCustomer({ ...ok, postal_code: '99999' }).length);
  assert.ok(validateCustomer({ ...ok, phone: '12345' }).length);
  assert.ok(validateCustomer({ ...ok, email: 'x' }).length);
});

test('webhook de Stripe: firma válida, manipulada y caducada', async () => {
  const secret = 'whsec_test'; const payload = '{"type":"checkout.session.completed"}'; const t = 1_700_000_000;
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 10), true);
  assert.equal(await verifyStripeSignature(payload + ' ', `t=${t},v1=${sig}`, secret, 300, t + 10), false);
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 1000), false);
});

test('markdown legal: escapa HTML y renderiza tablas/listas', () => {
  const html = markdownToHtml('# Título\n\n- **uno**\n- dos\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>x</script>');
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<li><strong>uno<\/strong><\/li>/);
  assert.match(html, /<td>2<\/td>/);
  assert.ok(!html.includes('<script>'));
});
