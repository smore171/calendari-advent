/**
 * Exporta el catálogo a CSV de productos de Shopify (formato actual de columnas:
 * "URL handle", "Option1 name", "Product image URL"...).
 *
 * - Una fila por variante (Color × Talla) y filas extra con el mismo handle para el resto de fotos.
 * - Las fotos deben ser URLs públicas: Shopify las descarga al importar.
 *     --images r2      → URLs de tu bucket R2 (images.public_base_url). Recomendado.
 *     --images source  → URLs originales del proveedor. Weidian/1688 suelen funcionar;
 *                        Yupoo NO (bloquea descargas sin su web como referer).
 * - Shopify admite archivos de hasta 15 MB: se parte en varios si hace falta.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { publishableImages } from '../lib/schema.js';
import { landedCost } from '../lib/pricing.js';
import { escapeHtml } from '../lib/util.js';
import { sortSizes } from '../site/templates/pages.js';

export const COLUMNS = [
  'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags', 'Published on online store', 'Status',
  'SKU', 'Barcode', 'Option1 name', 'Option1 value', 'Option2 name', 'Option2 value', 'Option3 name', 'Option3 value',
  'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Inventory tracker', 'Inventory quantity',
  'Continue selling when out of stock', 'Weight value (grams)', 'Weight unit for display', 'Requires shipping', 'Fulfillment service',
  'Product image URL', 'Image position', 'Image alt text', 'Variant image URL', 'Gift card', 'SEO title', 'SEO description',
];

// Peso estimado por categoría (g) para calcular envíos en Shopify. SUPUESTOS: ajústalos.
const GRAMS = { camisetas: 220, camisas: 280, polos: 250, sudaderas: 650, punto: 500, chaquetas: 1100, pantalones: 550, vaqueros: 700,
  bermudas: 350, zapatillas: 1100, botas: 1500, zapatos: 1100, gorras: 150, bolsos: 600, cinturones: 200, bufandas: 250 };

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function describe(p) {
  const parts = [];
  if (p.fit_note) parts.push(`<p>${escapeHtml(p.fit_note)}</p>`);
  if (p.composition) parts.push(`<p><strong>Composición:</strong> ${escapeHtml(p.composition)}</p>`);
  if (p.care) parts.push(`<p><strong>Cuidados:</strong> ${escapeHtml(p.care)}</p>`);
  const sizes = sortSizes(Object.keys(p.size_chart_cm || {}));
  if (sizes.length) {
    const cols = [...new Set(sizes.flatMap((s) => Object.keys(p.size_chart_cm[s])))];
    parts.push(`<p><strong>Medidas de la prenda (cm, en plano)</strong></p><table><thead><tr><th>Talla</th>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${
      sizes.map((s) => `<tr><td>${escapeHtml(s)}</td>${cols.map((c) => `<td>${p.size_chart_cm[s][c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  }
  return parts.join('');
}

function imageUrl(img, mode, base) {
  if (mode === 'source') return /^https?:/.test(img.original || '') ? img.original : '';
  return img.files?.shopify ? `${base}/${img.files.shopify}` : (img.files?.zoom ? `${base}/${img.files.zoom}` : '');
}

/** Filas (arrays) de un producto. */
export function productRows(p, config, { images = 'r2', vendor } = {}) {
  const cat = config.categories.find((c) => c.id === p.category);
  const group = config.category_groups?.find((g) => g.id === cat?.group);
  const base = (config.images.public_base_url || '').replace(/\/$/, '');
  const imgs = publishableImages(p).map((img) => imageUrl(img, images, base)).filter(Boolean);
  const multiColor = p.colors.length > 1 || (p.colors[0] && !/^únic/i.test(p.colors[0]));
  const multiSize = p.sizes.length > 1 || (p.sizes[0] && !/^únic/i.test(p.sizes[0]));
  const cost = p.source?.cost_cny ? landedCost(p.source.cost_cny, config.pricing).toFixed(2) : '';
  const status = p.status === 'published' || p.status === 'approved' ? 'active' : 'draft';
  const tags = [group?.name, cat?.name, ...p.colors, ...(p.compare_at_eur ? ['Oferta'] : []), ...(p.tags || [])].filter(Boolean);
  const variants = [...p.variants].sort((a, b) => p.colors.indexOf(a.color) - p.colors.indexOf(b.color)
    || sortSizes([...p.sizes]).indexOf(a.size) - sortSizes([...p.sizes]).indexOf(b.size));

  const rows = [];
  variants.forEach((v, i) => {
    const first = i === 0;
    const opts = [];
    if (multiColor) opts.push(['Color', v.color]);
    if (multiSize) opts.push(['Talla', v.size]);
    if (!opts.length) opts.push(['Title', 'Default Title']);
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
    Object.assign(row, {
      'URL handle': p.id,
      SKU: v.sku,
      'Option1 name': first ? opts[0][0] : '', 'Option1 value': opts[0][1],
      'Option2 name': first && opts[1] ? opts[1][0] : '', 'Option2 value': opts[1]?.[1] ?? '',
      Price: (v.price_eur ?? p.price_eur).toFixed(2),
      'Compare-at price': p.compare_at_eur ? p.compare_at_eur.toFixed(2) : '',
      'Cost per item': cost,
      'Charge tax': 'true',
      // Bajo pedido: sin control de inventario. En stock: Shopify lo controla (pon la cantidad real).
      'Inventory tracker': v.stock === 'in_stock' ? 'shopify' : '',
      'Inventory quantity': v.stock === 'in_stock' ? '0' : '',
      'Continue selling when out of stock': v.stock === 'out_of_stock' ? 'deny' : (v.stock === 'in_stock' ? 'deny' : 'continue'),
      'Weight value (grams)': GRAMS[p.category] ?? 500,
      'Weight unit for display': 'g',
      'Requires shipping': 'true',
      'Fulfillment service': 'manual',
    });
    if (first) {
      Object.assign(row, {
        Title: p.title, Description: describe(p), Vendor: vendor || config.store.name, Type: cat?.name || '',
        Tags: tags.join(', '), 'Published on online store': status === 'active' ? 'true' : 'false', Status: status,
        'Gift card': 'false',
        'SEO title': `${p.title} | ${config.store.name}`.slice(0, 70),
        'SEO description': `${p.title}. ${p.composition}.`.slice(0, 320),
      });
    }
    if (imgs[i]) Object.assign(row, { 'Product image URL': imgs[i], 'Image position': i + 1, 'Image alt text': `${p.title} – foto ${i + 1}` });
    rows.push(row);
  });
  // Más fotos que variantes → filas solo con imagen.
  for (let i = variants.length; i < imgs.length; i++) {
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
    Object.assign(row, { 'URL handle': p.id, 'Product image URL': imgs[i], 'Image position': i + 1, 'Image alt text': `${p.title} – foto ${i + 1}` });
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows) {
  return '﻿' + [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** Escribe uno o varios CSV (≤ 14 MB cada uno, sin partir productos). */
export function exportShopifyCsv(products, config, { out, images = 'r2', maxBytes = 14 * 1024 * 1024, log = console.log } = {}) {
  const files = [];
  let chunk = []; let size = 0; let n = 0;
  const flush = () => {
    if (!chunk.length) return;
    n++;
    const file = out.replace(/\.csv$/i, '') + (n > 1 || size > maxBytes ? `-${n}` : '') + '.csv';
    writeFileSync(file, toCsv(chunk));
    files.push(file); chunk = []; size = 0;
  };
  let noImages = 0;
  for (const p of products) {
    const rows = productRows(p, config, { images });
    if (!rows.some((r) => r['Product image URL'])) noImages++;
    const bytes = Buffer.byteLength(toCsv(rows));
    if (size + bytes > maxBytes) flush();
    chunk.push(...rows); size += bytes;
  }
  flush();
  log(`Shopify CSV: ${products.length} productos → ${files.map((f) => path.basename(f)).join(', ')}`);
  if (noImages) log(`  ⚠ ${noImages} producto(s) sin URL de foto pública (¿subiste las fotos a R2 o usas --images source con Yupoo?)`);
  return files;
}
