import { NextRequest, NextResponse } from "next/server";
import { adminOrdersQuerySchema } from "@/lib/validations/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/auth-admin";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = adminOrdersQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit"),
    offset: searchParams.get("offset"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const { status, limit, offset } = parsed.data;
  let q = supabaseAdmin
    .from("orders")
    .select("id, order_number, status, payment_method, total, currency, customer_email, customer_name, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data, total: count ?? 0 });
}
