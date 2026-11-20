/**
 * Panel de revisión local (sin dependencias):  npm run admin  →  http://localhost:4321
 * Lista de productos con errores/avisos, edición rápida (título, precio,
 * categoría, composición, medidas), orden y tipo de fotos, aprobar en lote.
 * Solo escucha en 127.0.0.1: no lo expongas a internet.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, PATHS } from '../lib/config.js';
import { readJson, writeJson, listJson, nowIso } from '../lib/util.js';
import { validateProduct, publishableImages, makeSku, STATUSES, IMAGE_TYPES, STOCK_MODES } from '../lib/schema.js';
import { marginReport } from '../lib/pricing.js';

const PORT = Number(process.env.ADMIN_PORT || 4321);
const config = loadConfig();
const fileOf = (id) => path.join(PATHS.products, `${id}.json`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function summary(p) {
  const v = validateProduct(p, { categories: config.categories, forPublish: true });
  const cover = publishableImages(p)[0];
  return {
    id: p.id, title: p.title, status: p.status, category: p.category, price_eur: p.price_eur,
    cover: cover?.files?.thumb ? `/media/${cover.files.thumb}` : (cover?.local ? `/${cover.local}` : null),
    cover_type: cover?.type || null, images: publishableImages(p).length,
    errors: v.errors, warnings: v.warnings,
    margin: p.source?.cost_cny && p.price_eur ? marginReport(p.price_eur, p.source.cost_cny, config.pricing) : null,
  };
}

const EDITABLE = ['title', 'category', 'price_eur', 'compare_at_eur', 'composition', 'care', 'fit_note', 'size_chart_cm', 'variants', 'tags', 'review'];

async function readBody(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 2e6) throw new Error('cuerpo demasiado grande'); }
  return JSON.parse(raw || '{}');
}

const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'products', id?, action?]
  if (parts[1] === 'meta') return send(res, 200, { categories: config.categories, statuses: STATUSES, imageTypes: IMAGE_TYPES });
  if (parts[1] !== 'products') return send(res, 404, { error: 'no existe' });

  if (!parts[2]) {
    if (req.method === 'GET') return send(res, 200, listJson(PATHS.products).map(readJson).map(summary));
    if (req.method === 'POST') { // acciones en lote
      const { ids = [], action, value } = await readBody(req);
      const results = [];
      for (const id of ids) {
        const p = readJson(fileOf(id));
        if (action === 'approve') {
          const { errors } = validateProduct(p, { categories: config.categories, forPublish: true });
          if (errors.length) { results.push({ id, ok: false, errors }); continue; }
          p.status = 'approved'; p.review = { ...p.review, approved_at: nowIso() };
        } else if (action === 'status' && STATUSES.includes(value)) p.status = value;
        else if (action === 'category') p.category = value;
        else if (action === 'multiply_price') p.price_eur = Math.round(p.price_eur * Number(value) * 100) / 100;
        writeJson(fileOf(id), p);
        results.push({ id, ok: true });
      }
      return send(res, 200, results);
    }
  }

  const id = parts[2];
  if (!/^[a-z0-9-]+$/.test(id)) return send(res, 400, { error: 'id no válido' });
  const p = readJson(fileOf(id));

  if (req.method === 'GET') return send(res, 200, { product: p, ...summary(p) });

  if (req.method === 'PUT') {
    const patch = await readBody(req);
    for (const k of EDITABLE) if (k in patch) p[k] = patch[k];
    // Colores/tallas editados → se regeneran las variantes (conserva stock y precio de las que ya existían).
    if (Array.isArray(patch.colors) || Array.isArray(patch.sizes) || STOCK_MODES.includes(patch.stock)) {
      const clean = (arr, fallback) => [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 30).length
        ? [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 30) : fallback;
      const colors = clean(patch.colors ?? p.colors, ['Único']);
      const sizes = clean(patch.sizes ?? p.sizes, ['Única']).map((x) => x.toUpperCase());
      const old = new Map(p.variants.map((v) => [`${v.color}|${v.size}`, v]));
      p.colors = colors; p.sizes = sizes;
      p.variants = colors.flatMap((c) => sizes.map((sz) => {
        const prev = old.get(`${c}|${sz}`);
        return { sku: prev?.sku || makeSku(p.id, c, sz), color: c, size: sz,
          stock: STOCK_MODES.includes(patch.stock) ? patch.stock : (prev?.stock || 'on_demand'), price_eur: prev?.price_eur ?? null };
      }));
    }
    if (Array.isArray(patch.images)) {
      // El panel manda [{ index, type, publish }] en el orden deseado.
      const reordered = patch.images.map((x, pos) => {
        const img = p.images[x.index];
        const publish = Boolean(x.publish) && !['discard', 'size_chart'].includes(x.type);
        return { ...img, type: IMAGE_TYPES.includes(x.type) ? x.type : img.type, publish, locked: true, order: null, _pos: pos };
      });
      let n = 0;
      p.images = reordered.map(({ _pos, ...img }) => ({ ...img, order: img.publish ? ++n : null }));
      const { ensureVariants } = await import('../images/process.js');
      await ensureVariants(p, config);
    }
    if (patch.status && STATUSES.includes(patch.status)) {
      if (patch.status === 'approved') {
        const { errors } = validateProduct(p, { categories: config.categories, forPublish: true });
        if (errors.length) return send(res, 422, { error: 'No se puede aprobar', errors });
        p.review = { ...p.review, approved_at: nowIso() };
      }
      p.status = patch.status;
    }
    writeJson(fileOf(id), p);
    return send(res, 200, { product: p, ...summary(p) });
  }
  return send(res, 405, { error: 'método no permitido' });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file;
    if (url.pathname.startsWith('/media/')) file = path.join(PATHS.media, decodeURIComponent(url.pathname.slice(7)));
    else if (url.pathname.startsWith('/data/')) file = path.join(PATHS.root, decodeURIComponent(url.pathname));
    else file = path.join(PATHS.root, 'src/admin/public', url.pathname === '/' ? 'index.html' : url.pathname);
    const allowed = [PATHS.media, path.join(PATHS.root, 'data'), path.join(PATHS.root, 'src/admin/public')];
    if (!allowed.some((dir) => path.resolve(file).startsWith(dir + path.sep))) { res.writeHead(403); return res.end(); }
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('No encontrado'); }
    send(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Panel en http://localhost:${PORT}`));
