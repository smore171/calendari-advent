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

  // Menú móvil
  $('[data-menu]')?.addEventListener('click', () => $('[data-nav]')?.classList.toggle('open'));

  // Página de gracias
  if (location.pathname.startsWith('/gracias')) {
    save([]);
    if (new URLSearchParams(location.search).get('cod')) {
      const msg = $('[data-thanks-msg]');
      if (msg) msg.textContent = 'Hemos recibido tu pedido contra reembolso. Te escribiremos por WhatsApp para confirmarlo antes de enviarlo.';
    }
  }

  // Filtro por talla en categorías
  $('[data-size-filter]')?.addEventListener('change', (ev) => {
    const size = ev.target.value;
    $$('.grid .card').forEach((card) => {
      card.hidden = size && !(card.dataset.sizes || '').split(',').includes(size);
    });
  });

  // Ficha de producto
  const product = $('[data-product]');
  if (product) {
    const variants = JSON.parse($('[data-variants]', product).textContent);
    const btn = $('[data-add-to-cart]', product);
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
      if (!items.length) { list.innerHTML = '<p class="muted">Tu carrito está vacío.</p>'; form.hidden = true; return; }
      list.innerHTML = items.map((i, idx) => `<div class="line">
        ${i.img ? `<img src="${i.img}" alt="" width="80" height="107">` : ''}
        <div><strong></strong><br><span class="muted"></span>${i.stock === 'on_demand' ? '<br><small class="muted">Bajo pedido</small>' : ''}</div>
        <div class="qty"><button data-dec="${idx}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button data-inc="${idx}" aria-label="Añadir uno">+</button></div>
        <div>${eur(i.price * i.qty)}</div></div>`).join('');
      // Texto con textContent para evitar inyección desde localStorage.
      $$('.line', list).forEach((el, idx) => { $('strong', el).textContent = items[idx].title; $('.muted', el).textContent = items[idx].variant; });
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
