/**
 * Shopify Admin API authentication.
 *
 * Supports two modes (as of 2026, new legacy custom apps are no longer created):
 *
 * 1. Legacy custom app: set SHOPIFY_ACCESS_TOKEN (long-lived token from an existing custom app).
 * 2. Dev Dashboard app: set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET; we exchange them for
 *    a short-lived token (24h) and refresh automatically.
 *
 * @see https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 */

/** Strip protocol so we always use just the host (e.g. store.myshopify.com). */
export function normalizeShopDomain(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim();
}

const shopDomain = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN);
const legacyToken = process.env.SHOPIFY_ACCESS_TOKEN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Get a valid Admin API access token (legacy or client-credentials). */
export async function getShopifyAccessToken(): Promise<string> {
  if (legacyToken) return legacyToken;

  if (!shopDomain || !clientId || !clientSecret) {
    throw new Error(
      "Set either SHOPIFY_ACCESS_TOKEN (legacy app) or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET + SHOPIFY_SHOP_DOMAIN (Dev Dashboard app)."
    );
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && (text.includes("Verifying your connection") || text.includes("cf-chl"))) {
      throw new Error(
        "Shopify returned 403 (Cloudflare challenge). Server-side token requests are often blocked. " +
        "Use SHOPIFY_ACCESS_TOKEN from a legacy custom app instead of Client ID/Secret, or run sync from a deployed server (e.g. Vercel)."
      );
    }
    throw new Error(`Shopify token request failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 86399) * 1000;
  return cachedToken!;
}
