import { NextRequest, NextResponse } from "next/server";
import { paymobInitSchema } from "@/lib/validations/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createReservations } from "@/lib/inventory";
import { generateOrderNumber } from "@/lib/orders";
import { getPaymobIframeUrl } from "@/lib/paymob";
import { getShopifyLocationId } from "@/lib/shopify";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = paymobInitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { items, customer_email, customer_phone, customer_name, shipping_address, success_url, cancel_url } =
      parsed.data;
    const locationId = getShopifyLocationId();

    // Resolve variants and compute total
    const variantIds = Array.from(new Set(items.map((i) => i.variant_id)));
    const { data: variantsData, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, price, title, sku")
      .in("id", variantIds);

    if (variantsError || !variantsData?.length) {
      return NextResponse.json({ error: "Invalid variant(s)" }, { status: 400 });
    }

    type VariantRow = { id: string; price: string; title: string | null; sku: string | null };
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

    // Create order (pending_payment)
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        status: "pending_payment",
        payment_method: "paymob",
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

    // Create reservations (active), linked to order
    await createReservations(order.id, items, locationId);

    // Insert order_items
    await supabaseAdmin.from("order_items").insert(
      orderItems.map((o) => ({ ...o, order_id: order.id }))
    );

    // Paymob iframe URL (amount in cents for EGP, 1 EGP = 100 cents if they use piasters, else 1:1)
    const amountCents = Math.round(total * 100);
    const iframeUrl = await getPaymobIframeUrl({
      orderId: order.id,
      orderNumber,
      amountCents,
      customerEmail: customer_email,
      customerName: customer_name,
      successUrl: success_url,
      cancelUrl: cancel_url,
    });

    return NextResponse.json({
      order_id: order.id,
      order_number: orderNumber,
      iframe_url: iframeUrl,
      total,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Paymob init failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
