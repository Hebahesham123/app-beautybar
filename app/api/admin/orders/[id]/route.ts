import { NextRequest, NextResponse } from "next/server";
import { adminOrderUpdateSchema } from "@/lib/validations/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/auth-admin";
import { getShopifyLocationId, adjustShopifyInventoryRest } from "@/lib/shopify";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("id, variant_id, quantity, unit_price, title, sku")
    .eq("order_id", id);

  return NextResponse.json({ order, items: items ?? [] });
}

/** Decrement Shopify inventory for an order that was just confirmed (paid / cod_confirmed). */
async function decrementShopifyInventoryForOrder(orderId: string): Promise<void> {
  const locationId = getShopifyLocationId();
  const { data: orderItems } = await supabaseAdmin
    .from("order_items")
    .select("variant_id, quantity")
    .eq("order_id", orderId);
  if (!orderItems?.length) return;

  const variantIds = orderItems.map((i) => i.variant_id);
  const { data: levels } = await supabaseAdmin
    .from("inventory_levels")
    .select("variant_id, shopify_inventory_item_id, shopify_location_id")
    .eq("shopify_location_id", locationId)
    .in("variant_id", variantIds);

  for (const item of orderItems) {
    const level = levels?.find((l) => l.variant_id === item.variant_id);
    if (level?.shopify_inventory_item_id) {
      try {
        await adjustShopifyInventoryRest(
          level.shopify_inventory_item_id,
          level.shopify_location_id,
          -item.quantity
        );
      } catch (err) {
        console.error("Shopify inventory decrement failed for order", orderId, "variant", item.variant_id, err);
      }
    }
  }

  await supabaseAdmin
    .from("orders")
    .update({ shopify_inventory_decremented_at: new Date().toISOString() })
    .eq("id", orderId);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = adminOrderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const newStatus = parsed.data.status;
  const { data: orderBefore } = await supabaseAdmin
    .from("orders")
    .select("shopify_inventory_decremented_at")
    .eq("id", id)
    .single();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shouldDecrement =
    (newStatus === "paid" || newStatus === "cod_confirmed") &&
    !orderBefore?.shopify_inventory_decremented_at;
  if (shouldDecrement) {
    try {
      await decrementShopifyInventoryForOrder(id);
    } catch (e) {
      console.error("Admin order status: Shopify decrement failed", id, e);
    }
  }

  return NextResponse.json({ order: data });
}
