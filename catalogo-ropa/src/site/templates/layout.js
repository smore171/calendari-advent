import { escapeHtml as e } from '../../lib/util.js';

/** Menú principal: grupos con desplegable de categorías (solo las que tienen productos). */
function navHtml(config, counts) {
  const groups = config.category_groups.map((g) => {
    const cats = config.categories.filter((c) => c.group === g.id && counts[c.id]);
    if (!cats.length) return '';
    return `<div class="nav-group">
      <a class="nav-top" href="/g/${g.id}/">${e(g.name)}</a>
      <div class="mega"><div class="mega-inner">
        <a class="mega-all" href="/g/${g.id}/">Ver todo ${e(g.name.toLowerCase())}</a>
        ${cats.map((c) => `<a href="/c/${c.id}/">${e(c.name)}</a>`).join('')}
      </div></div>
    </div>`;
  }).join('');
  return `<a class="nav-top" href="/novedades/">Novedades</a>${groups}
    ${config.promotions?.enabled ? '<a class="nav-top nav-promo" href="/promociones/">Promociones</a>' : ''}`;
}

export function layout({ config, counts = {}, title, description = '', body, canonical = '', jsonLd = null, noindex = false }) {
  const s = config.store;
  const promo = config.promotions?.enabled ? config.promotions : null;
  const fullTitle = title ? `${title} · ${s.name}` : `${s.name} · ${s.tagline}`;
  return `<!doctype html>
<html lang="${e(s.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(fullTitle)}</title>
<meta name="description" content="${e(description || s.tagline)}">
${canonical ? `<link rel="canonical" href="${e(s.url + canonical)}">` : ''}
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${e(fullTitle)}">
<meta property="og:description" content="${e(description || s.tagline)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#111111">
<link rel="stylesheet" href="/assets/styles.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<div class="topbar">${promo ? `<a href="/promociones/">${e(promo.topbar)}</a>` : `Envío gratis desde ${config.shipping.free_from_eur} €`}</div>
<header class="site-header">
  <button class="icon-btn menu-btn" aria-label="Abrir menú" data-menu>
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="1.6"/></svg>
  </button>
  <a class="logo" href="/">${e(s.name)}</a>
  <nav class="main-nav" data-nav aria-label="Principal">${navHtml(config, counts)}</nav>
  <div class="header-actions">
    <a class="icon-link" href="/tienda/" aria-label="Buscar en la tienda">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.6"/></svg>
    </a>
    <a class="icon-link cart-link" href="/carrito/" aria-label="Carrito">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>
      <span class="cart-count" data-cart-count>0</span>
    </a>
  </div>
</header>
<div class="drawer-backdrop" data-backdrop></div>
<main>${body}</main>
<section class="trust">
  <div><strong>Envío gratis</strong><span>desde ${config.shipping.free_from_eur} €</span></div>
  <div><strong>${config.legal.withdrawal_days} días</strong><span>para devoluciones</span></div>
  <div><strong>Pago seguro</strong><span>tarjeta, Apple Pay, Google Pay</span></div>
  ${config.shipping.cod_enabled ? '<div><strong>Contra reembolso</strong><span>paga al recibir</span></div>' : ''}
</section>
<footer class="site-footer">
  <div class="footer-cols">
    <div><span class="logo small">${e(s.name)}</span><p>${e(s.tagline)}</p></div>
    <div><strong>Tienda</strong>
      <a href="/novedades/">Novedades</a>
      ${config.category_groups.map((g) => `<a href="/g/${g.id}/">${e(g.name)}</a>`).join('')}
      <a href="/promociones/">Promociones</a>
    </div>
    <div><strong>Ayuda</strong>
      <a href="/legal/envios-y-devoluciones/">Envíos y devoluciones</a>
      <a href="/guia-de-tallas/">Guía de tallas</a>
      <a href="mailto:${e(s.email)}">${e(s.email)}</a>
      <a href="https://wa.me/${e(s.whatsapp.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>
    </div>
    <div><strong>Legal</strong>
      <a href="/legal/aviso-legal/">Aviso legal</a>
      <a href="/legal/condiciones-de-venta/">Condiciones de venta</a>
      <a href="/legal/privacidad/">Privacidad</a>
      <a href="/legal/cookies/">Cookies</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} ${e(config.legal.owner_name)}</span>
    <span class="pay-icons">VISA · MASTERCARD · APPLE PAY · GOOGLE PAY${config.shipping.cod_enabled ? ' · CONTRA REEMBOLSO' : ''}</span>
  </div>
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}
