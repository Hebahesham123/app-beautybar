import { NextRequest, NextResponse } from "next/server";
import { isSyncSecretRequest } from "@/lib/auth-admin";
import {
  isStorefrontSyncAvailable,
  runStorefrontSyncToSupabase,
} from "@/lib/shopify-storefront";

/**
 * Cron endpoint for automatic/scheduled sync.
 * Call with GET ?secret=YOUR_SYNC_SECRET or header x-sync-secret: YOUR_SYNC_SECRET.
 * Set SYNC_SECRET in env and schedule this URL (e.g. Vercel Cron, cron-job.org) every hour or daily.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const hasSecret =
    (process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET) ||
    isSyncSecretRequest(request);

  if (!hasSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStorefrontSyncAvailable()) {
    return NextResponse.json(
      {
        error:
          "Storefront sync not configured. Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runStorefrontSyncToSupabase();
    return NextResponse.json({ ok: true, products: result.products });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("[GET /api/cron/shopify-sync]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST with x-sync-secret header (same as GET ?secret=). */
export async function POST(request: NextRequest) {
  if (!isSyncSecretRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStorefrontSyncAvailable()) {
    return NextResponse.json(
      {
        error:
          "Storefront sync not configured. Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runStorefrontSyncToSupabase();
    return NextResponse.json({ ok: true, products: result.products });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("[POST /api/cron/shopify-sync]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
