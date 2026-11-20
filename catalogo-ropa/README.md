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
npm test            # 18 tests
```

La demo incluye a propósito una camisa **sin composición**: el sistema no deja publicarla hasta que la completes en el panel.

## Flujo real

| Paso | Comando | Qué hace |
|---|---|---|
| 1. Exportar | Sourcebase o `npm run yupoo -- <url>` | Guarda un JSON por tienda/artículo en `data/raw/` con el [formato crudo](src/import/from-raw.js) |
| 2. Importar | `npm run import` | Crea borradores en `data/products/` con título provisional en español, categoría, variantes, composición, medidas y precio sugerido |
| 3. Fotos | `npm run images -- --all` | Descarga, detecta duplicados, clasifica, ordena y genera WebP 3:4 (480/900/1600 px) |
| 4. Revisar | `npm run admin` | Corrige lo dudoso y aprueba (en lote o una a una) |
| 5. Validar | `npm run validate` | Lista errores/avisos de todo el catálogo |
| 6. Fotos a R2 | `npm run upload` | Sube los WebP a Cloudflare R2 (solo los nuevos) |
| 7. Publicar | `npm run build:prod` | Genera `dist/` con fotos servidas desde R2 |

### Importar desde Yupoo

```bash
npm run yupoo -- https://TIENDA.x.yupoo.com/albums/123456        # un álbum
npm run yupoo -- https://TIENDA.x.yupoo.com/albums                # la tienda entera: TODOS los álbumes
npm run yupoo -- https://TIENDA.x.yupoo.com/categories/7890       # una categoría
npm run images -- --pending                                       # luego, las fotos (solo las nuevas)
```

Cada álbum se convierte en un producto en borrador: título, fotos (en tamaño grande), y del texto del álbum saca precio (¥/RMB/元), tallas (`S-XL`, `M L XL`, `尺码…`), colores y composición. Lo que no venga en el álbum (Yupoo no tiene variantes estructuradas) se completa en el panel: colores, tallas y disponibilidad son editables y regeneran las variantes.

- Cada álbum de Yupoo es un artículo. Sin límite: carga todos al catálogo y tú eliges en el panel cuáles aprobar. `--limit N` solo para pruebas.
- Va despacio a propósito (≈1–1,5 s por álbum, unos 10 min por cada 500) para que Yupoo no bloquee.
- Guarda cada 25 artículos: si se corta, vuelve a lanzarlo y salta los que ya están en el catálogo.
- Álbumes privados o con contraseña no se pueden leer.
- `--html archivo.html` permite importar un álbum guardado desde el navegador si Yupoo bloquea las peticiones.
- **Probado con páginas de ejemplo, no contra Yupoo en vivo**: si cambian su HTML, los ajustes están en `src/import/yupoo.js`.
- Muchos catálogos de Yupoo son réplicas de marcas: importa solo los de tu proveedor de marca blanca.

### Proveedores

Cada importación registra su proveedor en `data/suppliers.json` (Yupoo: la tienda; Sourcebase/Weidian: el ID de tienda) y cada producto guarda `source.supplier_id`.

- **Panel**: desplegable «Todos los proveedores» → al elegir uno ves su ficha (nombre editable, enlace a su tienda, artículos por estado, última importación y notas: contacto, plazos, calidad de muestras) y solo sus artículos. «Seleccionar los visibles» + «Aprobar» aprueba de golpe lo filtrado.
- **Terminal**: `npm run proveedores` lista todos con sus cifras; `--proveedor <id>` limita `approve`, `images` o `validate` a uno: `node src/cli.js approve --proveedor yupoo-tienda`.

### Exportar a Shopify (CSV masivo)

Si prefieres vender en Shopify en lugar de la web propia, el flujo de importación, fotos y panel es el mismo y al final sacas un CSV:

```bash
npm run yupoo -- https://TIENDA.x.yupoo.com/albums --limit 100   # o Sourcebase
npm run images -- --all
npm run admin                       # revisa y aprueba
npm run shopify                     # genera JPG para Shopify + export/shopify-AAAA-MM-DD.csv
npm run upload                      # sube las fotos a R2 (Shopify las descarga de ahí)
```

Después, en Shopify: **Productos → Importar → sube el CSV**.

- Formato de columnas actual de Shopify (`URL handle`, `Option1 name`, `Product image URL`…), con opciones **Color** y **Talla**, una fila por variante y filas extra para el resto de fotos.
- Incluye precio, precio tachado, coste por artículo (según tu fórmula), peso estimado por categoría, etiquetas (grupo, categoría, colores, `Oferta`) y descripción con composición y tabla de medidas.
- Productos aprobados → `active`; con `--include-drafts` también sube los borradores como `draft`.
- En stock → Shopify controla el inventario (empieza a 0, pon la cantidad real); bajo pedido → sin control de inventario.
- **Fotos**: Shopify las descarga de una URL pública. Con `--images r2` (por defecto) usa tu bucket R2. Con `--images source` usa las URLs del proveedor, pero **Yupoo bloquea esas descargas**: para Yupoo, usa R2.
- Archivos de más de 14 MB se parten en varios CSV automáticamente.
- Pesos por categoría y coste por artículo son estimaciones: revísalos.

### Importar desde Sourcebase

```bash
npm run sourcebase -- "C:\Users\roger\Downloads\Sourcebase\server\data\catalog.json" --store 1407325822 --limit 100
```

Lee el `catalog.json` de Sourcebase (filtra por `--store`, `--q` o `--ids`) y crea borradores con título, precio, fotos y variantes (color/talla a partir de los SKU).

- **Filtro de marcas siempre activo**: descarta todo producto en el que el diccionario de Sourcebase (`tagger.js`) detecte una marca o modelo, o con expresiones de réplica (三标齐全, 1:1, 复刻, 原版…). Los descartados quedan listados en `data/raw/sourcebase-descartados-*.json`. Revisa igualmente cada producto: el filtro reduce el riesgo, no lo elimina.
- Sourcebase guarda solo 1–3 fotos por artículo del listado de la tienda y muchas variantes quedan «pendientes»: completa tallas y colores en el panel, o usa Yupoo si el proveedor tiene álbum con más fotos.

### Conectar Sourcebase (formato crudo genérico)

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
