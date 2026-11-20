// Tienda: carrito en localStorage, selector de variantes, filtros y checkout.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

  // localStorage puede fallar (modo privado, cuotas): el carrito sigue en memoria.
  let memoryCart = [];
  const load = () => { try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return memoryCart; } };
  const save = (c) => { memoryCart = c; try { localStorage.setItem('cart', JSON.stringify(c)); } catch {} renderCount(); };
  const renderCount = () => $$('[data-cart-count]').forEach((el) => { el.textContent = load().reduce((s, i) => s + i.qty, 0); });
  renderCount();

  // Cajones (menú móvil y filtros) con fondo oscuro
  const backdrop = $('[data-backdrop]');
  const openDrawer = (el) => { el?.classList.add('open'); backdrop?.classList.add('on'); document.body.classList.add('lock'); };
  const closeDrawers = () => { $$('.open[data-nav], .open[data-sidebar]').forEach((el) => el.classList.remove('open')); backdrop?.classList.remove('on'); document.body.classList.remove('lock'); };
  $('[data-menu]')?.addEventListener('click', () => openDrawer($('[data-nav]')));
  backdrop?.addEventListener('click', closeDrawers);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDrawers(); });

  // Cuenta atrás de promociones
  $$('[data-countdown]').forEach((el) => {
    const end = Date.parse(el.dataset.countdown);
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      if (!left) { el.hidden = true; return; }
      const s = Math.floor(left / 1000);
      $('[data-d]', el).textContent = Math.floor(s / 86400);
      $('[data-h]', el).textContent = pad(Math.floor(s / 3600) % 24);
      $('[data-m]', el).textContent = pad(Math.floor(s / 60) % 60);
      $('[data-s]', el).textContent = pad(s % 60);
    };
    tick(); setInterval(tick, 1000);
  });

  // Copiar código promocional
  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); } catch {}
    btn.classList.add('copied');
  }));

  // Catálogo: filtros + orden en el navegador (las páginas son estáticas)
  const catalog = $('[data-catalog]');
  if (catalog) {
    const grid = $('[data-grid]', catalog);
    const cards = $$('.card', grid);
    cards.forEach((c, i) => { c.dataset.idx = i; });
    const sidebar = $('[data-sidebar]', catalog);
    $('[data-open-sidebar]', catalog)?.addEventListener('click', () => openDrawer(sidebar));
    $$('[data-close-sidebar]', catalog).forEach((b) => b.addEventListener('click', closeDrawers));

    const read = () => ({
      q: ($('[data-f-q]', catalog)?.value || '').trim().toLowerCase(),
      sizes: $$('[data-f-size]:checked', catalog).map((i) => i.value),
      colors: $$('[data-f-color]:checked', catalog).map((i) => i.value),
      min: parseFloat($('[data-f-min]', catalog)?.value) || null,
      max: parseFloat($('[data-f-max]', catalog)?.value) || null,
      sale: $('[data-f-sale]', catalog)?.checked,
      fresh: $('[data-f-new]', catalog)?.checked,
      sort: $('[data-sort]', catalog)?.value || 'relevance',
    });
    const apply = () => {
      const f = read();
      let shown = 0;
      cards.forEach((c) => {
        const sizes = c.dataset.sizes.split('|'); const colors = c.dataset.colors.split('|'); const price = +c.dataset.price;
        const ok = (!f.q || c.dataset.title.includes(f.q))
          && (!f.sizes.length || f.sizes.some((s) => sizes.includes(s)))
          && (!f.colors.length || f.colors.some((s) => colors.includes(s)))
          && (f.min == null || price >= f.min) && (f.max == null || price <= f.max)
          && (!f.sale || c.dataset.sale === '1') && (!f.fresh || c.dataset.new === '1');
        c.hidden = !ok; if (ok) shown++;
      });
      const key = {
        relevance: (c) => +c.dataset.idx, new: (c) => -c.dataset.date, 'price-asc': (c) => +c.dataset.price,
        'price-desc': (c) => -c.dataset.price, discount: (c) => -(+c.dataset.sale) * 1e6 + +c.dataset.idx,
      }[f.sort];
      [...cards].sort((a, b) => key(a) - key(b)).forEach((c) => grid.appendChild(c));
      $('[data-count]', catalog).textContent = shown;
      $('[data-empty]', catalog).hidden = shown > 0;
      // Etiquetas de filtros activos
      const chips = [
        ...f.sizes.map((v) => ['size', v, `Talla ${v}`]), ...f.colors.map((v) => ['color', v, v]),
        ...(f.min != null ? [['min', '', `Desde ${f.min} €`]] : []), ...(f.max != null ? [['max', '', `Hasta ${f.max} €`]] : []),
        ...(f.sale ? [['sale', '', 'Ofertas']] : []), ...(f.fresh ? [['new', '', 'Novedades']] : []), ...(f.q ? [['q', '', `"${f.q}"`]] : []),
      ];
      const box = $('[data-active-filters]', catalog);
      box.innerHTML = '';
      chips.forEach(([type, value, label]) => {
        const b = document.createElement('button');
        b.textContent = label; b.dataset.type = type; b.dataset.value = value;
        box.appendChild(b);
      });
    };
    $('[data-active-filters]', catalog).addEventListener('click', (ev) => {
      const { type, value } = ev.target.dataset;
      if (!type) return;
      const sel = { size: `[data-f-size][value="${CSS.escape(value)}"]`, color: `[data-f-color][value="${CSS.escape(value)}"]`, sale: '[data-f-sale]', new: '[data-f-new]' }[type];
      if (sel) $(sel, catalog).checked = false;
      if (type === 'min') $('[data-f-min]', catalog).value = '';
      if (type === 'max') $('[data-f-max]', catalog).value = '';
      if (type === 'q') $('[data-f-q]', catalog).value = '';
      apply();
    });
    catalog.addEventListener('input', (ev) => { if (ev.target.closest('[data-sidebar], .toolbar')) apply(); });
    $$('[data-f-reset]', catalog).forEach((b) => b.addEventListener('click', () => {
      $$('[data-sidebar] input', catalog).forEach((i) => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
      apply();
    }));
    // ?talla=M&q=lana desde enlaces externos
    const params = new URLSearchParams(location.search);
    if (params.get('q')) $('[data-f-q]', catalog).value = params.get('q');
    if (params.get('talla')) $$('[data-f-size]', catalog).forEach((i) => { if (i.value === params.get('talla')) i.checked = true; });
    apply();
  }

  // Página de gracias
  if (location.pathname.startsWith('/gracias')) {
    save([]);
    if (new URLSearchParams(location.search).get('cod')) {
      const msg = $('[data-thanks-msg]');
      if (msg) msg.textContent = 'Hemos recibido tu pedido contra reembolso. Te escribiremos por WhatsApp para confirmarlo antes de enviarlo.';
    }
  }

  // Ficha de producto
  const product = $('[data-product]');
  if (product) {
    const variants = JSON.parse($('[data-variants]', product).textContent);
    const btn = $('[data-add-to-cart]', product);
    product.addEventListener('change', (ev) => {
      if (ev.target.name === 'color' && $('[data-color-label]', product)) $('[data-color-label]', product).textContent = ev.target.value;
    });
    btn.addEventListener('click', () => {
      const color = $('input[name=color]:checked', product)?.value ?? $('input[name=color]', product)?.value ?? '';
      const size = $('input[name=size]:checked', product)?.value;
      if (!size) { btn.textContent = 'Elige una talla'; setTimeout(() => { btn.textContent = 'Añadir al carrito'; }, 1500); return; }
      const v = variants.find((x) => x.size === size && (!color || x.color === color)) || variants.find((x) => x.size === size);
      if (!v) { btn.textContent = 'Combinación no disponible'; return; }
      const cart = load();
      const line = cart.find((i) => i.sku === v.sku);
      if (line) line.qty += 1; else cart.push({ sku: v.sku, qty: 1, title: btn.dataset.title, variant: [v.color, v.size].filter(Boolean).join(' / '), price: v.price, img: btn.dataset.img, stock: v.stock });
      save(cart);
      btn.textContent = '✓ Añadido';
      setTimeout(() => { btn.textContent = 'Añadir al carrito'; }, 1500);
    });
  }

  // Carrito y checkout
  const cartEl = $('[data-cart]');
  if (cartEl) {
    const form = $('[data-checkout]', cartEl);
    const cfg = { free: +cartEl.dataset.freeFrom, ship: +cartEl.dataset.shipping, cod: +cartEl.dataset.codFee, codMax: +cartEl.dataset.codMax };
    const totals = (method) => {
      const items = load();
      const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
      const shipping = sub >= cfg.free || !items.length ? 0 : cfg.ship;
      const cod = method === 'cod' ? cfg.cod : 0;
      return { sub, shipping, cod, total: sub + shipping + cod };
    };
    const render = () => {
      const items = load();
      const list = $('[data-cart-items]', cartEl);
      if (!items.length) { list.innerHTML = '<p class="muted">Tu carrito está vacío. <a href="/tienda/">Ir a la tienda</a></p>'; form.hidden = true; const pr = $('[data-free-progress]', cartEl); if (pr) pr.innerHTML = ''; return; }
      list.innerHTML = items.map((i, idx) => `<div class="line">
        ${i.img ? `<img src="${i.img}" alt="" width="80" height="107">` : ''}
        <div><strong></strong><br><span class="muted"></span>${i.stock === 'on_demand' ? '<br><small class="muted">Bajo pedido</small>' : ''}</div>
        <div class="qty"><button data-dec="${idx}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button data-inc="${idx}" aria-label="Añadir uno">+</button></div>
        <div>${eur(i.price * i.qty)}</div></div>`).join('');
      // Texto con textContent para evitar inyección desde localStorage.
      $$('.line', list).forEach((el, idx) => { $('strong', el).textContent = items[idx].title; $('.muted', el).textContent = items[idx].variant; });
      const prog = $('[data-free-progress]', cartEl);
      const sub0 = items.reduce((s, i) => s + i.price * i.qty, 0);
      if (prog) prog.innerHTML = sub0 >= cfg.free ? '<b>¡Tienes envío gratis!</b><div class="bar"><i style="width:100%"></i></div>'
        : `Te faltan <b>${eur(cfg.free - sub0)}</b> para el envío gratis<div class="bar"><i style="width:${Math.round(sub0 / cfg.free * 100)}%"></i></div>`;
      form.hidden = false;
      const method = $('input[name=method]:checked', form)?.value || 'card';
      const t = totals(method);
      const codOpt = $('[data-cod-option]', form);
      if (codOpt) {
        const tooBig = t.sub > cfg.codMax;
        codOpt.hidden = tooBig;
        if (tooBig && method === 'cod') $('input[value=card]', form).checked = true;
      }
      $('[data-totals]', form).innerHTML = `<div><span>Subtotal</span><span>${eur(t.sub)}</span></div>
        <div><span>Envío</span><span>${t.shipping ? eur(t.shipping) : 'Gratis'}</span></div>
        ${t.cod ? `<div><span>Contra reembolso</span><span>${eur(t.cod)}</span></div>` : ''}
        <div class="grand"><span>Total</span><span>${eur(t.total)}</span></div>`;
    };
    cartEl.addEventListener('click', (ev) => {
      const inc = ev.target.dataset.inc; const dec = ev.target.dataset.dec;
      if (inc == null && dec == null) return;
      const cart = load();
      const i = +(inc ?? dec);
      cart[i].qty += inc != null ? 1 : -1;
      save(cart.filter((x) => x.qty > 0));
      render();
    });
    form.addEventListener('change', render);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('[data-error]', form);
      const btn = $('button[type=submit]', form);
      err.hidden = true; btn.disabled = true; btn.textContent = 'Procesando…';
      const data = Object.fromEntries(new FormData(form));
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method: data.method, customer: data, items: load().map((i) => ({ sku: i.sku, qty: i.qty })) }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'No se pudo procesar el pedido');
        location.href = body.redirect;
      } catch (e) {
        err.textContent = e.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Finalizar pedido';
      }
    });
    render();
  }
})();
