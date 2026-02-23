import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

/** Client-side Supabase (anon key). Use for realtime subscriptions in browser. */
export const supabase = createClient(supabaseUrl, anonKey);
