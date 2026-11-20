import { escapeHtml as e, formatEur } from '../../lib/util.js';
import { publishableImages } from '../../lib/schema.js';

export function imgUrl(img, size, mediaBase) {
  return img?.files?.[size] ? `${mediaBase}/${img.files[size]}` : '';
}

export function productCard(p, mediaBase) {
  const imgs = publishableImages(p);
  const cover = imgs[0];
  const hover = imgs.find((i) => i.order === 2);
  return `<a class="card" href="/p/${p.id}/">
  <div class="card-media">
    ${cover ? `<img src="${imgUrl(cover, 'card', mediaBase)}" alt="${e(p.title)}" loading="lazy" width="900" height="1200">` : '<div class="noimg"></div>'}
    ${hover ? `<img class="hover" src="${imgUrl(hover, 'card', mediaBase)}" alt="" loading="lazy" width="900" height="1200">` : ''}
  </div>
  <div class="card-info"><span class="card-title">${e(p.title)}</span>
  <span class="price">${p.compare_at_eur ? `<s>${formatEur(p.compare_at_eur)}</s> ` : ''}${formatEur(p.price_eur)}</span></div>
</a>`;
}

export function homePage(products, config, mediaBase) {
  const cats = config.categories.filter((c) => products.some((p) => p.category === c.id));
  return `<section class="hero"><h1>${e(config.store.tagline)}</h1>
  <p>Prendas seleccionadas una a una. Composición y medidas reales en cada ficha.</p></section>
  <nav class="chips">${cats.map((c) => `<a href="/c/${c.id}/">${e(c.name)}</a>`).join('')}</nav>
  <section class="grid">${products.map((p) => productCard(p, mediaBase)).join('')}</section>`;
}

export function categoryPage(cat, products, mediaBase) {
  const sizes = [...new Set(products.flatMap((p) => p.sizes))];
  return `<h1 class="page-title">${e(cat.name)}</h1>
  <div class="filters" data-filters>
    <span>${products.length} artículos</span>
    ${sizes.length ? `<select data-size-filter aria-label="Filtrar por talla"><option value="">Todas las tallas</option>${sizes.map((s) => `<option>${e(s)}</option>`).join('')}</select>` : ''}
  </div>
  <section class="grid">${products.map((p) => productCard(p, mediaBase).replace('<a class="card"', `<a class="card" data-sizes="${e(p.sizes.join(','))}"`)).join('')}</section>`;
}

