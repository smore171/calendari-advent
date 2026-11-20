#!/usr/bin/env node
/**
 * Uso:
 *   node src/cli.js import <archivo.json|carpeta>   crudo (Sourcebase) → data/products/*.json (draft)
 *   node src/cli.js yupoo <url> [--limit N] [--pages N] [--html f]  Yupoo → data/raw/*.json
 *   node src/cli.js sourcebase <catalog.json> [--store ID]... [--q texto] [--limit N]   Sourcebase → data/raw/*.json
 *   node src/cli.js images [--all|<id>] [--no-ai]    clasifica, ordena y genera WebP
 *   node src/cli.js approve [--all|<id>]             pasa a approved si no hay errores
 *   node src/cli.js validate                         informe de errores/avisos
 *   node src/cli.js build                            genera la web en dist/
 *   node src/cli.js shopify [--images r2|source] [--include-drafts] [--out f.csv]   CSV para importar en Shopify
 *   node src/cli.js upload                           sube data/media a R2
 */
import { statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, PATHS } from './lib/config.js';
import { readJson, writeJson, listJson, nowIso, ensureDir } from './lib/util.js';
import { validateProduct } from './lib/schema.js';
import { rawToProduct } from './import/from-raw.js';

const [cmd, ...args] = process.argv.slice(2);
const config = loadConfig();
const productFile = (id) => path.join(PATHS.products, `${id}.json`);
const allProducts = () => listJson(PATHS.products).map(readJson);

function selectProducts(args) {
  const ids = args.filter((a) => !a.startsWith('--'));
  const all = allProducts();
  if (args.includes('--all') || ids.length === 0) return all;
  return all.filter((p) => ids.includes(p.id));
}

function importFiles(files) {
  const existing = allProducts();
  const existingIds = new Set(existing.map((p) => p.id));
  const knownUrls = new Set(existing.map((p) => p.source?.url).filter(Boolean));
  let created = 0;
  for (const file of files) {
    const data = readJson(file);
    for (const raw of Array.isArray(data) ? data : [data]) {
      if (raw.url && knownUrls.has(raw.url)) { console.log(`= ya importado: ${raw.url}`); continue; }
      const p = rawToProduct(raw, { config, rawDir: path.dirname(file), existingIds });
      existingIds.add(p.id); knownUrls.add(p.source.url);
      writeJson(productFile(p.id), p);
      console.log(`+ ${p.id} (${p.images.length} fotos, ${p.variants.length} variantes, ${p.price_eur ?? '—'} €)`);
      created++;
    }
  }
  console.log(`Importados: ${created}`);
  return created;
}

