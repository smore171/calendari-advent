/**
 * Importador de Yupoo (álbumes de fotos de proveedores).
 *
 *   npm run yupoo -- https://TIENDA.x.yupoo.com/albums/123456      un álbum
 *   npm run yupoo -- https://TIENDA.x.yupoo.com/albums               toda la tienda (paginada)
 *   npm run yupoo -- https://TIENDA.x.yupoo.com/categories/7890      una categoría
 *   opciones: --limit 50 (máx. álbumes)  --pages 5 (máx. páginas de listado)  --html archivo.html (offline)
 *
 * Genera data/raw/yupoo-<tienda>-<fecha>.json en el formato crudo común;
 * después: npm run import && npm run images -- --all
 *
 * Yupoo no tiene variantes ni precios estructurados: se extraen del título y
 * la descripción del álbum (¥/RMB, tallas, colores, composición) y lo que
 * falte se completa en el panel.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COLORS, FIBERS } from './glossary.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export function parseYupooUrl(input) {
  const url = new URL(input);
  const m = url.hostname.match(/^([^.]+)\.x\.yupoo\.com$/i);
  if (!m) throw new Error('No parece una URL de Yupoo (TIENDA.x.yupoo.com)');
  const store = m[1];
  const album = url.pathname.match(/\/albums\/(\d+)/)?.[1] || null;
  const category = url.pathname.match(/\/categories\/(\d+)/)?.[1] || null;
  return { store, album, category, origin: `https://${store}.x.yupoo.com`, kind: album ? 'album' : 'list' };
}

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();
const stripTags = (s) => decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '));

/** Enlaces a álbumes de una página de listado (tienda o categoría). */
export function parseAlbumList(html, origin) {
  const ids = new Set();
  for (const m of html.matchAll(/href="(?:https?:\/\/[^"/]+)?\/albums\/(\d+)[^"]*"/g)) ids.add(m[1]);
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => +m[1]);
  return { albums: [...ids].map((id) => `${origin}/albums/${id}?uid=1`), maxPage: Math.max(1, ...pages) };
}

/** Normaliza una URL de foto de Yupoo a la versión grande. */
export function normalizePhoto(src) {
  let u = decode(src).trim();
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\/photo\.yupoo\.com\//.test(u)) return null;
  // photo.yupoo.com/<tienda>/<hash>/<tamaño>.jpg  → big
  return u.replace(/\/(small|square|thumb|medium)\.(jpe?g|png|webp)(\?.*)?$/i, '/big.$2');
}

function photoKey(u) {
  return u.match(/photo\.yupoo\.com\/[^/]+\/([^/]+)\//)?.[1] || u;
}

/** Datos de un álbum: título, descripción, fotos y pistas de precio/tallas/colores/composición. */
export function parseAlbum(html, url) {
  const title = stripTags(
    html.match(/class="[^"]*showalbumheader__gallerytitle[^"]*"[^>]*>([\s\S]*?)<\//)?.[1]
    || html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
    || html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s*[|\-–]\s*(又拍图片管家|yupoo).*$/i, ''),
  );
  const description = stripTags(
    html.match(/class="[^"]*showalbumheader__gallerysubtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    || html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '',
  );

  // Fotos del álbum: atributos data-origin-src / data-src / src con photo.yupoo.com, sin duplicados.
  // Se excluye la portada de la cabecera si aparece repetida (misma clave).
  const seen = new Set(); const images = [];
  for (const m of html.matchAll(/(?:data-origin-src|data-src|src)="([^"]*photo\.yupoo\.com[^"]*)"/g)) {
    const u = normalizePhoto(m[1]);
    if (!u) continue;
    const k = photoKey(u);
    if (seen.has(k)) continue;
    seen.add(k); images.push(u);
  }

  const text = `${title}\n${description}`;
  return { url, title, description, images, ...extractHints(text) };
}

/** Pistas en texto libre (chino/inglés) que suelen poner los proveedores. */
export function extractHints(text) {
  const t = String(text);
  const priceM = t.match(/(?:¥|￥|RMB|CNY|价格|批发价|拿货价|P)\s*[:：]?\s*(\d{2,5}(?:\.\d+)?)/i)
    || t.match(/(\d{2,5})\s*(?:元|rmb|yuan)/i);
  const price = priceM ? Number(priceM[1]) : null;

  let sizes = [];
  const sizeLine = t.match(/(?:尺码|码数|size|sizes|tallas?)\s*[:：]?\s*([A-Z0-9][A-Z0-9 ,/、\-–]{0,40})/i)?.[1];
  if (sizeLine) {
    const range = sizeLine.match(/\b(XXS|XS|S|M|L|XL|XXL|2XL|3XL)\s*[-–~]\s*(XS|S|M|L|XL|XXL|2XL|3XL)\b/i);
    const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];
    if (range) {
      const a = order.indexOf(range[1].toUpperCase()); const b = order.indexOf(range[2].toUpperCase());
      if (a !== -1 && b >= a) sizes = order.slice(a, b + 1);
    } else {
      sizes = sizeLine.split(/[\s,/、]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^(XXS|XS|S|M|L|XL|XXL|[2-4]XL|\d{2})$/.test(s));
    }
  }
  sizes = [...new Set(sizes)];

  const colors = Object.keys(COLORS).filter((zh) => t.includes(zh))
    // quita colores contenidos en otros más largos (灰色 dentro de 深灰色)
    .filter((zh, _, all) => !all.some((o) => o !== zh && o.length > zh.length && o.includes(zh) && t.includes(o)));

  const compM = t.match(/(?:面料|成分|材质|composition|material)\s*[:：]?\s*([^\n]{3,60})/i);
  const composition = compM ? compM[1].trim()
    : (t.match(/\d{1,3}\s*%\s*(?:[一-鿿]{1,5}|cotton|wool|polyester|nylon|spandex|linen)(?:[\s,，、]*\d{1,3}\s*%\s*(?:[一-鿿]{1,5}|cotton|wool|polyester|nylon|spandex|linen))*/i)?.[0] || '');
  const fiberOk = composition && Object.keys(FIBERS).some((f) => composition.includes(f)) || /cotton|wool|polyester|nylon|linen/i.test(composition);

  return { price_cny: price, sizes, colors, composition: fiberOk ? composition : '' };
}

