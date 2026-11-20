/**
 * Extracción de rasgos visuales con sharp (sin IA): sirve para el clasificador
 * heurístico y para detectar duplicados.
 */
import sharp from 'sharp';

/** dHash 64 bits en hex: dos fotos casi iguales dan distancia de Hamming baja. */
export async function dHash(input) {
  const { data } = await sharp(input).rotate().grayscale().resize(9, 8, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
  }
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

export function colorDistance(a = [0, 0, 0], b = [0, 0, 0]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function hamming(a, b) {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function stats(values) {
  const n = values.length || 1;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { mean, sd };
}

/** Piel humana aproximada en RGB (regla clásica de Kovac et al.). */
function isSkin(r, g, b) {
  return r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
    Math.abs(r - g) > 15 && r > g && r > b;
}

export async function extractFeatures(input) {
  const meta = await sharp(input).metadata();
  const W = 96; const H = 96;
  const { data } = await sharp(input).rotate().resize(W, H, { fit: 'fill' }).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });

  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const border = []; const center = []; const all = [];
  let skin = 0; let skinCenter = 0; let satSum = 0; let edges = 0;
  const rgbCenter = [0, 0, 0]; let nCenter = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const L = lum(i);
      all.push(L);
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      satSum += mx === 0 ? 0 : (mx - mn) / mx;
      const isBorder = x < 6 || y < 6 || x >= W - 6 || y >= H - 6;
      if (isBorder) border.push(L);
      const inCenter = x > W * 0.25 && x < W * 0.75 && y > H * 0.2 && y < H * 0.8;
      if (inCenter) { center.push(L); rgbCenter[0] += r; rgbCenter[1] += g; rgbCenter[2] += b; nCenter++; }
      if (isSkin(r, g, b)) { skin++; if (inCenter) skinCenter++; }
      if (x < W - 1) {
        const j = i + 3;
        if (Math.abs(L - lum(j)) > 40) edges++;
      }
    }
  }
  const total = W * H;
  const b = stats(border); const c = stats(center); const a = stats(all);
  return {
    width: meta.width, height: meta.height,
    aspect: meta.height / meta.width,
    borderMean: b.mean, borderSd: b.sd,
    centerMean: c.mean, centerSd: c.sd,
    globalMean: a.mean, globalSd: a.sd,
    saturation: satSum / total,
    skinRatio: skin / total,
    skinCenterRatio: skinCenter / center.length,
    edgeDensity: edges / total,
    brightRatio: all.filter((v) => v > 225).length / total,
    // Color medio de la zona central: distingue variantes de color con la misma foto.
    centerColor: rgbCenter.map((v) => Math.round(v / nCenter)),
  };
}
