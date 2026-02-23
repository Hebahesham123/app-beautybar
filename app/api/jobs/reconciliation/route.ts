import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/auth-admin";

/**
 * Reconciliation: compare our inventory_levels.on_hand with active reservations,
 * and optionally flag orders that are stuck (e.g. pending_payment for too long).
 * Returns summary counts for manual review.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: levels } = await supabaseAdmin
      .from("inventory_levels")
      .select("id, variant_id, on_hand");

    const { data: reserved } = await supabaseAdmin
      .from("reservations")
      .select("variant_id, quantity")
      .eq("status", "active");

    const reservedByVariant = new Map<string, number>();
    for (const r of reserved ?? []) {
      reservedByVariant.set(r.variant_id, (reservedByVariant.get(r.variant_id) ?? 0) + r.quantity);
    }

    const negative: { variant_id: string; on_hand: number; reserved: number }[] = [];
    for (const l of levels ?? []) {
      const res = reservedByVariant.get(l.variant_id) ?? 0;
      if (l.on_hand - res < 0) {
        negative.push({ variant_id: l.variant_id, on_hand: l.on_hand, reserved: res });
      }
    }

    const { data: stuckOrders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, created_at")
      .eq("status", "pending_payment")
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    return NextResponse.json({
      ok: true,
      negative_availability_count: negative.length,
      negative_availability: negative.slice(0, 50),
      stuck_pending_payment_count: stuckOrders?.length ?? 0,
      stuck_orders: (stuckOrders ?? []).slice(0, 20),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconciliation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