/** Álbum → formato crudo común (el mismo que Sourcebase). */
export function albumToRaw(album, store) {
  const sizes = album.sizes.length ? album.sizes : [];
  const colors = album.colors.length ? album.colors : [];
  const skus = (colors.length ? colors : ['Único']).flatMap((c) => (sizes.length ? sizes : ['Única']).map((s) => ({ color: c, size: s })));
  return {
    url: album.url.replace(/\?.*$/, ''),
    platform: 'yupoo',
    shop: store,
    title: album.title,
    price_cny: album.price_cny,
    images: album.images,
    skus,
    attributes: album.composition ? { 面料: album.composition } : {},
    notes: album.description.slice(0, 500),
    referer: `https://${store}.x.yupoo.com/`,
  };
}

async function get(url, referer) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,es;q=0.8', ...(referer ? { referer } : {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Descarga y convierte. Devuelve la lista de productos crudos. */
export async function importYupoo(input, { limit = 200, pages = 20, html = null, delayMs = 900, log = console.log } = {}) {
  const info = parseYupooUrl(input);
  if (html) {
    const page = readFileSync(path.resolve(html), 'utf8');
    if (info.kind === 'album') return [albumToRaw(parseAlbum(page, input), info.store)];
    const { albums } = parseAlbumList(page, info.origin);
    log(`Listado offline: ${albums.length} álbumes (descárgalos uno a uno con --html o sin --html online)`);
    return [];
  }

  let albumUrls = [];
  if (info.kind === 'album') {
    albumUrls = [input];
  } else {
    const base = info.category ? `${info.origin}/categories/${info.category}` : `${info.origin}/albums`;
    let maxPage = 1;
    for (let p = 1; p <= Math.min(maxPage, pages) && albumUrls.length < limit; p++) {
      const page = await get(`${base}?page=${p}`, info.origin + '/');
      const parsed = parseAlbumList(page, info.origin);
      maxPage = Math.max(maxPage, parsed.maxPage);
      const before = albumUrls.length;
      albumUrls = [...new Set([...albumUrls, ...parsed.albums])];
      log(`  página ${p}/${maxPage}: +${albumUrls.length - before} álbumes`);
      if (albumUrls.length === before) break;
      await sleep(delayMs);
    }
  }

  const out = [];
  for (const [i, url] of albumUrls.slice(0, limit).entries()) {
    try {
      const album = parseAlbum(await get(url, info.origin + '/'), url);
      if (!album.images.length) { log(`  ✗ ${url}: sin fotos (¿álbum privado o con contraseña?)`); continue; }
      out.push(albumToRaw(album, info.store));
      log(`  ✓ [${i + 1}/${Math.min(limit, albumUrls.length)}] ${album.title.slice(0, 50)} · ${album.images.length} fotos · ${album.price_cny ?? '¿?'} CNY`);
    } catch (e) { log(`  ✗ ${url}: ${e.message}`); }
    await sleep(delayMs);
  }
  return out;
}
