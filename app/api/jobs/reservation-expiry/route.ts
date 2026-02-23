import { NextRequest, NextResponse } from "next/server";
import { expireReservations } from "@/lib/inventory";
import { isAdminRequest } from "@/lib/auth-admin";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await expireReservations();
    return NextResponse.json({ ok: true, expired_count: count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
