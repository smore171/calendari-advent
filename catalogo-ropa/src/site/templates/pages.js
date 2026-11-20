import { escapeHtml as e, formatEur } from '../../lib/util.js';
import { publishableImages } from '../../lib/schema.js';
import { colorHex } from '../colors.js';

export function imgUrl(img, size, mediaBase) {
  return img?.files?.[size] ? `${mediaBase}/${img.files[size]}` : '';
}

export function discountPct(p) {
  return p.compare_at_eur > p.price_eur ? Math.round((1 - p.price_eur / p.compare_at_eur) * 100) : 0;
}

export function isNew(p, days = 30, now = Date.now()) {
  const t = Date.parse(p.source?.imported_at || '');
  return Number.isFinite(t) && now - t < days * 86400000;
}

function priceHtml(p) {
  const pct = discountPct(p);
  return pct
    ? `<span class="price sale">${formatEur(p.price_eur)}</span> <s class="was">${formatEur(p.compare_at_eur)}</s>`
    : `<span class="price">${formatEur(p.price_eur)}</span>`;
}

export function productCard(p, mediaBase, ctx = {}) {
  const imgs = publishableImages(p);
  const cover = imgs[0];
  const hover = imgs.find((i) => i.order === 2);
  const pct = discountPct(p);
  const fresh = isNew(p, ctx.newDays);
  const date = Date.parse(p.source?.imported_at || '') || 0;
  return `<a class="card" href="/p/${p.id}/"
    data-cat="${e(p.category)}" data-group="${e(ctx.groupOf?.(p.category) || '')}" data-sizes="${e(p.sizes.join('|'))}" data-colors="${e(p.colors.join('|'))}"
    data-price="${p.price_eur}" data-sale="${pct ? 1 : 0}" data-new="${fresh ? 1 : 0}" data-date="${date}" data-title="${e(p.title.toLowerCase())}">
  <div class="card-media">
    ${cover ? `<img src="${imgUrl(cover, 'card', mediaBase)}" alt="${e(p.title)}" loading="lazy" width="900" height="1200">` : '<div class="noimg"></div>'}
    ${hover ? `<img class="hover" src="${imgUrl(hover, 'card', mediaBase)}" alt="" loading="lazy" width="900" height="1200">` : ''}
    <div class="badges">${pct ? `<span class="badge-sale">-${pct}%</span>` : ''}${fresh ? '<span class="badge-new">Nuevo</span>' : ''}</div>
    <span class="quick">Ver producto</span>
  </div>
  <div class="card-info">
    <span class="card-title">${e(p.title)}</span>
    <span class="card-price">${priceHtml(p)}</span>
    ${p.colors.length > 1 ? `<span class="swatches">${p.colors.slice(0, 5).map((c) => `<i style="--c:${colorHex(c)}" title="${e(c)}"></i>`).join('')}${p.colors.length > 5 ? `<small>+${p.colors.length - 5}</small>` : ''}</span>` : ''}
  </div>
</a>`;
}

function countdown(endsAt) {
  return endsAt ? `<div class="countdown" data-countdown="${e(endsAt)}" aria-label="Tiempo restante">
    <span><b data-d>0</b>días</span><span><b data-h>00</b>horas</span><span><b data-m>00</b>min</span><span><b data-s>00</b>seg</span></div>` : '';
}

