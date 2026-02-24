import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getShopifyLocationId } from "@/lib/shopify";
import {
  fetchStorefrontProducts,
  isStorefrontSyncAvailable,
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
    const locationId = getShopifyLocationId();
    const products = await fetchStorefrontProducts();

    for (const p of products) {
      const productRow = {
        shopify_product_id: p.shopify_product_id,
        title: p.title,
        body_html: p.body_html,
        handle: p.handle,
        status: "active",
        updated_at: new Date().toISOString(),
      };

      const { data: existingProduct } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("shopify_product_id", p.shopify_product_id)
        .single();

      let productId: string;
      if (existingProduct) {
        await supabaseAdmin.from("products").update(productRow).eq("id", existingProduct.id);
        productId = existingProduct.id;
      } else {
        const { data: inserted, error } = await supabaseAdmin
          .from("products")
          .insert({ ...productRow, created_at: new Date().toISOString() })
          .select("id")
          .single();
        if (error || !inserted) throw new Error("Product insert failed");
        productId = inserted.id;
      }

      for (const v of p.variants) {
        const variantRow = {
          product_id: productId,
          shopify_variant_id: v.shopify_variant_id,
          shopify_inventory_item_id: null,
          title: v.title,
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compare_at_price,
          updated_at: new Date().toISOString(),
        };
        const { data: existingV } = await supabaseAdmin
          .from("product_variants")
          .select("id")
          .eq("shopify_variant_id", v.shopify_variant_id)
          .single();

        if (existingV) {
          await supabaseAdmin.from("product_variants").update(variantRow).eq("id", existingV.id);
        } else {
          const { data: insertedV, error: errV } = await supabaseAdmin
            .from("product_variants")
            .insert({ ...variantRow, created_at: new Date().toISOString() })
            .select("id")
            .single();
          if (errV || !insertedV) throw new Error("Variant insert failed");
        }

        const { data: variantRow2 } = await supabaseAdmin
          .from("product_variants")
          .select("id")
          .eq("shopify_variant_id", v.shopify_variant_id)
          .single();
        if (variantRow2) {
          await supabaseAdmin.from("inventory_levels").upsert(
            {
              variant_id: variantRow2.id,
              shopify_location_id: locationId,
              shopify_inventory_item_id: 0,
              on_hand: v.quantity_available,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "variant_id,shopify_location_id" }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, products: products.length });
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
