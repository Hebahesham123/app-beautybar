import { NextRequest, NextResponse } from "next/server";
import { codCheckoutSchema } from "@/lib/validations/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createReservations, commitReservations } from "@/lib/inventory";
import { generateOrderNumber } from "@/lib/orders";
import { getShopifyLocationId } from "@/lib/shopify";
import { adjustShopifyInventoryRest } from "@/lib/shopify";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = codCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { items, customer_email, customer_phone, customer_name, shipping_address } = parsed.data;
    const locationId = getShopifyLocationId();

    const variantIds = Array.from(new Set(items.map((i) => i.variant_id)));
    const { data: variantsData, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, price, title, sku, shopify_inventory_item_id")
      .in("id", variantIds);

    if (variantsError || !variantsData?.length) {
      return NextResponse.json({ error: "Invalid variant(s)" }, { status: 400 });
    }

    type VariantRow = { id: string; price: string; title: string | null; sku: string | null; shopify_inventory_item_id: number | null };
    const variants = variantsData as VariantRow[];
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    let total = 0;
    const orderItems: { variant_id: string; quantity: number; unit_price: string; title: string | null; sku: string | null }[] = [];
    for (const item of items) {
      const v = variantMap.get(item.variant_id);
      if (!v) return NextResponse.json({ error: `Variant not found: ${item.variant_id}` }, { status: 400 });
      const qty = item.quantity;
      const price = parseFloat(v.price);
      total += price * qty;
      orderItems.push({
        variant_id: v.id,
        quantity: qty,
        unit_price: v.price,
        title: v.title,
        sku: v.sku,
      });
    }

    const orderNumber = await generateOrderNumber();

    // Create order as cod_confirmed (we commit immediately)
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        status: "cod_confirmed",
        payment_method: "cod",
        total: String(total.toFixed(2)),
        currency: "EGP",
        customer_email,
        customer_phone,
        customer_name,
        shipping_address: shipping_address ?? null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Create and immediately commit reservations
    await createReservations(order.id, items, locationId);
    await commitReservations(order.id);

    await supabaseAdmin.from("orders").update({
      reservations_committed_at: new Date().toISOString(),
    }).eq("id", order.id);

    await supabaseAdmin.from("order_items").insert(
      orderItems.map((o) => ({ ...o, order_id: order.id }))
    );

    // Decrement Shopify inventory for each variant
    const { data: levels } = await supabaseAdmin
      .from("inventory_levels")
      .select("variant_id, shopify_inventory_item_id, shopify_location_id")
      .in("variant_id", variantIds)
      .eq("shopify_location_id", locationId);

    for (const item of items) {
      const level = levels?.find((l) => l.variant_id === item.variant_id);
      if (level?.shopify_inventory_item_id) {
        try {
          await adjustShopifyInventoryRest(
            level.shopify_inventory_item_id,
            level.shopify_location_id,
            -item.quantity
          );
        } catch (shopifyErr) {
          console.error("Shopify inventory decrement failed for variant", item.variant_id, shopifyErr);
        }
      }
    }

    await supabaseAdmin.from("orders").update({
      shopify_inventory_decremented_at: new Date().toISOString(),
    }).eq("id", order.id);

    return NextResponse.json({
      order_id: order.id,
      order_number: orderNumber,
      status: "cod_confirmed",
      total,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "COD checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
