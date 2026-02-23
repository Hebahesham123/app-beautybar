import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAvailableForVariant } from "@/lib/inventory";

/** GET /api/products - list products with variants and available quantity */
export async function GET() {
  try {
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, title, body_html, handle, status")
      .eq("status", "active")
      .order("title");

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    if (!products?.length) {
      return NextResponse.json({ products: [], variantsByProduct: {} });
    }

    const productIds = products.map((p) => p.id);
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, title, sku, price, compare_at_price")
      .in("product_id", productIds)
      .order("product_id");

    if (variantsError) {
      return NextResponse.json({ error: variantsError.message }, { status: 500 });
    }

    const variantsWithAvailable = await Promise.all(
      (variants ?? []).map(async (v) => ({
        ...v,
        available: await getAvailableForVariant(v.id),
      }))
    );

    const variantsByProduct: Record<string, typeof variantsWithAvailable> = {};
    for (const v of variantsWithAvailable) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    }

    return NextResponse.json({
      products: products ?? [],
      variantsByProduct,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
