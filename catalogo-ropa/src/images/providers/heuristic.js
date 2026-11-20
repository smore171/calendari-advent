/**
 * Clasificador heurístico (gratis, local, sin modelo). Reglas sencillas sobre
 * los rasgos de features.js.
 *
 * Fiable para: banners/tiras, baja resolución, tablas de tallas, producto
 * sobre fondo liso y duplicados. NO distingue bien modelo / maniquí / detalle
 * (y confunde prendas camel/beige con piel): en esos casos devuelve una
 * confianza baja (< 0.6) para que el proveedor IA o tú lo revisen.
 *
 * Tipos: packshot | mannequin | model | detail | size_chart | discard | unknown
 */
export const name = 'heuristic';

export function classify(f) {
  // Banners largos (fichas de detalle cosidas) o tiras: no sirven en galería.
  if (f.aspect > 2.2 || f.aspect < 0.45) {
    return { type: 'discard', score: 0.9, reason: 'proporción de banner' };
  }
  if (Math.min(f.width, f.height) < 400) {
    return { type: 'discard', score: 0.8, reason: 'resolución baja' };
  }
  // Tabla de tallas: casi todo blanco, sin color y muchas líneas/texto.
  if (f.brightRatio > 0.5 && f.saturation < 0.06 && f.edgeDensity > 0.06) {
    return { type: 'size_chart', score: 0.75, reason: 'fondo blanco con mucho texto/líneas' };
  }

  const plainBorder = f.borderSd < 12;
  const objectOnBackground = Math.abs(f.centerMean - f.borderMean) > 18 || f.centerSd > 15;

  if (plainBorder && objectOnBackground) {
    // Mucha "piel" en el centro sobre fondo liso: o es modelo en estudio o una prenda camel/beige.
    if (f.skinCenterRatio > 0.15) {
      return { type: 'packshot', score: 0.45, reason: 'fondo liso pero tono piel en el centro (¿modelo o prenda beige?)' };
    }
    const score = Math.min(0.92, 0.65 + (12 - f.borderSd) / 50 + (f.brightRatio > 0.25 ? 0.1 : 0));
    return { type: 'packshot', score, reason: 'objeto aislado sobre fondo liso' };
  }
  // Encuadre lleno de una sola superficie: primer plano de tejido.
  if (Math.abs(f.centerMean - f.borderMean) < 10 && Math.abs(f.centerSd - f.borderSd) < 8 && f.skinCenterRatio < 0.05) {
    return { type: 'detail', score: 0.5, reason: 'superficie uniforme en todo el encuadre' };
  }
  if (!plainBorder && f.skinCenterRatio > 0.03) {
    return { type: 'model', score: Math.min(0.7, 0.4 + f.skinCenterRatio * 2), reason: 'fondo con escena y tonos piel' };
  }
  return { type: 'unknown', score: 0.3, reason: 'sin patrón claro' };
}
