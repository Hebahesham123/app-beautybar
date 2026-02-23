import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyPaymobHmac, buildPaymobConcatenatedString } from "@/lib/paymob";
import { commitReservations, releaseReservationsForOrder } from "@/lib/inventory";
import { isDuplicateWebhook } from "@/lib/webhooks/dedupe";
import { getShopifyLocationId } from "@/lib/shopify";
import { adjustShopifyInventoryRest } from "@/lib/shopify";

/**
 * Paymob callback (webhook): verify HMAC, mark order paid, commit reservations,
 * decrement Shopify inventory.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let params: Record<string, string>;
    if (contentType.includes("application/json")) {
      const body = await request.json();
      params = body as Record<string, string>;
    } else {
      const form = await request.formData();
      params = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }

    const receivedHmac = params.hmac;
    if (!receivedHmac) {
      return NextResponse.json({ error: "Missing hmac" }, { status: 400 });
    }

    const concatenated = buildPaymobConcatenatedString(params);
    if (!verifyPaymobHmac(concatenated, receivedHmac)) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }

    const orderId = params.merchant_order_id || params.order_id;
    const txnId = params.id || params.transaction_id;
    const success = String(params.success) === "true";

    if (!orderId) {
      return NextResponse.json({ error: "Missing order reference" }, { status: 400 });
    }

    const externalId = `${orderId}-${txnId || Date.now()}`;
    const duplicate = await isDuplicateWebhook("paymob", "payment_callback", externalId);
    if (duplicate) {
      return NextResponse.json({ ok: true, message: "Already processed" });
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_method")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "pending_payment") {
      return NextResponse.json({ ok: true, message: "Order already processed" });
    }

    if (!success) {
      await releaseReservationsForOrder(order.id);
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      return NextResponse.json({ ok: true, message: "Payment failed, reservations released" });
    }

    await commitReservations(order.id);
    await supabaseAdmin
      .from("orders")
      .update({
        status: "paid",
        paymob_transaction_id: txnId ?? null,
        paymob_hmac_verified: true,
        reservations_committed_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    const locationId = getShopifyLocationId();
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("variant_id, quantity")
      .eq("order_id", order.id);

    const { data: levels } = await supabaseAdmin
      .from("inventory_levels")
      .select("variant_id, shopify_inventory_item_id, shopify_location_id")
      .eq("shopify_location_id", locationId)
      .in("variant_id", (orderItems ?? []).map((i) => i.variant_id));

    for (const item of orderItems ?? []) {
      const level = levels?.find((l) => l.variant_id === item.variant_id);
      if (level?.shopify_inventory_item_id) {
        try {
          await adjustShopifyInventoryRest(
            level.shopify_inventory_item_id,
            level.shopify_location_id,
            -item.quantity
          );
        } catch (shopifyErr) {
          console.error("Shopify decrement failed", item.variant_id, shopifyErr);
        }
      }
    }

    await supabaseAdmin
      .from("orders")
      .update({ shopify_inventory_decremented_at: new Date().toISOString() })
      .eq("id", order.id);

    return NextResponse.json({ ok: true, order_id: order.id, status: "paid" });
  } catch (e) {
    console.error("Paymob webhook error", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
