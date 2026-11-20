/**
 * Generador de la web estática (sin dependencias). Lee data/products/*.json
 * con status approved|published y escribe dist/ listo para Cloudflare Pages.
 *
 * - local: copia data/media a dist/media (para probar en tu PC).
 * - R2 (MEDIA_FROM_R2=1): las fotos se sirven desde config.images.public_base_url.
 * También genera functions/_generated/catalog.js con los precios oficiales:
 * el checkout del servidor NUNCA se fía del precio que manda el navegador.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, PATHS } from '../lib/config.js';
import { ensureDir, listJson, readJson, writeJson, formatEur, nowIso } from '../lib/util.js';
import { validateProduct, publishableImages } from '../lib/schema.js';
import { layout } from './templates/layout.js';
import { homePage, categoryPage, productPage, cartPage, thanksPage, sizeGuidePage, imgUrl } from './templates/pages.js';
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

  const page = (opts) => layout({ config, ...opts });

  write('index.html', page({ body: homePage(products, config, mediaBase), canonical: '/' }));

  for (const cat of config.categories) {
    const items = products.filter((p) => p.category === cat.id);
    if (!items.length) continue;
    write(`c/${cat.id}/index.html`, page({ title: cat.name, body: categoryPage(cat, items, mediaBase), canonical: `/c/${cat.id}/` }));
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
    write(`p/${p.id}/index.html`, page({
      title: p.title,
      description: `${p.title}. ${p.composition}. ${formatEur(p.price_eur)}.`,
      body: productPage(p, config, mediaBase), canonical: `/p/${p.id}/`, jsonLd,
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
  const urls = ['/', ...config.categories.filter((c) => products.some((p) => p.category === c.id)).map((c) => `/c/${c.id}/`), ...products.map((p) => `/p/${p.id}/`)];
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
  Content-Security-Policy: default-src 'self'; img-src 'self' data:${mediaOrigin}; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'
/assets/*
  Cache-Control: public, max-age=86400
/media/*
  Cache-Control: public, max-age=31536000, immutable
`);

  // Catálogo de precios para el servidor (checkout) y para el cliente.
  const catalog = {};
  for (const p of products) {
    for (const v of p.variants) {
      if (v.stock === 'out_of_stock') continue;
      catalog[v.sku] = { product: p.id, title: `${p.title} · ${[v.color, v.size].filter(Boolean).join(' / ')}`, price: v.price_eur ?? p.price_eur, stock: v.stock };
    }
  }
  ensureDir(PATHS.generated);
  writeFileSync(path.join(PATHS.generated, 'catalog.js'),
    `// GENERADO por src/site/build.js — no editar a mano.\nexport const CATALOG = ${JSON.stringify(catalog, null, 2)};\nexport const SHIPPING = ${JSON.stringify(config.shipping, null, 2)};\nexport const STORE = ${JSON.stringify({ name: config.store.name, url: config.store.url }, null, 2)};\n`);

  log(`Web generada en dist/: ${products.length} productos, ${urls.length} URLs (fotos: ${local ? 'locales' : mediaBase})`);
  return { products: products.length };
}
