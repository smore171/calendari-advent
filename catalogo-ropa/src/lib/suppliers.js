/**
 * Registro de proveedores: data/suppliers.json
 * Se actualiza solo al importar. Cada producto guarda source.supplier_id.
 *   { "yupoo-tienda": { id, name, platform, url, first_import, last_import, notes } }
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';
import { readJson, writeJson, slugify, nowIso } from './util.js';

export const SUPPLIERS_FILE = path.join(PATHS.root, 'data/suppliers.json');

export function supplierIdFor({ platform = 'manual', shop = '', store_id = '' } = {}) {
  const key = store_id || slugify(shop || 'sin-nombre');
  return `${slugify(platform || 'manual')}-${key}`.toLowerCase();
}

export function loadSuppliers(file = SUPPLIERS_FILE) {
  return existsSync(file) ? readJson(file) : {};
}

export function saveSuppliers(reg, file = SUPPLIERS_FILE) {
  writeJson(file, reg);
}

/** Registra/actualiza el proveedor de un producto recién importado. */
export function touchSupplier(reg, p) {
  const id = p.source?.supplier_id;
  if (!id) return reg;
  const now = nowIso();
  const prev = reg[id] || { id, name: p.source.shop || id, platform: p.source.platform, url: p.source.supplier_url || '', first_import: now, notes: '' };
  reg[id] = { ...prev, url: prev.url || p.source.supplier_url || '', last_import: now };
  return reg;
}

/** Resumen por proveedor a partir de los productos. */
export function supplierStats(products, reg = {}) {
  const out = {};
  for (const id of Object.keys(reg)) out[id] = { ...reg[id], total: 0, draft: 0, approved: 0, published: 0, archived: 0 };
  for (const p of products) {
    const id = p.source?.supplier_id || 'sin-proveedor';
    out[id] ||= { id, name: p.source?.shop || 'Sin proveedor', platform: p.source?.platform || '', total: 0, draft: 0, approved: 0, published: 0, archived: 0 };
    out[id].total++;
    out[id][p.status] = (out[id][p.status] || 0) + 1;
  }
  return Object.values(out).sort((a, b) => b.total - a.total);
}
