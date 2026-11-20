/**
 * Proveedor IA opcional: Claude con visión. Solo se usa para las fotos en las
 * que el heurístico duda (score < umbral) si existe ANTHROPIC_API_KEY.
 * Coste por imagen: consulta la tarifa vigente antes de lanzarlo sobre miles de fotos.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export const name = 'claude';

const PROMPT = `Clasifica esta foto de una ficha de ropa de una tienda china.
Responde SOLO con JSON: {"type": "...", "confidence": 0-1, "has_chinese_text": true|false, "watermark": true|false}
Tipos posibles:
- "packshot": la prenda sola, en primer plano, sobre fondo liso o flat lay (sirve de portada)
- "mannequin": la prenda en maniquí o "ghost mannequin"
- "model": una persona lleva la prenda
- "detail": primer plano de tejido, costura, botón, etiqueta
- "size_chart": tabla de medidas/tallas
- "discard": banner publicitario, collage, texto promocional, foto irrelevante`;

export function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function classifyFile(file) {
  const jpeg = await sharp(await readFile(file)).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body.content?.find((c) => c.type === 'text')?.text || '{}';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  let type = json.type;
  if (json.watermark || (json.has_chinese_text && type !== 'size_chart')) {
    // Se deja publicable solo si es portada clara; si no, se descarta.
    if (type !== 'packshot') type = 'discard';
  }
  return { type, score: Number(json.confidence) || 0.5, reason: 'claude-vision' };
}
