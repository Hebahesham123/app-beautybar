import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getShopifyLocationId } from "@/lib/shopify";
import { getShopifyAccessToken, normalizeShopDomain } from "@/lib/shopify-auth";
import { isStorefrontSyncAvailable, runStorefrontSyncToSupabase } from "@/lib/shopify-storefront";
import { isAdminRequest, isSyncSecretRequest } from "@/lib/auth-admin";

const shopDomain = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN) || process.env.SHOPIFY_SHOP_DOMAIN || "";
const API_VERSIONS = ["2024-01", "2023-10"] as const;
function adminBaseUrl(version: string) {
  return `https://${shopDomain}/admin/api/${version}`;
}
const baseUrl = adminBaseUrl("2024-01");

/**
 * Full sync: fetch all products with variants from Shopify, upsert products + variants,
 * then fetch inventory levels and upsert inventory_levels. Requires admin auth.
 */
export async function POST(request: NextRequest) {
  const allowed = (await isAdminRequest(request)) || isSyncSecretRequest(request);
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const locationId = getShopifyLocationId();
    const products: Array<{
      id: number;
      title: string;
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
    }> = [];
    let url = "/products.json?limit=250";

    const token = await getShopifyAccessToken();
    let resolvedBaseUrl = "";
    for (const version of API_VERSIONS) {
      const tryBase = adminBaseUrl(version);
      const res = await fetch(`${tryBase}${url}`, {
        headers: { "X-Shopify-Access-Token": token },
      });
      if (res.ok) {
        resolvedBaseUrl = tryBase;
        const json = await res.json();
        const list = json.products ?? [];
        products.push(...list);
        url = "";
        const linkHeader = res.headers.get("link");
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (match) url = new URL(match[1]).pathname;
        }
        break;
      }
      if (res.status === 404) continue;
      throw new Error(`Shopify products: ${res.status}`);
    }
    if (!resolvedBaseUrl) {
      throw new Error(
        "Shopify products: 404. Check SHOPIFY_SHOP_DOMAIN (e.g. jehus7-x1.myshopify.com). Ensure the app has read_products scope. Or use Sync via Storefront API."
      );
    }
    while (url) {
      const res = await fetch(`${resolvedBaseUrl}${url}`, {
        headers: { "X-Shopify-Access-Token": token },
      });
      if (!res.ok) throw new Error(`Shopify products: ${res.status}`);
      const json = await res.json();
      const list = json.products ?? [];
      products.push(...list);
      url = "";
      const linkHeader = res.headers.get("link");
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) url = new URL(match[1]).pathname;
      }
      if (list.length < 250) break;
    }

    for (const p of products) {
      const productRow = {
        shopify_product_id: String(p.id),
        title: p.title ?? "",
        body_html: p.body_html ?? null,
        handle: p.handle ?? null,
        status: p.status ?? "active",
        updated_at: new Date().toISOString(),
      };

      const { data: existingProduct } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("shopify_product_id", String(p.id))
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

      for (const v of p.variants ?? []) {
        const variantRow = {
          product_id: productId,
          shopify_variant_id: String(v.id),
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
          .eq("shopify_variant_id", String(v.id))
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
    }

    const variantIds = await supabaseAdmin.from("product_variants").select("id, shopify_inventory_item_id");
    const inventoryItemIds = (variantIds.data ?? [])
      .map((v) => v.shopify_inventory_item_id)
      .filter((id): id is number => id != null);

    let invUrl = `/inventory_levels.json?location_ids=${locationId}&limit=250`;
    const seen = new Set<string>();

    while (invUrl) {
      const json = await fetch(`${resolvedBaseUrl}${invUrl}`, {
        headers: { "X-Shopify-Access-Token": token },
      }).then((r) => r.json());
      const levels = json.inventory_levels ?? [];
      for (const l of levels) {
        const key = `${l.inventory_item_id}-${l.location_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const variant = (variantIds.data ?? []).find((v) => v.shopify_inventory_item_id === l.inventory_item_id);
        if (!variant) continue;
        await supabaseAdmin.from("inventory_levels").upsert(
          {
            variant_id: variant.id,
            shopify_location_id: l.location_id,
            shopify_inventory_item_id: l.inventory_item_id,
            on_hand: l.available ?? 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "variant_id,shopify_location_id" }
        );
      }
      const next = json.next?.link;
      invUrl = next ? new URL(next).pathname : "";
      if (levels.length < 250) break;
    }

    return NextResponse.json({ ok: true, products: products.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const tryStorefrontFallback =
      isStorefrontSyncAvailable() &&
      (message.includes("403") ||
        message.toLowerCase().includes("cloudflare") ||
        message.includes("404"));
    if (tryStorefrontFallback) {
      try {
        const result = await runStorefrontSyncToSupabase();
        return NextResponse.json({
          ok: true,
          products: result.products,
          fallback: "storefront",
        });
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : "Storefront sync failed";
        console.error("[POST /api/shopify/sync] Storefront fallback failed:", fallbackErr);
        return NextResponse.json({ error: fallbackMsg }, { status: 500 });
      }
    }
    console.error("[POST /api/shopify/sync]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
