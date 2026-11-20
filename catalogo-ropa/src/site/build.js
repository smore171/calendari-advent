/**
 * Generador de la web estática (sin dependencias). Lee data/products/*.json
 * con status approved|published y escribe dist/ listo para Cloudflare Pages.
 *
 * - local: copia data/media a dist/media (para probar en tu PC).
 * - R2 (MEDIA_FROM_R2=1): las fotos se sirven desde config.images.public_base_url.
 * También genera src/server/_generated/catalog.js con los precios oficiales:
 * el checkout del servidor NUNCA se fía del precio que manda el navegador.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, PATHS } from '../lib/config.js';
import { ensureDir, listJson, readJson, writeJson, formatEur, nowIso } from '../lib/util.js';
import { validateProduct, publishableImages } from '../lib/schema.js';
import { layout } from './templates/layout.js';
import { homePage, catalogPage, promoBanner, productPage, cartPage, thanksPage, sizeGuidePage, imgUrl, discountPct } from './templates/pages.js';
import { markdownToHtml, fillPlaceholders } from './markdown.js';

function write(rel, html) {
  const file = path.join(PATHS.dist, rel);
  ensureDir(path.dirname(file));
  writeFileSync(file, html);
}

export async function buildSite({ local = true, log = console.log } = {}) {
  const config = loadConfig();
  const mediaBase = local ? '/media' : config.images.public_base_url.replace(/\/$/, '');

  const products = [];
  for (const file of listJson(PATHS.products)) {
    const p = readJson(file);
    if (!['approved', 'published'].includes(p.status)) continue;
    const { errors } = validateProduct(p, { categories: config.categories, forPublish: true });
    if (errors.length) { log(`  omitido ${p.id}: ${errors.join('; ')}`); continue; }
    if (p.status === 'approved') { p.status = 'published'; p.review = { ...p.review, published_at: nowIso() }; writeJson(file, p); }
    products.push(p);
  }

  rmSync(PATHS.dist, { recursive: true, force: true });
  ensureDir(PATHS.dist);
  cpSync(PATHS.assets, path.join(PATHS.dist, 'assets'), { recursive: true });
  if (local && existsSync(PATHS.media)) {
    // Solo los WebP publicados (no los originales).
    cpSync(PATHS.media, path.join(PATHS.dist, 'media'), { recursive: true, filter: (src) => !/orig-/.test(path.basename(src)) });
  }

  const groupOf = (catId) => config.categories.find((c) => c.id === catId)?.group || '';
  const ctx = { groupOf, newDays: config.promotions?.new_days ?? 30 };
  const counts = {};
  for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
  const page = (opts) => layout({ config, counts, ...opts });
  const catalog = (opts) => catalogPage({ allProducts: products, config, mediaBase, ctx, ...opts });
  const newest = [...products].sort((a, b) => Date.parse(b.source?.imported_at || 0) - Date.parse(a.source?.imported_at || 0));

  write('index.html', page({ body: homePage(products, config, mediaBase, ctx), canonical: '/' }));
  write('tienda/index.html', page({ title: 'Tienda', body: catalog({ title: 'Toda la tienda', products: newest }), canonical: '/tienda/' }));
  write('novedades/index.html', page({ title: 'Novedades', body: catalog({ title: 'Novedades', intro: 'Lo último que hemos añadido.', products: newest.slice(0, 48), active: { special: 'new' } }), canonical: '/novedades/' }));
  const onSale = products.filter((p) => discountPct(p)).sort((a, b) => discountPct(b) - discountPct(a));
  write('promociones/index.html', page({ title: 'Promociones', body: catalog({ title: 'Promociones', products: onSale, active: { special: 'sale' }, banner: promoBanner(config) }), canonical: '/promociones/' }));

  for (const g of config.category_groups) {
    const items = newest.filter((p) => groupOf(p.category) === g.id);
    if (!items.length) continue;
    write(`g/${g.id}/index.html`, page({ title: g.name, body: catalog({ title: g.name, products: items, active: { group: g.id } }), canonical: `/g/${g.id}/` }));
  }
  for (const cat of config.categories) {
    const items = newest.filter((p) => p.category === cat.id);
    if (!items.length) continue;
    write(`c/${cat.id}/index.html`, page({ title: cat.name, body: catalog({ title: cat.name, products: items, active: { group: cat.group, cat: cat.id } }), canonical: `/c/${cat.id}/` }));
  }

  for (const p of products) {
    const imgs = publishableImages(p);
    const jsonLd = {
      '@context': 'https://schema.org', '@type': 'Product', name: p.title,
      image: imgs.slice(0, 3).map((i) => (local ? config.store.url : '') + imgUrl(i, 'zoom', mediaBase)),
      material: p.composition, sku: p.variants[0]?.sku,
      brand: { '@type': 'Brand', name: config.store.name },
      offers: { '@type': 'Offer', priceCurrency: 'EUR', price: p.price_eur, availability: 'https://schema.org/InStock', url: `${config.store.url}/p/${p.id}/` },
    };
    const related = [
      ...products.filter((r) => r.id !== p.id && r.category === p.category),
      ...products.filter((r) => r.id !== p.id && r.category !== p.category && groupOf(r.category) === groupOf(p.category)),
    ].slice(0, 4);
    write(`p/${p.id}/index.html`, page({
      title: p.title,
      description: `${p.title}. ${p.composition}. ${formatEur(p.price_eur)}.`,
      body: productPage(p, config, mediaBase, ctx, related), canonical: `/p/${p.id}/`, jsonLd,
    }));
  }

  write('carrito/index.html', page({ title: 'Carrito', body: cartPage(config), noindex: true }));
  write('gracias/index.html', page({ title: 'Pedido recibido', body: thanksPage(), noindex: true }));
  write('guia-de-tallas/index.html', page({ title: 'Guía de tallas', body: sizeGuidePage(), canonical: '/guia-de-tallas/' }));
  write('404.html', page({ title: 'Página no encontrada', body: '<section class="hero small"><h1>Esta página no existe</h1><p><a class="btn" href="/">Volver a la tienda</a></p></section>', noindex: true }));

  const vars = {
    ...config.store, ...config.legal,
    cod_fee: formatEur(config.shipping.cod_fee_eur),
    shipping_standard: formatEur(config.shipping.standard_eur),
    free_from: formatEur(config.shipping.free_from_eur),
  };
  for (const f of readdirSync(PATHS.legal).filter((f) => f.endsWith('.md'))) {
    const slug = f.replace(/\.md$/, '');
    const md = fillPlaceholders(readFileSync(path.join(PATHS.legal, f), 'utf8'), vars);
    const title = md.match(/^#\s+(.*)/m)?.[1] || slug;
    write(`legal/${slug}/index.html`, page({ title, body: `<article class="legal">${markdownToHtml(md)}</article>`, canonical: `/legal/${slug}/` }));
  }

  // SEO
  const urls = ['/', '/tienda/', '/novedades/', '/promociones/', ...config.category_groups.filter((g) => products.some((p) => groupOf(p.category) === g.id)).map((g) => `/g/${g.id}/`), ...config.categories.filter((c) => counts[c.id]).map((c) => `/c/${c.id}/`), ...products.map((p) => `/p/${p.id}/`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.store.url}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nDisallow: /carrito/\nDisallow: /gracias/\nSitemap: ${config.store.url}/sitemap.xml\n`);

  // Cabeceras de seguridad para Cloudflare Pages.
  const mediaOrigin = local ? '' : ` ${new URL(config.images.public_base_url).origin}`;
  write('_headers', `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:${mediaOrigin}; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'
/assets/*
  Cache-Control: public, max-age=86400
/media/*
  Cache-Control: public, max-age=31536000, immutable
`);

  // Catálogo de precios para el servidor (checkout) y para el cliente.
  const priceCatalog = {};
  for (const p of products) {
    for (const v of p.variants) {
      if (v.stock === 'out_of_stock') continue;
      priceCatalog[v.sku] = { product: p.id, title: `${p.title} · ${[v.color, v.size].filter(Boolean).join(' / ')}`, price: v.price_eur ?? p.price_eur, stock: v.stock };
    }
  }
  ensureDir(PATHS.generated);
  writeFileSync(path.join(PATHS.generated, 'catalog.js'),
    `// GENERADO por src/site/build.js — no editar a mano.\nexport const CATALOG = ${JSON.stringify(priceCatalog, null, 2)};\nexport const SHIPPING = ${JSON.stringify(config.shipping, null, 2)};\nexport const STORE = ${JSON.stringify({ name: config.store.name, url: config.store.url }, null, 2)};\n`);

  log(`Web generada en dist/: ${products.length} productos, ${urls.length} URLs (fotos: ${local ? 'locales' : mediaBase})`);
  return { products: products.length };
}
