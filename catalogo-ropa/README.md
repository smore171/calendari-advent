# catalogo-ropa · V1

Sistema propio para montar una tienda de ropa a partir de un proveedor de Weidian/1688, sin Shopify:

```
link / export de Sourcebase ─► importar ─► fotos (clasificar, ordenar, WebP) ─► panel de revisión ─► web estática + checkout
                                 │              │                                   │                    │
                          data/raw/*.json   data/media/<id>/                 localhost:4321      Cloudflare Pages + R2
```

- **Una estructura común** para todos los productos: [`schema/product.schema.json`](schema/product.schema.json).
- **Portada automática**: la foto 1 siempre es el producto en primer plano (packshot). Después maniquí, modelo y detalle. Tablas de tallas, banners y duplicados no se publican.
- **Panel local** para revisar en lote: título, precio con margen, composición, medidas y orden de fotos.
- **Web estática** (HTML + CSS + JS, sin frameworks): rápida, barata y fácil de alojar gratis.
  - Inicio con promoción (cuenta atrás y código), bloques Ropa/Calzado/Accesorios, categorías, novedades y ofertas.
  - Menú con desplegable por grupo; en móvil, menú lateral.
  - Catálogo (`/tienda/`, `/g/<grupo>/`, `/c/<categoría>/`, `/novedades/`, `/promociones/`) con barra lateral de categorías y filtros de talla, color, precio, ofertas y novedades, búsqueda y orden.
  - Etiquetas `-25 %` y `Nuevo`, precio tachado y muestras de color.
- **Pago** con Stripe Checkout (la tarjeta nunca pasa por tu servidor) y **contra reembolso** con confirmación por WhatsApp.
- **Avisos de pedido** por Telegram (opcional) y pedidos guardados en Cloudflare D1.

## Probarlo en 1 minuto (sin internet ni claves)

```bash
cd catalogo-ropa
npm install
npm run demo        # crea 16 productos de prueba con fotos sintéticas y genera la web
npm run preview     # tienda en http://localhost:8788
npm run admin       # panel en http://localhost:4321 (en otra terminal)
npm test            # 14 tests
```

La demo incluye a propósito una camisa **sin composición**: el sistema no deja publicarla hasta que la completes en el panel.

## Flujo real

| Paso | Comando | Qué hace |
|---|---|---|
| 1. Exportar | (Sourcebase) | Guarda un JSON por tienda/artículo en `data/raw/` con el [formato crudo](src/import/from-raw.js) |
| 2. Importar | `npm run import` | Crea borradores en `data/products/` con título provisional en español, categoría, variantes, composición, medidas y precio sugerido |
| 3. Fotos | `npm run images -- --all` | Descarga, detecta duplicados, clasifica, ordena y genera WebP 3:4 (480/900/1600 px) |
| 4. Revisar | `npm run admin` | Corrige lo dudoso y aprueba (en lote o una a una) |
| 5. Validar | `npm run validate` | Lista errores/avisos de todo el catálogo |
| 6. Fotos a R2 | `npm run upload` | Sube los WebP a Cloudflare R2 (solo los nuevos) |
| 7. Publicar | `npm run build:prod` | Genera `dist/` con fotos servidas desde R2 |

### Conectar Sourcebase

El importador acepta varios nombres de campo habituales (`title`/`name`, `images`/`imgs`, `skus`/`variants`…). Si Sourcebase usa otros, solo hay que tocar `pick()` en [`src/import/from-raw.js`](src/import/from-raw.js). Ejemplo mínimo:

```json
{
  "url": "https://weidian.com/item.html?itemID=123",
  "title": "重磅 纯棉 卫衣 宽松",
  "price_cny": 89,
  "images": ["https://.../1.jpg", "https://.../2.jpg"],
  "skus": [{ "color": "灰色", "size": "M" }, { "color": "灰色", "size": "L" }],
  "attributes": { "面料": "100%棉" },
  "size_chart": { "M": { "胸围": 120, "衣长": 70 } }
}
```

→ `Sudadera oversize gruesa de algodón`, categoría `sudaderas`, `100% algodón`, color `Gris`, medidas `pecho/largo` en cm.

## Clasificador de fotos

