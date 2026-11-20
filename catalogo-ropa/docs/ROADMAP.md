# Roadmap

## V1 (esta versión)
- [x] Esquema único de producto + validación (composición obligatoria, variantes, fotos)
- [x] Importador desde formato crudo (Sourcebase) con glosario chino→español
- [x] Pipeline de fotos: duplicados, clasificación heurística + IA opcional, orden, WebP 3:4 en 3 tamaños
- [x] Panel local de revisión con acciones en lote
- [x] Web estática: inicio, categorías con filtro de talla, ficha, carrito, legales, guía de tallas, sitemap, JSON-LD
- [x] Checkout Stripe + contra reembolso, pedidos en D1, avisos por Telegram
- [x] Subida a R2 sin dependencias
- [x] Tests (12)

## V1.1 (rediseño)
- [x] Inicio con hero de promoción, cuenta atrás, código copiable, grupos, categorías, novedades y ofertas
- [x] Menú con desplegables y menú lateral en móvil
- [x] Catálogo con barra lateral: árbol de categorías, filtros (talla, color, precio, ofertas, novedades), búsqueda y orden
- [x] Página de promociones y productos relacionados en la ficha

## V2 — integración real
- [ ] Código promocional real: cupón de Stripe (`allow_promotion_codes`) y descuento también en contra reembolso
- [ ] Conectar la salida real de Sourcebase y ajustar `pick()` (revisar con su código)
- [ ] Probar el clasificador con 100–200 fotos reales y ajustar los umbrales (medir el acierto)
- [ ] Extraer medidas y composición de la **tabla de tallas en imagen** con IA (hoy solo se clasifica)
- [ ] Traducción y reescritura de títulos con IA en lote, con estilo de marca
- [ ] Recorte inteligente: `contain` sobre fondo del color del packshot en lugar de `cover`
- [ ] Panel de pedidos: cambiar estado (confirmado → enviado → entregado/rechazado), tracking y tasa de rechazo del contra reembolso
- [ ] Email de confirmación (Resend o similar)

## V3 — crecimiento
- [ ] Buscador y filtros por color y precio
- [ ] Reseñas propias (con verificación de compra)
- [ ] Packlink/Sendcloud: etiquetas desde el panel
- [ ] Banner de cookies solo si se añaden analítica o píxeles (Meta/TikTok)
- [ ] Bizum (MONEI) como segundo método de pago