function sizeChartTable(chart) {
  const sizes = Object.keys(chart || {});
  if (!sizes.length) return '';
  const cols = [...new Set(sizes.flatMap((s) => Object.keys(chart[s])))];
  return `<table class="size-table"><thead><tr><th>Talla</th>${cols.map((c) => `<th>${e(c)}</th>`).join('')}</tr></thead>
  <tbody>${sizes.map((s) => `<tr><td>${e(s)}</td>${cols.map((c) => `<td>${chart[s][c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <p class="muted">Medidas de la prenda en cm, tomadas en plano. Pueden variar ±2 cm.</p>`;
}

export function productPage(p, config, mediaBase) {
  const imgs = publishableImages(p);
  const variants = p.variants.filter((v) => v.stock !== 'out_of_stock');
  const variantData = JSON.stringify(variants.map((v) => ({ sku: v.sku, color: v.color, size: v.size, stock: v.stock, price: v.price_eur ?? p.price_eur })));
  const onDemand = variants.every((v) => v.stock === 'on_demand');
  return `<article class="product" data-product="${e(p.id)}">
  <div class="gallery">
    ${imgs.map((img, i) => `<figure><img src="${imgUrl(img, 'zoom', mediaBase)}" srcset="${imgUrl(img, 'card', mediaBase)} 900w, ${imgUrl(img, 'zoom', mediaBase)} 1600w" sizes="(min-width: 900px) 50vw, 100vw" alt="${e(p.title)} – foto ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="1600" height="2133"></figure>`).join('')}
  </div>
  <div class="buybox">
    <h1>${e(p.title)}</h1>
    <p class="price big">${p.compare_at_eur ? `<s>${formatEur(p.compare_at_eur)}</s> ` : ''}${formatEur(p.price_eur)} <small>IVA incluido</small></p>
    ${p.colors.length > 1 ? `<fieldset class="opts"><legend>Color</legend>${p.colors.map((c, i) => `<label><input type="radio" name="color" value="${e(c)}" ${i ? '' : 'checked'}><span>${e(c)}</span></label>`).join('')}</fieldset>` : `<input type="hidden" name="color" value="${e(p.colors[0] || '')}">`}
    <fieldset class="opts"><legend>Talla</legend>${p.sizes.map((s) => `<label><input type="radio" name="size" value="${e(s)}"><span>${e(s)}</span></label>`).join('')}</fieldset>
    ${p.fit_note ? `<p class="fit">${e(p.fit_note)}</p>` : ''}
    <button class="btn" data-add-to-cart data-title="${e(p.title)}" data-img="${imgUrl(imgs[0], 'thumb', mediaBase)}">Añadir al carrito</button>
    <script type="application/json" data-variants>${variantData.replace(/</g, '\\u003c')}</script>
    <p class="muted">${onDemand ? 'Se prepara bajo pedido: entrega estimada en el carrito.' : 'En stock · envío en 24/48 h.'}</p>
    <details open><summary>Composición y cuidados</summary><p>${e(p.composition)}</p>${p.care ? `<p>${e(p.care)}</p>` : ''}</details>
    <details><summary>Medidas</summary>${sizeChartTable(p.size_chart_cm) || '<p>Consúltanos por WhatsApp y te damos las medidas exactas.</p>'}</details>
    <details><summary>Envíos y devoluciones</summary><p>Envío ${formatEur(config.shipping.standard_eur)}, gratis desde ${formatEur(config.shipping.free_from_eur)}. Tienes ${config.legal.withdrawal_days} días para devolverlo. <a href="/legal/envios-y-devoluciones/">Ver condiciones</a>.</p></details>
  </div>
</article>`;
}

export function cartPage(config) {
  const sh = config.shipping;
  return `<h1 class="page-title">Carrito</h1>
<div class="cart" data-cart data-free-from="${sh.free_from_eur}" data-shipping="${sh.standard_eur}" data-cod-fee="${sh.cod_fee_eur}" data-cod-max="${sh.cod_max_order_eur}">
  <div data-cart-items><p class="muted">Tu carrito está vacío.</p></div>
  <form class="checkout" data-checkout hidden>
    <h2>Datos de envío</h2>
    <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">

    <div class="row"><input name="name" placeholder="Nombre y apellidos" required autocomplete="name"></div>
    <div class="row"><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="phone" type="tel" placeholder="Teléfono" required autocomplete="tel"></div>
    <div class="row"><input name="address" placeholder="Dirección" required autocomplete="street-address"></div>
    <div class="row"><input name="postal_code" placeholder="Código postal" required pattern="\\d{5}" inputmode="numeric" autocomplete="postal-code"><input name="city" placeholder="Ciudad" required autocomplete="address-level2"></div>
    <h2>Pago</h2>
    <label class="pay"><input type="radio" name="method" value="card" checked> Tarjeta, Apple Pay o Google Pay (pago seguro con Stripe)</label>
    ${sh.cod_enabled ? `<label class="pay" data-cod-option><input type="radio" name="method" value="cod"> Contra reembolso (+${formatEur(sh.cod_fee_eur)}) · te confirmamos el pedido por WhatsApp</label>` : ''}
    <label class="accept"><input type="checkbox" required> He leído y acepto las <a href="/legal/condiciones-de-venta/" target="_blank">condiciones de venta</a> y la <a href="/legal/privacidad/" target="_blank">política de privacidad</a>.</label>
    <div class="totals" data-totals></div>
    <button class="btn" type="submit">Finalizar pedido</button>
    <p class="error" data-error hidden></p>
  </form>
</div>`;
}

export function thanksPage() {
  return `<section class="hero small"><h1>¡Gracias por tu pedido!</h1>
  <p data-thanks-msg>Te hemos enviado la confirmación por email.</p>
  <p><a class="btn" href="/">Seguir comprando</a></p></section>`;
}

export function sizeGuidePage() {
  return `<article class="legal"><h1>Guía de tallas</h1>
  <p>Cada ficha incluye una tabla con las <strong>medidas reales de la prenda</strong> en centímetros, tomadas en plano. Es la forma más fiable de acertar:</p>
  <ol><li>Coge una prenda tuya que te quede bien y del mismo tipo.</li>
  <li>Extiéndela en plano y mide pecho (de axila a axila × 2), largo y manga.</li>
  <li>Compara con la tabla de la ficha y elige la talla más cercana.</li></ol>
  <p>¿Dudas? Escríbenos por WhatsApp con tu altura y peso y te recomendamos talla.</p></article>`;
}
