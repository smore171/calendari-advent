/**
 * Regla de orden de la galería (pura, testeable):
 * 1 packshot (portada) → 2 maniquí → 3 modelo → 4 detalle → 5 dudosas.
 * Tablas de tallas y descartadas no se publican.
 * Dentro de cada tipo: mayor confianza primero; empate → orden original.
 */
export const TYPE_PRIORITY = { packshot: 1, mannequin: 2, model: 3, detail: 4, unknown: 5, size_chart: 90, discard: 99 };

export function orderImages(images, { maxPublished = 12 } = {}) {
  const indexed = images.map((img, i) => ({ img, i }));
  indexed.sort((a, b) =>
    (TYPE_PRIORITY[a.img.type] ?? 50) - (TYPE_PRIORITY[b.img.type] ?? 50) ||
    (b.img.score ?? 0) - (a.img.score ?? 0) ||
    a.i - b.i);

  let pos = 0;
  return indexed.map(({ img }) => {
    const publishable = !['discard', 'size_chart'].includes(img.type) && img.publish !== false;
    if (publishable && pos < maxPublished) {
      pos += 1;
      return { ...img, order: pos, publish: true };
    }
    return { ...img, order: null, publish: false };
  });
}

/**
 * Marca como duplicadas las fotos casi idénticas (dHash + color medio parecido),
 * conservando la de mayor resolución. El color evita tratar como duplicadas
 * la misma foto en negro y en camel (son variantes, no duplicados).
 */
export function markDuplicates(images, hammingFn, threshold = 6, colorFn = null, maxColorDist = 30) {
  const out = images.map((img) => ({ ...img }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].hash || out[i].type === 'discard') continue;
    for (let j = i + 1; j < out.length; j++) {
      if (!out[j].hash || out[j].type === 'discard') continue;
      const sameColor = !colorFn || !out[i].color || !out[j].color || colorFn(out[i].color, out[j].color) <= maxColorDist;
      if (sameColor && hammingFn(out[i].hash, out[j].hash) <= threshold) {
        const areaI = (out[i].width || 0) * (out[i].height || 0);
        const areaJ = (out[j].width || 0) * (out[j].height || 0);
        const loser = areaJ > areaI ? i : j;
        out[loser].type = 'discard';
        out[loser].reason = 'duplicada';
        out[loser].score = 1;
      }
    }
  }
  return out;
}