| Nivel | Coste | Qué hace bien | Límite |
|---|---|---|---|
| Heurístico (por defecto) | 0 € | Banners, baja resolución, tablas de tallas, producto sobre fondo liso, duplicados (hash + color) | Confunde modelo/maniquí/detalle, y prendas camel o beige con piel. Prendas blancas sobre fondo blanco → baja confianza |
| Claude con visión (opcional) | Por imagen, [según tarifa](https://docs.claude.com) | Distingue los 6 tipos, detecta texto chino y marcas de agua | Necesita `ANTHROPIC_API_KEY` |

Solo se manda a la IA lo que el heurístico marca con confianza < `AI_THRESHOLD` (0,6). Así pagas por una fracción de las fotos. En el panel ves el motivo y la confianza de cada foto, y con ★ fijas la portada a mano.

## Categorías y promociones

En `config/store.config.json`:
- `category_groups` y `categories` (cada categoría con su `group`). Solo se muestran las que tienen productos.
- `promotions`: texto de la barra superior, titular del inicio, código y fecha de fin de la cuenta atrás. **En V1 el código es solo informativo**: para que descuente hay que crearlo como cupón en Stripe (ver roadmap).
- El precio tachado (`compare_at_eur`) solo debe usarse si ese precio se aplicó de verdad antes.

## Precio

```
PVP = (coste_CNY × tipo + envío_unitario) × (1 + arancel) × (1 + IVA_importación) × multiplicador
```

redondeado a ,95/,99 y con mínimo. **Todos los valores de `config/store.config.json` son supuestos de ejemplo**: pon tu tipo de cambio, el envío real de tu agente y el arancel de cada prenda. El panel muestra el coste puesto y el margen bruto de cada producto.

## Publicar en Cloudflare (gratis para empezar)

1. **R2**: crea un bucket, conéctale un subdominio (`media.tudominio.es`) y pon esa URL en `images.public_base_url`.
2. **Pages**: conecta este repo. *Root directory* `catalogo-ropa`, *build command* `npm install && npm run build:prod`, *output* `dist`.
3. **Variables (Settings → Variables)**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y, si quieres avisos, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
4. **D1** (pedidos): pasos en `wrangler.toml` y `schema/orders.sql`.
5. **Stripe**: webhook a `https://tudominio.es/api/stripe-webhook` con el evento `checkout.session.completed`.

Límites del plan gratuito relevantes: 20.000 archivos por sitio en Pages (por eso las fotos van en R2), 10 GB en R2 y 100.000 peticiones al día a Functions (solo el checkout las usa; las páginas son estáticas).

## Seguridad

- El servidor **recalcula todos los precios** con el catálogo generado en el build. Lo que mande el navegador se ignora.
- Stripe Checkout alojado: no hay datos de tarjeta en tu web.
- Firma del webhook verificada (HMAC-SHA256, tolerancia 5 min).
- Cabeceras: HSTS, CSP sin `unsafe-inline`, `X-Frame-Options`, `nosniff`.
- Campo trampa anti-bots y validación de teléfono y código postal españoles.
- El panel solo escucha en `127.0.0.1`.

## Antes de vender (no es código)

- [ ] Alta de autónomo/empresa: el aviso legal exige titular y NIF reales.
- [ ] Revisar con un profesional las plantillas de `legal/` (son un punto de partida, no asesoramiento legal).
- [ ] Confirmar que el proveedor vende **diseño propio o marca blanca**, no copias de marcas.
- [ ] Composición textil real de cada prenda (obligatoria en la UE). Sin ella el sistema no deja publicar.
- [ ] Decidir qué se vende **en stock** (envío 24/48 h, admite contra reembolso) y qué **bajo pedido**.

## Estructura

```
config/store.config.json   marca, precios, envío, tamaños de foto, categorías
schema/                    JSON Schema del producto + SQL de pedidos
src/import/                crudo → producto (glosario chino→español)
src/images/                rasgos, clasificadores, orden, WebP, subida a R2
src/admin/                 panel de revisión local
src/site/                  generador de la web + plantillas + CSS/JS de la tienda
src/server/                lógica de pedidos compartida (checkout, webhook)
functions/api/             Cloudflare Pages Functions
legal/                     plantillas de páginas legales (Markdown)
tests/                     node:test
```

Siguientes pasos: [docs/ROADMAP.md](docs/ROADMAP.md).
