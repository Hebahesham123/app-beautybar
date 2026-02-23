import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (_admin && supabaseUrl && serviceRoleKey) return _admin;
  if (supabaseUrl && serviceRoleKey) {
    _admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    return _admin;
  }
  return createClient(
    "https://placeholder.supabase.co",
    "placeholder-key",
    { auth: { persistSession: false } }
  );
}

/** Server-only Supabase client with service role (bypasses RLS). Use in API routes and server components. */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as unknown as Record<string, unknown>)[prop as string];
  },
});
