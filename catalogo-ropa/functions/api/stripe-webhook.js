/**
 * POST /api/stripe-webhook — Stripe avisa de pagos completados.
 * Configúralo en Stripe → Developers → Webhooks con el evento checkout.session.completed.
 * Variables: STRIPE_WEBHOOK_SECRET, (opc.) DB, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
import { verifyStripeSignature, json, notify } from '../../src/server/orders.js';

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'firma no válida' }, 400);

  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const orderId = s.metadata?.order_id || s.client_reference_id;
    if (env.DB && orderId) {
      await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?2 WHERE id = ?1").bind(orderId, new Date().toISOString()).run();
      const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(orderId).first();
      if (row) {
        await notify(env, { id: row.id, method: 'card', total: row.total, lines: JSON.parse(row.lines_json), customer: JSON.parse(row.customer_json) });
      }
    }
  }
  return json({ received: true });
}
