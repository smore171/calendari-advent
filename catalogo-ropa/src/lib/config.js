import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PATHS = {
  root: ROOT,
  config: path.join(ROOT, 'config/store.config.json'),
  raw: path.join(ROOT, 'data/raw'),
  products: path.join(ROOT, 'data/products'),
  media: path.join(ROOT, 'data/media'),
  dist: path.join(ROOT, 'dist'),
  legal: path.join(ROOT, 'legal'),
  assets: path.join(ROOT, 'src/site/assets'),
  generated: path.join(ROOT, 'src/server/_generated'),
};

let cached;
export function loadConfig() {
  if (!cached) cached = JSON.parse(readFileSync(PATHS.config, 'utf8'));
  return cached;
}
