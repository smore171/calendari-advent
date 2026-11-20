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

test('tienda: descuento, tallas ordenadas y novedades', async () => {
  const { discountPct, sortSizes, isNew } = await import('../src/site/templates/pages.js');
  assert.equal(discountPct({ price_eur: 75, compare_at_eur: 100 }), 25);
  assert.equal(discountPct({ price_eur: 75, compare_at_eur: null }), 0);
  assert.deepEqual(sortSizes(['XL', 'S', 'M', 'ÚNICA']), ['S', 'M', 'XL', 'ÚNICA']);
  assert.deepEqual(sortSizes(['34', '28', '30']), ['28', '30', '34']);
  const now = Date.parse('2026-11-20T00:00:00Z');
  assert.equal(isNew({ source: { imported_at: '2026-11-10T00:00:00Z' } }, 30, now), true);
  assert.equal(isNew({ source: { imported_at: '2026-09-01T00:00:00Z' } }, 30, now), false);
});

test('glosario: categorías con prioridad correcta', () => {
  assert.equal(guessCategory('连帽 卫衣 加绒'), 'sudaderas');
  assert.equal(guessCategory('棒球 帽 纯棉'), 'gorras');
  assert.equal(guessCategory('POLO衫 针织 短袖'), 'polos');
  assert.equal(guessCategory('直筒 牛仔裤'), 'vaqueros');
  assert.equal(guessCategory('工装 短裤'), 'bermudas');
  assert.equal(provisionalTitle('羊毛 大衣 长款', 'chaquetas'), 'Abrigo de lana');
});

test('Yupoo: URL, listado, álbum y conversión a producto', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseYupooUrl, parseAlbumList, parseAlbum, albumToRaw, extractHints } = await import('../src/import/yupoo.js');
  const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

  assert.deepEqual(parseYupooUrl('https://demostore.x.yupoo.com/albums/123?uid=1'), { store: 'demostore', album: '123', category: null, origin: 'https://demostore.x.yupoo.com', kind: 'album' });
  assert.equal(parseYupooUrl('https://demostore.x.yupoo.com/categories/77').category, '77');
  assert.throws(() => parseYupooUrl('https://example.com/albums/1'));

  const list = parseAlbumList(fx('yupoo-list.html'), 'https://demostore.x.yupoo.com');
  assert.equal(list.albums.length, 2);
  assert.equal(list.maxPage, 3);

  const album = parseAlbum(fx('yupoo-album.html'), 'https://demostore.x.yupoo.com/albums/111111?uid=1');
  assert.equal(album.images.length, 3, 'portada repetida y logo excluidos');
  assert.ok(album.images.every((u) => u.startsWith('https://photo.yupoo.com/') && u.endsWith('/big.jpg')));
  assert.equal(album.price_cny, 89);
  assert.deepEqual(album.sizes, ['S', 'M', 'L', 'XL']);
  assert.deepEqual(album.colors.sort(), ['灰色', '米白', '黑色'].sort());

  const raw = albumToRaw(album, 'demostore');
  const p = rawToProduct(raw, { config: { pricing } });
  assert.equal(p.source.platform, 'yupoo');
  assert.equal(p.source.referer, 'https://demostore.x.yupoo.com/');
  assert.equal(p.category, 'sudaderas');
  assert.equal(p.composition, '100% algodón');
  assert.equal(p.variants.length, 12);
  assert.equal(p.price_eur, suggestPrice(89, pricing));

  assert.deepEqual(extractHints('size: M L XL').sizes, ['M', 'L', 'XL']);
  assert.equal(extractHints('sin precio').price_cny, null);
});

