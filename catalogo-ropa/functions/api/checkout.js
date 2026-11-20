/**
 * POST /api/checkout  (Cloudflare Pages Function)
 * body: { method: 'card'|'cod', customer: {...}, items: [{ sku, qty }] }
 * - card → crea una Stripe Checkout Session y devuelve su URL (la tarjeta nunca pasa por aquí).
 * - cod  → guarda el pedido como pending_confirmation y avisa por Telegram.
 * Variables: STRIPE_SECRET_KEY, (opc.) DB [D1], TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
import { CATALOG, SHIPPING } from '../../src/server/_generated/catalog.js';
import { validateCustomer, priceOrder, newOrderId, saveOrder, notify, json } from '../../src/server/orders.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Petición no válida' }, 400); }

  const customer = body.customer || {};
  if (customer.website) return json({ error: 'Petición no válida' }, 400); // honeypot anti-bots
  const errors = validateCustomer(customer);
  if (errors.length) return json({ error: errors.join('. ') }, 400);

  let priced;
  try { priced = priceOrder(body.items, body.method, CATALOG, SHIPPING); } catch (e) { return json({ error: e.message }, 400); }

  const origin = new URL(request.url).origin;
  const order = {
    id: newOrderId(), created_at: new Date().toISOString(), method: body.method,
    customer: Object.fromEntries(['name', 'email', 'phone', 'address', 'postal_code', 'city'].map((k) => [k, String(customer[k]).trim()])),
    ...priced,
  };

  if (body.method === 'cod') {
    order.status = 'pending_confirmation';
    await saveOrder(env, order);
    await notify(env, order);
    return json({ ok: true, order: order.id, redirect: `/gracias/?cod=1&pedido=${order.id}` });
  }

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Pago con tarjeta no configurado' }, 503);

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('locale', 'es');
  form.set('customer_email', order.customer.email);
  form.set('client_reference_id', order.id);
  form.set('success_url', `${origin}/gracias/?pedido=${order.id}`);
  form.set('cancel_url', `${origin}/carrito/`);
  form.set('metadata[order_id]', order.id);
  priced.lines.forEach((l, i) => {
    form.set(`line_items[${i}][quantity]`, String(l.qty));
    form.set(`line_items[${i}][price_data][currency]`, 'eur');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(l.unit * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, l.title);
  });
  if (priced.shipping > 0) {
    form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    form.set('shipping_options[0][shipping_rate_data][display_name]', 'Envío estándar');
    form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(Math.round(priced.shipping * 100)));
    form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': order.id },
    body: form,
  });
  const session = await res.json();
  if (!res.ok) return json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' }, 502);

  order.status = 'awaiting_payment';
  order.stripe_session = session.id;
  await saveOrder(env, order);
  return json({ ok: true, order: order.id, redirect: session.url });
}

export function onRequest() {
  return json({ error: 'Método no permitido' }, 405);
}
