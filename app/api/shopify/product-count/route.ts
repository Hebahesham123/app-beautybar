import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/** GET /api/shopify/product-count - returns total product count (for auto-backfill check). */
export async function GET() {
  try {
    const { count, error } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
