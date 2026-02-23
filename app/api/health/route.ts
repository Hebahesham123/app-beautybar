import { NextResponse } from "next/server";

/** GET /api/health - confirms the app and API are running (same origin). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "API is running. If you see 404 elsewhere, use the same URL as this page (check the browser address bar).",
  });
}
