/**
 * Sube data/media/** a Cloudflare R2 (API compatible con S3) sin dependencias.
 * Variables de entorno (ver .env.example):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Solo sube .webp y *-shopify.jpg que no existan ya (HEAD previo).
 */
import { createHash, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PATHS } from '../lib/config.js';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

export function signRequest({ method, host, key, body = '', accessKeyId, secret, region = 'auto', now = new Date(), contentType }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalUri = '/' + key.split('/').map(encodeURIComponent).join('/');
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join('');
  const canonical = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + secret, date), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return {
    url: `https://${host}${canonicalUri}`,
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.webp') || e.name.endsWith('-shopify.jpg')) out.push(p);
  }
  return out;
}

export async function uploadMedia({ log = console.log } = {}) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('Faltan variables R2_* (copia .env.example a .env y cárgalo)');
  }
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const files = await walk(PATHS.media);
  let uploaded = 0; let skipped = 0;
  for (const file of files) {
    const key = `${R2_BUCKET}/${path.relative(PATHS.media, file).split(path.sep).join('/')}`;
    const auth = { host, accessKeyId: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY };
    const head = signRequest({ ...auth, method: 'HEAD', key });
    const exists = await fetch(head.url, { method: 'HEAD', headers: head.headers });
    if (exists.ok) { skipped++; continue; }
    const body = await readFile(file);
    const type = file.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
    const put = signRequest({ ...auth, method: 'PUT', key, body, contentType: type });
    const res = await fetch(put.url, { method: 'PUT', headers: { ...put.headers, 'cache-control': 'public, max-age=31536000, immutable' }, body });
    if (!res.ok) throw new Error(`R2 ${res.status} subiendo ${key}: ${await res.text()}`);
    uploaded++;
  }
  log(`R2: ${uploaded} subidas, ${skipped} ya existían`);
  return { uploaded, skipped };
}
