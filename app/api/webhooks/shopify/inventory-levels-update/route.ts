import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyHmac } from "@/lib/webhooks/shopify-hmac";
import { isDuplicateWebhook } from "@/lib/webhooks/dedupe";
import { hashPayload } from "@/lib/webhooks/dedupe";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    if (!hmac || !verifyShopifyHmac(rawBody, hmac)) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      inventory_item_id?: number;
      location_id?: number;
      available?: number;
    };

    const topic = "inventory_levels/update";
    const externalId = `${payload.inventory_item_id ?? ""}-${payload.location_id ?? ""}-${request.headers.get("x-shopify-webhook-id") ?? Date.now()}`;
    const duplicate = await isDuplicateWebhook("shopify", topic, externalId, hashPayload(rawBody));
    if (duplicate) {
      return NextResponse.json({ ok: true, message: "Duplicate" });
    }

    const inventoryItemId = payload.inventory_item_id;
    const locationId = payload.location_id;
    const available = payload.available ?? 0;

    if (inventoryItemId == null || locationId == null) {
      return NextResponse.json({ ok: true, message: "Missing ids" });
    }

    const { data: variant } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("shopify_inventory_item_id", inventoryItemId)
      .single();

    if (!variant) {
      return NextResponse.json({ ok: true, message: "Variant not found for inventory item" });
    }

    const { error } = await supabaseAdmin
      .from("inventory_levels")
      .upsert(
        {
          variant_id: variant.id,
          shopify_location_id: locationId,
          shopify_inventory_item_id: inventoryItemId,
          on_hand: available,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "variant_id,shopify_location_id" }
      );

    if (error) {
      console.error("inventory_levels upsert error", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Shopify inventory_levels webhook", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
