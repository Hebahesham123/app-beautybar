import { createHmac } from "crypto";

const apiKey = process.env.PAYMOB_API_KEY!;
const integrationId = process.env.PAYMOB_INTEGRATION_ID!;
const hmacSecret = process.env.PAYMOB_HMAC_SECRET!;
const iframeUrl = process.env.PAYMOB_IFRAME_URL!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Get Paymob payment token (step 1), then return iframe URL with token.
 * Order id and amount are passed so webhook can identify the order.
 */
export async function getPaymobIframeUrl(params: {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  customerEmail: string;
  customerName: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<string> {
  // Step 1: Auth request to get payment token
  const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!authRes.ok) throw new Error("Paymob auth failed");
  const { token: authToken } = await authRes.json();

  // Step 2: Order registration
  const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: "false",
      amount_cents: Math.round(params.amountCents),
      currency: "EGP",
      merchant_order_id: params.orderId,
      items: [],
    }),
  });
  if (!orderRes.ok) throw new Error("Paymob order registration failed");
  const orderPayload = await orderRes.json();
  const paymobOrderId = orderPayload.id;

  // Step 3: Payment key (for iframe)
  const callbackUrl = `${appUrl}/api/webhooks/paymob/callback`;
  const paymentKeyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: Math.round(params.amountCents),
      expiration: 3600,
      order_id: paymobOrderId,
      integration_id: parseInt(integrationId, 10),
      billing_data: {
        email: params.customerEmail,
        first_name: params.customerName.split(" ")[0] || params.customerName,
        last_name: params.customerName.split(" ").slice(1).join(" ") || ".",
        phone_number: "0000000000",
      },
      currency: "EGP",
      lock_order_when_paid: "false",
    }),
  });
  if (!paymentKeyRes.ok) throw new Error("Paymob payment key failed");
  const { token: paymentToken } = await paymentKeyRes.json();

  // Iframe URL: append token
  const iframeWithToken = `${iframeUrl}?payment_token=${paymentToken}`;
  return iframeWithToken;
}

/**
 * Verify Paymob callback HMAC.
 * Paymob sends: obj, hmac (and others). obj is the concatenated string of sorted keys.
 */
export function verifyPaymobHmac(concatenated: string, receivedHmac: string): boolean {
  const computed = createHmac("sha512", hmacSecret).update(concatenated).digest("hex");
  return computed === receivedHmac;
}

/**
 * Build concatenated string for HMAC from callback query/body.
 * Paymob docs: sort keys and concatenate values.
 */
export function buildPaymobConcatenatedString(params: Record<string, string | number | undefined>): string {
  const keys = Object.keys(params).filter((k) => k !== "hmac").sort();
  return keys.map((k) => params[k]).join("");
}

export function getPaymobIframeBaseUrl(): string {
  return iframeUrl;
}
