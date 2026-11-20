import { escapeHtml as e } from '../../lib/util.js';

export function layout({ config, title, description = '', body, canonical = '', jsonLd = null, noindex = false }) {
  const s = config.store;
  const fullTitle = title ? `${title} · ${s.name}` : `${s.name} · ${s.tagline}`;
  const cats = config.categories.map((c) => `<a href="/c/${c.id}/">${e(c.name)}</a>`).join('');
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
<link rel="stylesheet" href="/assets/styles.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<div class="topbar">Envío gratis desde ${config.shipping.free_from_eur} € · ${config.shipping.cod_enabled ? 'Pago con tarjeta o contra reembolso' : 'Pago seguro con tarjeta'} · Devoluciones ${config.legal.withdrawal_days} días</div>
<header class="site-header">
  <button class="menu-btn" aria-label="Menú" data-menu>☰</button>
  <a class="logo" href="/">${e(s.name)}</a>
  <nav class="cats" data-nav>${cats}</nav>
  <a class="cart-link" href="/carrito/">Carrito (<span data-cart-count>0</span>)</a>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="footer-cols">
    <div><strong>${e(s.name)}</strong><p>${e(s.tagline)}</p></div>
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
  <p class="payments">Pago seguro: Visa · Mastercard · Apple Pay · Google Pay${config.shipping.cod_enabled ? ' · Contra reembolso' : ''}</p>
  <p class="copy">© ${new Date().getFullYear()} ${e(config.legal.owner_name)}</p>
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
}
