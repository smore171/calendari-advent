/**
 * Pipeline de fotos de un producto:
 * descargar/leer → dHash + rasgos → clasificar → duplicados → ordenar → WebP en 3 tamaños.
 * Resultado en data/media/<id>/<nn>-<tamaño>.webp y rutas guardadas en product.images[].files
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS } from '../lib/config.js';
import { ensureDir } from '../lib/util.js';
import { dHash, hamming, colorDistance, extractFeatures } from './features.js';
import * as heuristic from './providers/heuristic.js';
import * as claude from './providers/claude.js';
import { orderImages, markDuplicates } from './order.js';

const AI_THRESHOLD = Number(process.env.AI_THRESHOLD || 0.6);

async function loadOriginal(src, cacheDir, idx, refererHint) {
  if (/^https?:\/\//.test(src)) {
    const ext = (path.extname(new URL(src).pathname).toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) || ['.jpg'])[0];
    const file = path.join(cacheDir, `orig-${String(idx).padStart(2, '0')}${ext}`);
    if (!existsSync(file)) {
      const res = await fetch(src, {
        headers: {
          // Algunos CDN chinos exigen referer/UA de navegador.
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          referer: refererHint || (src.includes('yupoo.com') ? 'https://x.yupoo.com/' : src.includes('1688') || src.includes('alicdn') ? 'https://detail.1688.com/' : 'https://weidian.com/'),
        },
      });
      if (!res.ok) throw new Error(`descarga ${res.status} ${src}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    return file;
  }
  if (!existsSync(src)) throw new Error(`no existe ${src}`);
  // Copia local para que todo el producto viva en data/media/<id>/.
  const file = path.join(cacheDir, `orig-${String(idx).padStart(2, '0')}${path.extname(src).toLowerCase() || '.jpg'}`);
  if (!existsSync(file)) await copyFile(src, file);
  return file;
}

/**
 * Genera los WebP (thumb/card/zoom, recorte 3:4) de cada foto publicable que
 * aún no los tenga. El nombre usa el hash, así reordenar en el panel no obliga
 * a regenerar nada. Formato 3:4 vertical, recorte "attention" (centra el objeto).
 */
export async function ensureVariants(product, config) {
  const dir = ensureDir(path.join(PATHS.media, product.id));
  for (const [idx, img] of product.images.entries()) {
    if (!img.publish || !img.local) continue;
    const key = img.hash || String(idx).padStart(2, '0');
    const wanted = Object.keys(config.images.sizes).map((label) => `${product.id}/${key}-${label}.webp`);
    if (img.files && wanted.every((rel) => Object.values(img.files).includes(rel) && existsSync(path.join(PATHS.media, rel)))) continue;
    const src = path.join(PATHS.root, img.local);
    img.files = {};
    for (const [label, width] of Object.entries(config.images.sizes)) {
      const out = path.join(dir, `${key}-${label}.webp`);
      await sharp(src).rotate()
        .resize({ width, height: Math.round(width * 4 / 3), fit: 'cover', position: 'attention', withoutEnlargement: true })
        .webp({ quality: config.images.webp_quality }).toFile(out);
      img.files[label] = `${product.id}/${key}-${label}.webp`;
    }
  }
  return product;
}

export async function processProductImages(product, config, { useAi = true, log = console.log } = {}) {
  const dir = ensureDir(path.join(PATHS.media, product.id));
  const aiOn = useAi && claude.isAvailable();
  let images = [];

  for (const [idx, img] of product.images.entries()) {
    // Respeta decisiones manuales del panel.
    if (img.locked) { images.push(img); continue; }
    try {
      const file = await loadOriginal(img.original, dir, idx, product.source?.referer);
      const buf = await readFile(file);
      const [hash, f] = await Promise.all([dHash(buf), extractFeatures(buf)]);
      let result = heuristic.classify(f);
      let classifier = heuristic.name;
      if (aiOn && result.score < AI_THRESHOLD && result.type !== 'discard') {
        try {
          result = await claude.classifyFile(file);
          classifier = claude.name;
        } catch (e) { log(`  ⚠ IA no disponible para ${path.basename(file)}: ${e.message}`); }
      }
      images.push({ ...img, local: path.relative(PATHS.root, file), hash, color: f.centerColor, width: f.width, height: f.height,
        type: result.type, score: +result.score.toFixed(2), reason: result.reason, classifier });
    } catch (e) {
      log(`  ✗ ${img.original}: ${e.message}`);
      images.push({ ...img, type: 'discard', score: 1, reason: `error: ${e.message}` });
    }
  }

  images = markDuplicates(images, hamming, 6, colorDistance);
  images = orderImages(images, { maxPublished: config.images.max_per_product });

  product.images = images;
  await ensureVariants(product, config);
  const cover = images.find((i) => i.order === 1);
  log(`  ${product.id}: ${images.filter((i) => i.publish).length} publicables, portada=${cover?.type ?? 'ninguna'}${aiOn ? ' (IA activa)' : ''}`);
  return product;
}
