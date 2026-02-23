import { supabaseAdmin } from "@/lib/supabase/server";
import { createHash } from "crypto";

export function hashPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Try to insert webhook_events row. If unique (source, topic, external_id) fails, we've seen this event.
 * Returns true if this is a new event (should process), false if duplicate.
 */
export async function isDuplicateWebhook(
  source: "shopify" | "paymob",
  topic: string,
  externalId: string,
  payloadHash?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("webhook_events").insert({
    source,
    topic,
    external_id: externalId,
    payload_hash: payloadHash ?? null,
  });

  if (error) {
    if (error.code === "23505") return true; // unique violation = duplicate
    throw error;
  }
  return false;
}
