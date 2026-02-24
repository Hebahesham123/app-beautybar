import { NextRequest, NextResponse } from "next/server";
import {
  isStorefrontSyncAvailable,
  runStorefrontSyncToSupabase,
} from "@/lib/shopify-storefront";
import { isAdminRequest } from "@/lib/auth-admin";

/**
 * Sync products, variants, and inventory from Shopify using the Storefront API.
 * Uses SHOPIFY_STOREFRONT_ACCESS_TOKEN (no token exchange → no 403 from Cloudflare).
 * Requires admin auth.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStorefrontSyncAvailable()) {
    return NextResponse.json(
      {
        error:
          "Storefront sync requires SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN. " +
          "In Shopify Admin: Settings → Apps and sales channels → Develop apps → your app → API credentials → Storefront API access token.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runStorefrontSyncToSupabase();
    return NextResponse.json({ ok: true, products: result.products });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("[POST /api/shopify/sync-storefront]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET: report whether Storefront sync is available (so UI can show the option). */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ available: isStorefrontSyncAvailable() });
}
