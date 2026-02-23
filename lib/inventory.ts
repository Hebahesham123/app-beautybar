import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ReservationStatus = Database["public"]["Tables"]["reservations"]["Row"]["status"];

const RESERVATION_TTL_MINUTES = 15;

/** Get available quantity: on_hand (from Shopify) - sum(active reservations) per variant/location */
export async function getAvailableQuantity(variantId: string, locationId: number): Promise<number> {
  const { data: level } = await supabaseAdmin
    .from("inventory_levels")
    .select("on_hand")
    .eq("variant_id", variantId)
    .eq("shopify_location_id", locationId)
    .single();

  if (!level) return 0;

  const { data: reservedRows } = await supabaseAdmin
    .from("reservations")
    .select("quantity")
    .eq("variant_id", variantId)
    .eq("status", "active");

  const reserved = (reservedRows ?? []).reduce((s, r) => s + r.quantity, 0);
  return Math.max(0, level.on_hand - reserved);
}

/** Get available per variant (first location found). Used when we have a single primary location. */
export async function getAvailableForVariant(variantId: string): Promise<number> {
  const { data: levels } = await supabaseAdmin
    .from("inventory_levels")
    .select("id, on_hand, shopify_location_id")
    .eq("variant_id", variantId);

  if (!levels?.length) return 0;

  const { data: reservedRows } = await supabaseAdmin
    .from("reservations")
    .select("quantity")
    .eq("variant_id", variantId)
    .eq("status", "active");

  const reserved = (reservedRows ?? []).reduce((s, r) => s + r.quantity, 0);
  const onHand = levels.reduce((s, l) => s + l.on_hand, 0);
  return Math.max(0, onHand - reserved);
}

/** Create active reservations for an order; returns reservation ids. Caller creates order and links order_id. */
export async function createReservations(
  orderId: string | null,
  items: { variant_id: string; quantity: number }[],
  locationId: number
): Promise<{ variantId: string; reservationIds: string[] }[]> {
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000).toISOString();
  const results: { variantId: string; reservationIds: string[] }[] = [];

  for (const item of items) {
    const available = await getAvailableQuantity(item.variant_id, locationId);
    if (available < item.quantity) {
      throw new Error(
        `Insufficient stock for variant ${item.variant_id}: requested ${item.quantity}, available ${available}`
      );
    }

    const rows = Array.from({ length: item.quantity }, (_, i) => ({
      variant_id: item.variant_id,
      order_id: orderId,
      quantity: 1,
      status: "active" as ReservationStatus,
      expires_at: expiresAt,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("reservations")
      .insert(rows)
      .select("id");

    if (error) throw new Error(`Failed to create reservations: ${error.message}`);
    results.push({
      variantId: item.variant_id,
      reservationIds: (inserted ?? []).map((r) => r.id),
    });
  }

  return results;
}

/** Commit reservations for an order (mark as committed). */
export async function commitReservations(orderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ status: "committed", updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("status", "active");

  if (error) throw new Error(`Failed to commit reservations: ${error.message}`);
}

/** Expire active reservations that are past expires_at. */
export async function expireReservations(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("reservations")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw new Error(`Failed to expire reservations: ${error.message}`);
  return data?.length ?? 0;
}

/** Release (expire) active reservations for an order (e.g. payment failed / cancelled). */
export async function releaseReservationsForOrder(orderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ status: "released", updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("status", "active");

  if (error) throw new Error(`Failed to release reservations: ${error.message}`);
}
