import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Check if request is from an admin.
 * 1) Cookie admin_authorized=1 (set by POST /api/admin/login with ADMIN_SECRET)
 * 2) Authorization: Bearer <ADMIN_SECRET> or x-admin-key: <ADMIN_SECRET>
 * 3) Or Supabase Auth user whose email is in admin_users table (via Bearer <supabase_jwt>)
 */
export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get("admin_authorized")?.value;
  if (cookie === "1") return true;

  const authHeader = request.headers.get("authorization");
  const adminKey = request.headers.get("x-admin-key");

  if (ADMIN_SECRET) {
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearer === ADMIN_SECRET || adminKey === ADMIN_SECRET) return true;
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) return false;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user?.email) return false;

  const { data: adminRow } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("email", user.email)
    .single();

  return !!adminRow;
}

/** Check if request is allowed for sync-only (no login). Use SYNC_SECRET in env and send x-sync-secret header. */
export function isSyncSecretRequest(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  return request.headers.get("x-sync-secret") === secret;
}
