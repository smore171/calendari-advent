-- Base de datos D1 de pedidos.
-- Crear:  npx wrangler d1 create catalogo-ropa
-- Aplicar: npx wrangler d1 execute catalogo-ropa --remote --file=schema/orders.sql
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  status         TEXT NOT NULL,          -- pending_confirmation | awaiting_payment | paid | confirmed | shipped | delivered | rejected | cancelled
  method         TEXT NOT NULL,          -- card | cod
  customer_json  TEXT NOT NULL,
  lines_json     TEXT NOT NULL,
  subtotal       REAL NOT NULL,
  shipping       REAL NOT NULL,
  cod_fee        REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL,
  stripe_session TEXT,
  paid_at        TEXT,
  tracking       TEXT,
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