/* ---------- INICIO ---------- */
export function homePage(products, config, mediaBase, ctx) {
  const promo = config.promotions?.enabled ? config.promotions : null;
  const byDate = [...products].sort((a, b) => Date.parse(b.source?.imported_at || 0) - Date.parse(a.source?.imported_at || 0));
  const sale = products.filter((p) => discountPct(p)).sort((a, b) => discountPct(b) - discountPct(a));
  const heroImgs = (sale.length >= 3 ? sale : byDate).slice(0, 3).map((p) => ({ p, img: publishableImages(p)[0] })).filter((x) => x.img);

  const catTiles = config.categories
    .map((c) => ({ c, items: products.filter((p) => p.category === c.id) }))
    .filter((x) => x.items.length)
    .slice(0, 8);

  const groupTiles = config.category_groups
    .map((g) => ({ g, items: products.filter((p) => ctx.groupOf(p.category) === g.id) }))
    .filter((x) => x.items.length);

  return `
<section class="hero">
  <div class="hero-text">
    ${promo ? `<span class="eyebrow">${e(promo.hero.eyebrow)}</span>` : ''}
    <h1>${e(promo ? promo.hero.title : config.store.tagline)}</h1>
    <p>${e(promo ? promo.hero.subtitle : 'Prendas seleccionadas una a una. Composición y medidas reales en cada ficha.')}</p>
    <div class="hero-ctas">
      <a class="btn" href="${promo ? '/promociones/' : '/tienda/'}">${e(promo ? promo.hero.cta : 'Ver la tienda')}</a>
      <a class="btn btn-ghost" href="/novedades/">Novedades</a>
    </div>
    ${promo ? countdown(promo.hero.ends_at) : ''}
  </div>
  <div class="hero-collage">
    ${heroImgs.map(({ p, img }, i) => `<a href="/p/${p.id}/" class="hc hc-${i}"><img src="${imgUrl(img, i === 0 ? 'zoom' : 'card', mediaBase)}" alt="${e(p.title)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>${discountPct(p) ? `<span class="badge-sale">-${discountPct(p)}%</span>` : ''}</a>`).join('')}
  </div>
</section>

<section class="groups">
  ${groupTiles.map(({ g, items }) => {
    const img = publishableImages(items[0])[0];
    return `<a class="group-tile" href="/g/${g.id}/"><img src="${imgUrl(img, 'card', mediaBase)}" alt="" loading="lazy"><span>${e(g.name)}<small>${items.length} artículos</small></span></a>`;
  }).join('')}
</section>

<section class="section">
  <div class="section-head"><h2>Comprar por categoría</h2><a href="/tienda/">Ver todo →</a></div>
  <div class="cat-tiles">
    ${catTiles.map(({ c, items }) => {
      const img = publishableImages(items[0])[0];
      return `<a class="cat-tile" href="/c/${c.id}/"><div><img src="${imgUrl(img, 'thumb', mediaBase)}" alt="" loading="lazy"></div><span>${e(c.name)}</span></a>`;
    }).join('')}
  </div>
</section>

${promo ? `<section class="promo-band">
  <div>
    <span class="eyebrow">${e(promo.hero.eyebrow)}</span>
    <h2>-20% extra en todo</h2>
    <p>Usa el código en el carrito. Acumulable con los precios rebajados.</p>
  </div>
  <button class="code" data-copy="${e(promo.code)}">${e(promo.code)} <small>Copiar</small></button>
  ${countdown(promo.hero.ends_at)}
</section>` : ''}

<section class="section">
  <div class="section-head"><h2>Novedades</h2><a href="/novedades/">Ver todo →</a></div>
  <div class="grid">${byDate.slice(0, 8).map((p) => productCard(p, mediaBase, ctx)).join('')}</div>
</section>

${sale.length ? `<section class="section">
  <div class="section-head"><h2>Ofertas</h2><a href="/promociones/">Ver todas →</a></div>
  <div class="grid">${sale.slice(0, 4).map((p) => productCard(p, mediaBase, ctx)).join('')}</div>
</section>` : ''}`;
}

/* ---------- CATÁLOGO (tienda, grupo, categoría, novedades, promociones) ---------- */
export function catalogPage({ title, intro = '', products, allProducts, config, mediaBase, ctx, active = {}, banner = '' }) {
  const countBy = (fn) => allProducts.filter(fn).length;
  const sizes = sortSizes([...new Set(products.flatMap((p) => p.sizes))]);
  const colors = [...new Set(products.flatMap((p) => p.colors))];
  const prices = products.map((p) => p.price_eur);
  const min = Math.floor(Math.min(...prices, 0)); const max = Math.ceil(Math.max(...prices, 0));
  const crumbs = [['/', 'Inicio'], ['/tienda/', 'Tienda']];
  if (active.group) crumbs.push([`/g/${active.group}/`, config.category_groups.find((g) => g.id === active.group)?.name]);
  if (active.cat) crumbs.push([`/c/${active.cat}/`, title]);

  const tree = config.category_groups.map((g) => {
    const cats = config.categories.filter((c) => c.group === g.id && countBy((p) => p.category === c.id));
    if (!cats.length) return '';
    const open = active.group === g.id || !active.group;
    return `<details class="tree-group" ${open ? 'open' : ''}>
      <summary><a href="/g/${g.id}/" class="${active.group === g.id && !active.cat ? 'on' : ''}">${e(g.name)}</a><span>${countBy((p) => ctx.groupOf(p.category) === g.id)}</span></summary>
      ${cats.map((c) => `<a href="/c/${c.id}/" class="${active.cat === c.id ? 'on' : ''}">${e(c.name)}<span>${countBy((p) => p.category === c.id)}</span></a>`).join('')}
    </details>`;
  }).join('');

  return `
<nav class="crumbs" aria-label="Ruta">${crumbs.map(([h, t], i) => (i < crumbs.length - 1 ? `<a href="${h}">${e(t)}</a>` : `<span>${e(t)}</span>`)).join('<i>/</i>')}</nav>
${banner}
<div class="catalog" data-catalog>
  <aside class="sidebar" data-sidebar aria-label="Categorías y filtros">
    <div class="sidebar-head"><strong>Filtrar</strong><button class="icon-btn" data-close-sidebar aria-label="Cerrar">✕</button></div>
    <div class="side-block">
      <h3>Categorías</h3>
      <a class="tree-all ${!active.group && !active.cat && !active.special ? 'on' : ''}" href="/tienda/">Todo<span>${allProducts.length}</span></a>
      <a class="tree-all ${active.special === 'new' ? 'on' : ''}" href="/novedades/">Novedades</a>
      <a class="tree-all promo ${active.special === 'sale' ? 'on' : ''}" href="/promociones/">Promociones<span>${countBy((p) => discountPct(p))}</span></a>
      ${tree}
    </div>
    <div class="side-block">
      <h3>Buscar</h3>
      <input type="search" data-f-q placeholder="Ej: lana, oversize…" aria-label="Buscar">
    </div>
    ${sizes.length ? `<div class="side-block"><h3>Talla</h3><div class="chips-f">${sizes.map((s) => `<label><input type="checkbox" data-f-size value="${e(s)}"><span>${e(s)}</span></label>`).join('')}</div></div>` : ''}
    ${colors.length ? `<div class="side-block"><h3>Color</h3><div class="colors-f">${colors.map((c) => `<label title="${e(c)}"><input type="checkbox" data-f-color value="${e(c)}"><i style="--c:${colorHex(c)}"></i><span>${e(c)}</span></label>`).join('')}</div></div>` : ''}
    <div class="side-block"><h3>Precio</h3>
      <div class="price-f"><input type="number" data-f-min min="${min}" max="${max}" placeholder="${min} €" aria-label="Precio mínimo"><span>—</span><input type="number" data-f-max min="${min}" max="${max}" placeholder="${max} €" aria-label="Precio máximo"></div>
    </div>
    <div class="side-block">
      <label class="toggle"><input type="checkbox" data-f-sale ${active.special === 'sale' ? 'checked' : ''}> Solo ofertas</label>
      <label class="toggle"><input type="checkbox" data-f-new> Solo novedades</label>
    </div>
    <button class="btn btn-ghost" data-f-reset>Borrar filtros</button>
    <button class="btn show-results" data-close-sidebar>Ver resultados</button>
  </aside>
  <div class="catalog-main">
    <div class="catalog-head">
      <div><h1>${e(title)}</h1>${intro ? `<p class="muted">${e(intro)}</p>` : ''}</div>
    </div>
    <div class="toolbar">
      <button class="btn-filter" data-open-sidebar>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="1.8"/></svg> Filtrar
      </button>
      <span class="muted"><b data-count>${products.length}</b> artículos</span>
      <div class="active-filters" data-active-filters></div>
      <select data-sort aria-label="Ordenar">
        <option value="relevance">Destacados</option>
        <option value="new">Novedades</option>
        <option value="price-asc">Precio: menor a mayor</option>
        <option value="price-desc">Precio: mayor a menor</option>
        <option value="discount">Mayor descuento</option>
      </select>
    </div>
    <div class="grid" data-grid>${products.map((p) => productCard(p, mediaBase, ctx)).join('')}</div>
    <p class="empty" data-empty hidden>No hay artículos con estos filtros. <button class="link" data-f-reset>Borrar filtros</button></p>
  </div>
</div>`;
}

export function promoBanner(config) {
  const promo = config.promotions;
  if (!promo?.enabled) return '';
  return `<section class="promo-band compact">
    <div><span class="eyebrow">${e(promo.hero.eyebrow)}</span><h2>${e(promo.hero.title)}</h2><p>Código <b>${e(promo.code)}</b>: -20% extra en el carrito.</p></div>
    <button class="code" data-copy="${e(promo.code)}">${e(promo.code)} <small>Copiar</small></button>
    ${countdown(promo.hero.ends_at)}
  </section>`;
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'ÚNICA', 'UNICA'];
export function sortSizes(sizes) {
  return sizes.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase()); const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return Number(a) - Number(b) || a.localeCompare(b);
  });
}

/* ---------- FICHA ---------- */
function sizeChartTable(chart) {
  const sizes = Object.keys(chart || {});
  if (!sizes.length) return '';
  const cols = [...new Set(sizes.flatMap((s) => Object.keys(chart[s])))];
  return `<table class="size-table"><thead><tr><th>Talla</th>${cols.map((c) => `<th>${e(c)}</th>`).join('')}</tr></thead>
  <tbody>${sortSizes(sizes).map((s) => `<tr><td>${e(s)}</td>${cols.map((c) => `<td>${chart[s][c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <p class="muted">Medidas de la prenda en cm, tomadas en plano. Pueden variar ±2 cm.</p>`;
}

export function productPage(p, config, mediaBase, ctx, related = []) {
  const imgs = publishableImages(p);
  const variants = p.variants.filter((v) => v.stock !== 'out_of_stock');
  const variantData = JSON.stringify(variants.map((v) => ({ sku: v.sku, color: v.color, size: v.size, stock: v.stock, price: v.price_eur ?? p.price_eur })));
  const onDemand = variants.every((v) => v.stock === 'on_demand');
  const cat = config.categories.find((c) => c.id === p.category);
  const group = config.category_groups.find((g) => g.id === cat?.group);
  const pct = discountPct(p);
  return `<nav class="crumbs" aria-label="Ruta"><a href="/">Inicio</a><i>/</i>${group ? `<a href="/g/${group.id}/">${e(group.name)}</a><i>/</i>` : ''}${cat ? `<a href="/c/${cat.id}/">${e(cat.name)}</a><i>/</i>` : ''}<span>${e(p.title)}</span></nav>
<article class="product" data-product="${e(p.id)}">
  <div class="gallery">
    ${imgs.map((img, i) => `<figure><img src="${imgUrl(img, 'zoom', mediaBase)}" srcset="${imgUrl(img, 'card', mediaBase)} 900w, ${imgUrl(img, 'zoom', mediaBase)} 1600w" sizes="(min-width: 900px) 30vw, 88vw" alt="${e(p.title)} – foto ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="1600" height="2133"></figure>`).join('')}
  </div>
  <div class="buybox">
    <div class="badges static">${pct ? `<span class="badge-sale">-${pct}%</span>` : ''}${isNew(p, ctx.newDays) ? '<span class="badge-new">Nuevo</span>' : ''}</div>
    <h1>${e(p.title)}</h1>
    <p class="price-big">${priceHtml(p)} <small>IVA incluido</small></p>
    ${pct && config.promotions?.enabled ? `<p class="promo-note">Con el código <b>${e(config.promotions.code)}</b>: -20% extra en el carrito.</p>` : ''}
    ${p.colors.length > 1 ? `<fieldset class="opts colors"><legend>Color: <b data-color-label>${e(p.colors[0])}</b></legend>${p.colors.map((c, i) => `<label title="${e(c)}"><input type="radio" name="color" value="${e(c)}" ${i ? '' : 'checked'}><i style="--c:${colorHex(c)}"></i></label>`).join('')}</fieldset>` : `<input type="hidden" name="color" value="${e(p.colors[0] || '')}">`}
    <fieldset class="opts"><legend>Talla <a href="#medidas" class="size-link">Guía de tallas</a></legend>${sortSizes([...p.sizes]).map((s) => `<label><input type="radio" name="size" value="${e(s)}"><span>${e(s)}</span></label>`).join('')}</fieldset>
    ${p.fit_note ? `<p class="fit">${e(p.fit_note)}</p>` : ''}
    <button class="btn" data-add-to-cart data-title="${e(p.title)}" data-img="${imgUrl(imgs[0], 'thumb', mediaBase)}">Añadir al carrito</button>
    <script type="application/json" data-variants>${variantData.replace(/</g, '\\u003c')}</script>
    <ul class="perks">
      <li>${onDemand ? 'Se prepara bajo pedido: plazo en el carrito' : 'En stock · envío en 24/48 h'}</li>
      <li>Envío gratis desde ${formatEur(config.shipping.free_from_eur)}</li>
      <li>${config.legal.withdrawal_days} días para devoluciones</li>
      ${config.shipping.cod_enabled ? '<li>Pago contra reembolso disponible</li>' : ''}
    </ul>
    <details open><summary>Composición y cuidados</summary><p>${e(p.composition)}</p>${p.care ? `<p>${e(p.care)}</p>` : ''}</details>
    <details id="medidas"><summary>Medidas</summary>${sizeChartTable(p.size_chart_cm) || '<p>Consúltanos por WhatsApp y te damos las medidas exactas.</p>'}</details>
    <details><summary>Envíos y devoluciones</summary><p>Envío ${formatEur(config.shipping.standard_eur)}, gratis desde ${formatEur(config.shipping.free_from_eur)}. Tienes ${config.legal.withdrawal_days} días para devolverlo. <a href="/legal/envios-y-devoluciones/">Ver condiciones</a>.</p></details>
  </div>
</article>
${related.length ? `<section class="section"><div class="section-head"><h2>También te puede gustar</h2></div><div class="grid">${related.map((r) => productCard(r, mediaBase, ctx)).join('')}</div></section>` : ''}`;
}

/* ---------- CARRITO / OTRAS ---------- */
export function cartPage(config) {
  const sh = config.shipping;
  return `<h1 class="page-title">Carrito</h1>
<div class="cart" data-cart data-free-from="${sh.free_from_eur}" data-shipping="${sh.standard_eur}" data-cod-fee="${sh.cod_fee_eur}" data-cod-max="${sh.cod_max_order_eur}">
  <div class="free-progress" data-free-progress></div>
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
  return `<section class="hero-simple"><h1>¡Gracias por tu pedido!</h1>
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
