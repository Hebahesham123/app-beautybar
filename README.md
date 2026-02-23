# Shopify + Supabase Checkout (Next.js 14)

Full Next.js 14 (App Router) TypeScript app with Supabase Postgres + Realtime. Syncs products/variants/inventory from Shopify, provides Paymob (iframe) and COD checkout, stores orders in Supabase, and includes an Admin Dashboard with realtime order updates.

## Features

- **Shopify sync**: Products, variants, and inventory levels synced to Supabase (full sync API + webhooks).
- **Inventory reservations**: `available = on_hand (Shopify) - reserved (active reservations)` to prevent overselling.
- **Checkout**: Paymob (card via iFrame) and COD. Paymob init creates order + reservations and returns iframe URL; Paymob webhook verifies HMAC, marks order paid, commits reservations, and decrements Shopify inventory.
- **COD**: Creates order and commits reservations immediately, then decrements Shopify inventory.
- **Admin dashboard**: `/admin/orders` and `/admin/orders/[id]` with Supabase Realtime so new/updated orders appear instantly.
- **Admin auth**: Cookie-based login with `ADMIN_SECRET`, or Supabase Auth + `admin_users` table.
- **Shopify webhooks**: `inventory_levels/update` and `products/update` with HMAC verification and dedupe (`webhook_events`).
- **Jobs**: Reservation expiry and reconciliation (call as POST with admin auth).

## Setup

### 1. Database

Run the Supabase migration:

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL file manually in Supabase SQL Editor
# supabase/migrations/001_initial_schema.sql
```

Ensure **Realtime** is enabled for the `orders` table (the migration adds it to the publication).

### 2. Environment

Copy `.env.local.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Shopify**: `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_LOCATION_ID`, `SHOPIFY_WEBHOOK_SECRET`, and **either**:
  - **Option A (legacy):** `SHOPIFY_ACCESS_TOKEN` — from an existing custom app (no new legacy apps after Jan 2026), or
  - **Option B (Dev Dashboard):** `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` — see [Shopify auth (Dev Dashboard)](#shopify-auth-dev-dashboard) below
- `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET`, `PAYMOB_IFRAME_URL`
- `NEXT_PUBLIC_APP_URL` (e.g. `https://your-app.com`)
- `ADMIN_SECRET` (for admin login and job endpoints)

### 3. Sync products and inventory from Shopify

**Option A – Full sync (one-time or manual)**

1. In **Admin**, go to **Sync Shopify** (`/admin/sync`) and click **Sync now** (you must be logged in).
2. Or call the API with admin auth:
   ```bash
   curl -X POST https://your-app.com/api/shopify/sync \
     -H "Cookie: admin_authorized=1"   # or use x-admin-key: YOUR_ADMIN_SECRET
   ```
   This pulls all products, variants, and inventory levels from Shopify into Supabase.

**Option B – Webhooks (ongoing sync)**

Register webhooks in **Shopify Admin** → **Settings** → **Notifications** → **Webhooks**:

| Event | Callback URL |
|-------|----------------|
| **inventory_levels/update** | `https://your-app.com/api/webhooks/shopify/inventory-levels-update` |
| **products/update** | `https://your-app.com/api/webhooks/shopify/products-update` |

Set the webhook secret in Shopify to match `SHOPIFY_WEBHOOK_SECRET` in `.env.local` (used for HMAC verification).

- **products/update** keeps products and variants in sync when you change them in Shopify.
- **inventory_levels/update** keeps stock (`on_hand`) in sync when inventory changes.

**Recommended:** Run a **full sync** once, then rely on **webhooks** so new/updated products and inventory stay in sync automatically.

### Shopify auth (Dev Dashboard)

As of January 2026, new **legacy custom apps** can no longer be created. For new setups, use a **Dev Dashboard** app with **client credentials**:

1. Go to [Dev Dashboard](https://dev.shopify.com/dashboard/) → **Create app** → **Start from Dev Dashboard**.
2. Create a version: set **Access scopes** (e.g. `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_locations`), and set **App URL** (can be a placeholder if you only use API).
3. **Install** the app on your store (store must be in the same organization).
4. In the app **Settings**, copy **Client ID** and **Client secret**.
5. In `.env.local` set:
   - `SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com`
   - `SHOPIFY_CLIENT_ID=<Client ID>`
   - `SHOPIFY_CLIENT_SECRET=<Client secret>`
   - Do **not** set `SHOPIFY_ACCESS_TOKEN`.

The app will exchange these for a short-lived access token (24h) and refresh it automatically. If you already have a legacy custom app, keep using `SHOPIFY_ACCESS_TOKEN` and leave the client ID/secret unset.

**If you get 403 "Verifying your connection" (Cloudflare) and you only have Client ID/Secret:** Shopify’s token endpoint often blocks requests from local or home networks. **Workaround:** Deploy this app (e.g. to [Vercel](https://vercel.com)) with the same env vars (`SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_LOCATION_ID`, Supabase, etc.), then open the **deployed** app → Admin → Sync Shopify and click **Sync now**. The token request from the deployed server usually succeeds. You can keep developing locally; run sync from the deployed URL when needed.

### 4. Paymob

- Configure your Paymob iframe and HMAC secret.
- Set the callback URL to `https://your-app.com/api/webhooks/paymob` (or whatever Paymob expects for server callbacks).

### 5. Admin users (optional)

To use Supabase Auth for admin instead of (or in addition to) `ADMIN_SECRET`:

- Insert rows into `admin_users` with the email of each admin.
- When calling admin API or loading admin pages, send `Authorization: Bearer <supabase_jwt>`.

## API Overview

| Route | Method | Description |
|-------|--------|-------------|
| `/api/checkout/paymob-init` | POST | Create order + reservations; returns `iframe_url`, `order_id`, `order_number`. |
| `/api/checkout/cod` | POST | Create order, commit reservations, decrement Shopify inventory. |
| `/api/webhooks/paymob` | POST | Paymob callback: verify HMAC, mark paid, commit reservations, decrement Shopify. |
| `/api/webhooks/shopify/inventory-levels-update` | POST | Sync inventory level (HMAC + dedupe). |
| `/api/webhooks/shopify/products-update` | POST | Sync product + variants (HMAC + dedupe). |
| `/api/shopify/sync` | POST | Full sync of products, variants, inventory from Shopify. |
| `/api/admin/orders` | GET | List orders (admin auth). |
| `/api/admin/orders/[id]` | GET, PATCH | Order detail, update status (admin auth). |
| `/api/admin/login` | POST | Login with `ADMIN_SECRET`; sets cookie for admin UI. |
| `/api/jobs/reservation-expiry` | POST | Expire active reservations past TTL (admin auth). |
| `/api/jobs/reconciliation` | POST | Report negative availability and stuck orders (admin auth). |

All checkout and webhook inputs are validated with Zod.

## Run

```bash
npm install
npm run dev
```

- Home: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/orders` (log in at `/admin/login` with `ADMIN_SECRET`)

## Inventory flow

1. **Available** = `inventory_levels.on_hand` (from Shopify) − sum of **active** reservations.
2. **Paymob**: Init creates order + active reservations → customer pays → webhook commits reservations and decrements Shopify inventory.
3. **COD**: Order created, reservations created and committed immediately, then Shopify inventory decremented.
4. Reservations expire after 15 minutes if not committed (run `/api/jobs/reservation-expiry` periodically).
