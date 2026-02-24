import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyHmac } from "@/lib/webhooks/shopify-hmac";
import { isDuplicateWebhook } from "@/lib/webhooks/dedupe";
import { hashPayload } from "@/lib/webhooks/dedupe";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Same payload shape as products/update. Creates product + variants in Supabase when a product is created in Shopify. */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    if (!hmac || !verifyShopifyHmac(rawBody, hmac)) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      id?: number;
      title?: string;
      body_html?: string;
      handle?: string;
      status?: string;
      variants?: Array<{
        id: number;
        inventory_item_id?: number;
        title?: string;
        sku?: string;
        price?: string;
        compare_at_price?: string;
      }>;
    };

    const topic = "products/create";
    const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
    const externalId = `${payload.id ?? ""}-${webhookId}`;
    const duplicate = await isDuplicateWebhook("shopify", topic, externalId, hashPayload(rawBody));
    if (duplicate) {
      return NextResponse.json({ ok: true, message: "Duplicate" });
    }

    const shopifyProductId = String(payload.id);
    if (!shopifyProductId) return NextResponse.json({ ok: true, message: "No product id" });

    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("shopify_product_id", shopifyProductId)
      .single();

    const productRow = {
      shopify_product_id: shopifyProductId,
      title: payload.title ?? "",
      body_html: payload.body_html ?? null,
      handle: payload.handle ?? null,
      status: payload.status ?? "active",
      updated_at: new Date().toISOString(),
    };

    let productId: string;
    if (existing) {
      await supabaseAdmin.from("products").update(productRow).eq("id", existing.id);
      productId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("products")
        .insert({ ...productRow, created_at: new Date().toISOString() })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        return NextResponse.json({ error: "Product insert failed" }, { status: 500 });
      }
      productId = inserted.id;
    }

    const variants = payload.variants ?? [];
    for (const v of variants) {
      const shopifyVariantId = String(v.id);
      const variantRow = {
        product_id: productId,
        shopify_variant_id: shopifyVariantId,
        shopify_inventory_item_id: v.inventory_item_id ?? null,
        title: v.title ?? null,
        sku: v.sku ?? null,
        price: v.price ?? "0",
        compare_at_price: v.compare_at_price ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data: existingV } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("shopify_variant_id", shopifyVariantId)
        .single();

      if (existingV) {
        await supabaseAdmin.from("product_variants").update(variantRow).eq("id", existingV.id);
      } else {
        await supabaseAdmin.from("product_variants").insert({
          ...variantRow,
          created_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Shopify products/create webhook", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
