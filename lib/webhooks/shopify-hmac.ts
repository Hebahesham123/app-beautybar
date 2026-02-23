import { createHmac } from "crypto";

const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;

export function verifyShopifyHmac(rawBody: string | Buffer, hmacHeader: string): boolean {
  if (!secret) return false;
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const computed = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return computed === hmacHeader;
}
