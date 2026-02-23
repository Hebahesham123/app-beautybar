import { supabaseAdmin } from "@/lib/supabase/server";

/** Generate next order number (e.g. ORD-1000, ORD-1001). */
export async function generateOrderNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("next_order_number");
  if (!error && data != null) return `ORD-${data}`;

  // Fallback if RPC not available: derive from latest order
  const { data: last } = await supabaseAdmin
    .from("orders")
    .select("order_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const next = last?.order_number
    ? parseInt(last.order_number.replace("ORD-", ""), 10) + 1
    : 1000;
  return `ORD-${next}`;
}