async function main() {
  switch (cmd) {
    case 'import': {
      const target = path.resolve(args[0] || PATHS.raw);
      const files = statSync(target).isDirectory()
        ? readdirSync(target).filter((f) => f.endsWith('.json')).map((f) => path.join(target, f))
        : [target];
      importFiles(files);
      break;
    }
    case 'yupoo': {
      const { importYupoo, parseYupooUrl } = await import('./import/yupoo.js');
      const url = args.find((a) => /^https?:/.test(a));
      if (!url) throw new Error('Uso: npm run yupoo -- https://TIENDA.x.yupoo.com/albums[/ID] [--limit 50]');
      const opt = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : undefined; };
      const raws = await importYupoo(url, { limit: Number(opt('limit') || 200), pages: Number(opt('pages') || 20), html: opt('html') });
      if (!raws.length) { console.log('No se obtuvo ningún álbum.'); break; }
      const { store } = parseYupooUrl(url);
      const out = path.join(PATHS.raw, `yupoo-${store}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`);
      writeJson(out, raws);
      console.log(`Guardado ${raws.length} álbum(es) en ${path.relative(PATHS.root, out)}`);
      if (!args.includes('--no-import')) importFiles([out]);
      break;
    }
    case 'sourcebase': {
      const { importSourcebase } = await import('./import/from-sourcebase.js');
      const file = args.find((a) => a.endsWith('.json'));
      if (!file) throw new Error('Uso: npm run sourcebase -- <ruta a Sourcebase/server/data/catalog.json> --store <id> [--limit 100]');
      const multi = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
      const opt = (name) => multi(name)[0];
      const { raws, rejected } = await importSourcebase(path.resolve(file), {
        stores: multi('store'), ids: (opt('ids') || '').split(',').filter(Boolean), q: opt('q') || '', limit: Number(opt('limit') || 200),
      });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
      writeJson(path.join(PATHS.raw, `sourcebase-descartados-${stamp}.json`), rejected);
      if (!raws.length) { console.log('Nada que importar.'); break; }
      const out = path.join(PATHS.raw, `sourcebase-${stamp}.json`);
      writeJson(out, raws);
      if (!args.includes('--no-import')) importFiles([out]);
      break;
    }
    case 'images': {
      const { processProductImages } = await import('./images/process.js');
      for (const p of selectProducts(args)) {
        await processProductImages(p, config, { useAi: !args.includes('--no-ai') });
        writeJson(productFile(p.id), p);
      }
      break;
    }
    case 'approve': {
      for (const p of selectProducts(args)) {
        if (p.status !== 'draft') continue;
        const { errors } = validateProduct(p, { categories: config.categories, forPublish: true });
        if (errors.length) { console.log(`✗ ${p.id}: ${errors.join('; ')}`); continue; }
        p.status = 'approved';
        p.review = { ...p.review, approved_at: nowIso() };
        writeJson(productFile(p.id), p);
        console.log(`✓ ${p.id}`);
      }
      break;
    }
    case 'validate': {
      let bad = 0;
      for (const p of allProducts()) {
        const { errors, warnings } = validateProduct(p, { categories: config.categories });
        if (errors.length || warnings.length) {
          console.log(`${errors.length ? '✗' : '!'} ${p.id} [${p.status}]`);
          errors.forEach((e) => console.log(`    error: ${e}`));
          warnings.forEach((w) => console.log(`    aviso: ${w}`));
        }
        if (errors.length) bad++;
      }
      console.log(bad ? `${bad} producto(s) con errores` : 'Todo correcto');
      process.exitCode = bad ? 1 : 0;
      break;
    }
    case 'build': {
      const { buildSite } = await import('./site/build.js');
      await buildSite({ local: args.includes('--local') || !process.env.MEDIA_FROM_R2 });
      break;
    }
    case 'shopify': {
      const { exportShopifyCsv } = await import('./export/shopify-csv.js');
      const { ensureShopifyJpg } = await import('./images/process.js');
      const opt = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : undefined; };
      const images = opt('images') || 'r2';
      const statuses = args.includes('--include-drafts') ? ['draft', 'approved', 'published'] : ['approved', 'published'];
      const products = allProducts().filter((p) => statuses.includes(p.status));
      if (images === 'r2') {
        for (const p of products) { await ensureShopifyJpg(p); writeJson(productFile(p.id), p); }
        console.log('JPG para Shopify generados. Súbelos con: npm run upload');
      }
      const out = path.resolve(opt('out') || path.join(PATHS.root, 'export', `shopify-${new Date().toISOString().slice(0, 10)}.csv`));
      ensureDir(path.dirname(out));
      exportShopifyCsv(products, config, { out, images });
      const drafts = allProducts().filter((p) => p.status === 'draft').length;
      if (drafts && !args.includes('--include-drafts')) console.log(`  (${drafts} borrador(es) sin aprobar no incluidos; usa --include-drafts para subirlos como borrador)`);
      break;
    }
    case 'upload': {
      const { uploadMedia } = await import('./images/upload-r2.js');
      await uploadMedia();
      break;
    }
    default:
      console.log('Comandos: import | images | approve | validate | build | upload');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