test('Shopify CSV: cabeceras, variantes, imágenes extra y escapado', async () => {
  const { productRows, toCsv, COLUMNS, csvCell } = await import('../src/export/shopify-csv.js');
  const config = { store: { name: 'Marca' }, pricing, images: { public_base_url: 'https://media.x.es/' },
    categories: [{ id: 'sudaderas', name: 'Sudaderas', group: 'ropa' }], category_groups: [{ id: 'ropa', name: 'Ropa' }] };
  const p = { ...emptyProduct(), id: 'sudadera-1', status: 'published', title: 'Sudadera "pesada"', category: 'sudaderas',
    price_eur: 49.95, compare_at_eur: 69.95, composition: '100% algodón', colors: ['Gris'], sizes: ['M', 'S'],
    source: { cost_cny: 89 },
    variants: [{ sku: 'A-M', color: 'Gris', size: 'M', stock: 'on_demand' }, { sku: 'A-S', color: 'Gris', size: 'S', stock: 'in_stock' }],
    images: [1, 2, 3].map((n) => ({ type: 'packshot', order: n, publish: true, files: { shopify: `sudadera-1/${n}-shopify.jpg` } })) };
  const rows = productRows(p, config);
  assert.equal(rows.length, 3, '2 variantes + 1 fila solo de imagen');
  assert.equal(rows[0]['Option1 name'], 'Color');
  assert.equal(rows[0]['Option2 name'], 'Talla');
  assert.deepEqual(rows.slice(0, 2).map((r) => r['Option2 value']), ['S', 'M'], 'tallas ordenadas');
  assert.equal(rows[0]['Product image URL'], 'https://media.x.es/sudadera-1/1-shopify.jpg');
  assert.equal(rows[2]['Image position'], 3);
  assert.equal(rows[2].SKU, '');
  assert.equal(rows[0]['Inventory tracker'], 'shopify');
  assert.equal(rows[1]['Inventory tracker'], '');
  assert.equal(rows[0].Status, 'active');
  assert.match(rows[0].Tags, /Oferta/);
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  const csv = toCsv(rows);
  assert.ok(csv.startsWith('﻿Title,URL handle,Description'));
  assert.equal(csv.trim().split('\r\n').length, 4);
  assert.equal(COLUMNS.length, new Set(COLUMNS).size);
});

test('Sourcebase: filtro de marcas, variantes y conversión', async () => {
  const { brandReason, splitVariantTitle, sourcebaseToRaw } = await import('../src/import/from-sourcebase.js');
  assert.match(brandReason('凯乐石冲锋衣 三标齐全', null), /réplica|marca/);
  assert.match(brandReason('Nike Tech Fleece hoodie', null), /nike/i);
  assert.match(brandReason('卫衣 纯棉', () => ({ brand: 'Stussy' })), /Stussy/);
  assert.equal(brandReason('重磅纯棉卫衣 无logo 宽松', null), null);
  const opts = [{ name: '颜色', values: ['黑色', '灰色'] }, { name: '尺码', values: ['M', 'L', 'XL'] }];
  assert.deepEqual(splitVariantTitle('黑色;XL', opts), { color: '黑色', size: 'XL' });
  assert.deepEqual(splitVariantTitle('灰色 均码', []), { color: '灰色', size: 'Única' });
  const raw = sourcebaseToRaw({ id: 'wd_1_2', name: '纯棉卫衣', source_url: 'https://weidian.com/item.html?itemID=2', marketplace: 'Weidian',
    store_name: 'X', price_original: 89, image_source_urls: ['https://si.geilicdn.com/a.jpg'], options: opts,
    variants: [{ title: '黑色;M', price: 89, stock: 3 }, { title: '灰色;L', price: 95, stock: 0 }] });
  const p = rawToProduct(raw, { config: { pricing } });
  assert.equal(p.source.platform, 'weidian');
  assert.deepEqual(p.colors, ['Negro', 'Gris']);
  assert.equal(p.variants.find((v) => v.size === 'L').stock, 'out_of_stock');
  assert.ok(p.variants.find((v) => v.size === 'L').price_eur > p.price_eur);
});

test('proveedores: id estable, registro y resumen', async () => {
  const { supplierIdFor, touchSupplier, supplierStats } = await import('../src/lib/suppliers.js');
  assert.equal(supplierIdFor({ platform: 'yupoo', shop: 'Mi Tienda' }), 'yupoo-mi-tienda');
  assert.equal(supplierIdFor({ platform: 'weidian', store_id: '123' }), 'weidian-123');
  const p = rawToProduct({ url: 'https://weidian.com/item.html?itemID=9', title: '卫衣', shop: 'Tienda A', store_id: '555', price_cny: 50 }, { config: { pricing } });
  assert.equal(p.source.supplier_id, 'weidian-555');
  const reg = touchSupplier({}, p);
  assert.equal(reg['weidian-555'].name, 'Tienda A');
  const stats = supplierStats([p, { ...p, status: 'approved' }, { ...p, source: {} }], reg);
  assert.equal(stats[0].total, 2);
  assert.equal(stats[0].approved, 1);
  assert.equal(stats.find((s) => s.id === 'sin-proveedor').total, 1);
});
