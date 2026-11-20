/**
 * Lógica de pedidos compartida por las Pages Functions (runtime de Workers:
 * solo Web APIs, sin Node). Testeable con node:test.
 */
export function round2(n) { return Math.round(n * 100) / 100; }

const PHONE_ES = /^(\+34|0034)?\s?[6789]\d{2}\s?\d{3}\s?\d{3}$/;
const POSTAL_ES = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCustomer(c = {}) {
  const errors = [];
  const req = (k, label) => { if (!String(c[k] || '').trim()) errors.push(`Falta ${label}`); };
  req('name', 'el nombre'); req('email', 'el email'); req('phone', 'el teléfono');
  req('address', 'la dirección'); req('postal_code', 'el código postal'); req('city', 'la ciudad');
  if (c.email && !EMAIL.test(c.email)) errors.push('Email no válido');
  if (c.phone && !PHONE_ES.test(String(c.phone).replace(/[\s-]/g, ''))) errors.push('Teléfono español no válido');
  if (c.postal_code && !POSTAL_ES.test(String(c.postal_code))) errors.push('Código postal no válido');
  for (const k of Object.keys(c)) if (String(c[k]).length > 200) errors.push(`Campo demasiado largo: ${k}`);
  return errors;
}

/** Recalcula todo en el servidor con el catálogo oficial. Nunca usa precios del cliente. */
export function priceOrder(items, method, catalog, shipping) {
  if (!Array.isArray(items) || !items.length) throw new Error('El carrito está vacío');
  if (items.length > 50) throw new Error('Demasiadas líneas');
  const lines = items.map(({ sku, qty }) => {
    const entry = catalog[sku];
    const q = Number(qty);
    if (!entry) throw new Error(`Producto no disponible: ${sku}`);
    if (!Number.isInteger(q) || q < 1 || q > 10) throw new Error('Cantidad no válida');
    return { sku, qty: q, title: entry.title, unit: entry.price, total: round2(entry.price * q), on_demand: entry.stock === 'on_demand' };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const shippingCost = subtotal >= shipping.free_from_eur ? 0 : shipping.standard_eur;
  let codFee = 0;
  if (method === 'cod') {
    if (!shipping.cod_enabled) throw new Error('Contra reembolso no disponible');
    if (subtotal > shipping.cod_max_order_eur) throw new Error(`Contra reembolso solo hasta ${shipping.cod_max_order_eur} €`);
    codFee = shipping.cod_fee_eur;
  } else if (method !== 'card') {
    throw new Error('Método de pago no válido');
  }
  return { lines, subtotal, shipping: shippingCost, cod_fee: codFee, total: round2(subtotal + shippingCost + codFee) };
}

export function newOrderId() {
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  return `P${d}-${rand.toUpperCase()}`;
}

export async function saveOrder(env, order) {
  if (!env.DB) return false; // Sin D1 configurado: se notifica igualmente.
  await env.DB.prepare(
    `INSERT INTO orders (id, created_at, status, method, customer_json, lines_json, subtotal, shipping, cod_fee, total, stripe_session)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, stripe_session = excluded.stripe_session`,
  ).bind(order.id, order.created_at, order.status, order.method, JSON.stringify(order.customer), JSON.stringify(order.lines),
    order.subtotal, order.shipping, order.cod_fee, order.total, order.stripe_session || null).run();
  return true;
}

/** Aviso de pedido nuevo a Telegram (opcional: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). */
export async function notify(env, order) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const c = order.customer || {};
  const text = [
    `🛍 Pedido ${order.id} · ${order.method === 'cod' ? 'CONTRA REEMBOLSO (confirmar por WhatsApp)' : 'PAGADO con tarjeta'}`,
    ...order.lines.map((l) => `• ${l.qty}× ${l.title} — ${l.total.toFixed(2)} €${l.on_demand ? ' (bajo pedido)' : ''}`),
    `Total: ${order.total.toFixed(2)} €`,
    `${c.name} · ${c.phone} · ${c.email}`,
    `${c.address}, ${c.postal_code} ${c.city}`,
  ].join('\n');
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  return true;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

/** Verificación de firma de webhooks de Stripe (esquema v1, HMAC-SHA256) con Web Crypto. */
export async function verifyStripeSignature(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
