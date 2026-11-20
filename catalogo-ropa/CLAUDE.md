# Instrucciones para Claude Code

- Proyecto independiente de ZYROX: tienda de ropa propia (marca aún sin nombre).
- Node ≥ 20, ESM, **sin dependencias salvo `sharp`**. No añadas frameworks sin preguntar.
- El esquema de producto es la fuente de verdad: si lo cambias, actualiza `src/lib/schema.js`, `schema/product.schema.json`, el panel y los tests.
- Las Pages Functions (`functions/`, `src/server/`) corren en Workers: solo Web APIs (fetch, crypto.subtle), nada de `node:`.
- El checkout nunca debe confiar en precios del cliente.
- Antes de terminar: `npm test` y `npm run demo` deben pasar.
- Valores de `config/store.config.json` (tipo de cambio, aranceles, envío) son supuestos: no los presentes como datos reales.
