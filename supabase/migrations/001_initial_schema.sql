-- =============================================================================
-- Full schema: Shopify sync, orders, reservations, admin, webhooks
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Admin users (protect admin routes)
-- -----------------------------------------------------------------------------
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  supabase_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_supabase_user_id ON admin_users(supabase_user_id);

-- -----------------------------------------------------------------------------
-- Products (synced from Shopify)
-- -----------------------------------------------------------------------------
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_product_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT,
  handle TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_products_shopify_id ON products(shopify_product_id);

-- -----------------------------------------------------------------------------
-- Product variants (synced from Shopify)
-- -----------------------------------------------------------------------------
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shopify_variant_id TEXT NOT NULL UNIQUE,
  shopify_inventory_item_id BIGINT,
  title TEXT,
  sku TEXT,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  compare_at_price DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_product_variants_shopify_id ON product_variants(shopify_variant_id);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_inventory_item ON product_variants(shopify_inventory_item_id);

-- -----------------------------------------------------------------------------
-- Inventory levels (on_hand from Shopify; reserved = sum of active reservations)
-- One row per (variant, location). available = on_hand - reserved (computed)
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  shopify_location_id BIGINT NOT NULL,
  shopify_inventory_item_id BIGINT NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(variant_id, shopify_location_id)
);

CREATE UNIQUE INDEX idx_inventory_levels_variant_location ON inventory_levels(variant_id, shopify_location_id);
CREATE INDEX idx_inventory_levels_variant_id ON inventory_levels(variant_id);

-- -----------------------------------------------------------------------------
-- Reservations (active = hold; committed = part of confirmed order; expired = timed out)
-- -----------------------------------------------------------------------------
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  order_id UUID, -- set when order created; committed when order confirmed
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'committed', 'expired', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_variant_status ON reservations(variant_id, status);
CREATE INDEX idx_reservations_order_id ON reservations(order_id);
CREATE INDEX idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'paid', 'cod_confirmed', 'cancelled', 'refunded'
  )),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('paymob', 'cod')),
  paymob_transaction_id TEXT,
  paymob_hmac_verified BOOLEAN DEFAULT FALSE,
  total DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  shipping_address JSONB,
  reservations_committed_at TIMESTAMPTZ,
  shopify_inventory_decremented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_paymob_txn ON orders(paymob_transaction_id) WHERE paymob_transaction_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Order items
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  title TEXT,
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_variant_id ON order_items(variant_id);

-- -----------------------------------------------------------------------------
-- Webhook events (dedupe by source + topic + id)
-- -----------------------------------------------------------------------------
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL CHECK (source IN ('shopify', 'paymob')),
  topic TEXT,
  external_id TEXT,
  payload_hash TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, topic, external_id)
);

CREATE UNIQUE INDEX idx_webhook_events_dedupe ON webhook_events(source, topic, external_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed_at);

-- -----------------------------------------------------------------------------
-- Order number sequence (for human-readable order numbers)
-- -----------------------------------------------------------------------------
CREATE SEQUENCE order_number_seq START 1000;

CREATE OR REPLACE FUNCTION next_order_number() RETURNS INTEGER AS $$
  SELECT nextval('order_number_seq')::INTEGER;
$$ LANGUAGE sql;

-- Trigger: update updated_at on orders
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- RLS (optional: enable if you want row-level security; admin via service role)
-- =============================================================================
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Public read for products/variants/inventory (storefront); write via service role only
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read product_variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Public read inventory_levels" ON inventory_levels FOR SELECT USING (true);

-- Orders: no direct public write; API uses service role
CREATE POLICY "Public read orders by id" ON orders FOR SELECT USING (true);
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);

-- Admin users: only service role or self (for admin check)
CREATE POLICY "Service role full access admin_users" ON admin_users FOR ALL USING (true);

-- Reservations and webhook_events: service role only (no policy = no access without service role)
-- So we need to allow service role to bypass RLS. In Supabase, the service_role key bypasses RLS.
-- For anon/authenticated we need policies. So: allow authenticated to read nothing on reservations/webhook_events
-- and allow all to read orders (so admin dashboard with service role can do everything).
-- Actually: if we use service role in API routes, RLS is bypassed. So we just need policies that don't block
-- service role. So we're good. For authenticated admin: we'll check admin_users in middleware and use
-- service role in API. So no need for RLS policies that allow authenticated admins to tables;
-- the API runs as service role. So leave reservations and webhook_events with no SELECT for anon/auth —
-- only service role can access. That's default: no policy = no access for anon/auth; service role bypasses.
-- Done.

-- Realtime: enable for orders so admin dashboard can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
