/**
 * Servidor local para probar dist/ en el PC: sirve los estáticos y simula
 * /api/checkout con la misma lógica que la Pages Function (sin Stripe real:
 * el pago con tarjeta redirige directamente a /gracias/).
 *   npm run build && npm run preview   →  http://localhost:8788
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PATHS } from '../lib/config.js';
import { validateCustomer, priceOrder, newOrderId } from '../server/orders.js';

const PORT = Number(process.env.PORT || 8788);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

async function handleCheckout(req, res) {
  const { CATALOG, SHIPPING } = await import(`../server/_generated/catalog.js?t=${Date.now()}`);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
  try {
    const body = JSON.parse(raw);
    const errors = validateCustomer(body.customer);
    if (errors.length) return send(400, { error: errors.join('. ') });
    const priced = priceOrder(body.items, body.method, CATALOG, SHIPPING);
    const id = newOrderId();
    console.log(`[preview] pedido ${id} (${body.method}) total ${priced.total} €`);
    return send(200, { ok: true, order: id, redirect: body.method === 'cod' ? `/gracias/?cod=1&pedido=${id}` : `/gracias/?pedido=${id}` });
  } catch (e) { return send(400, { error: e.message }); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/checkout' && req.method === 'POST') return handleCheckout(req, res);
  let file = path.join(PATHS.dist, decodeURIComponent(url.pathname));
  if (!path.resolve(file).startsWith(PATHS.dist)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(path.join(PATHS.dist, '404.html')).catch(() => 'No encontrado'));
  }
}).listen(PORT, () => console.log(`Tienda en http://localhost:${PORT}`));
