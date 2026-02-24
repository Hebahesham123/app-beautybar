/**
 * Shopify Storefront API – no token exchange (no 403 from Cloudflare).
 * Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN.
 * Get the token in Shopify Admin → Apps → your app → API credentials → Storefront API access token.
 */

import { normalizeShopDomain } from "@/lib/shopify-auth";

const shopDomain = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN) || process.env.SHOPIFY_SHOP_DOMAIN || "";
const storefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

const storefrontUrl = shopDomain ? `https://${shopDomain}/api/2024-01/graphql.json` : "";

function parseGid(gid: string): string {
  const parts = (gid || "").split("/");
  return parts[parts.length - 1] || "";
}

export type StorefrontProduct = {
  shopify_product_id: string;
  title: string;
  body_html: string | null;
  handle: string | null;
  variants: Array<{
    shopify_variant_id: string;
    title: string | null;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    quantity_available: number;
  }>;
};

export function isStorefrontSyncAvailable(): boolean {
  return Boolean(shopDomain && storefrontToken);
}

/**
 * Fetch all active products and variants (with quantityAvailable) via Storefront API.
 * No Admin token exchange, so avoids 403 when Cloudflare blocks server-side token requests.
 */
export async function fetchStorefrontProducts(): Promise<StorefrontProduct[]> {
  if (!shopDomain || !storefrontToken) {
    throw new Error(
      "Storefront sync requires SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN. " +
        "Get the token in Shopify Admin → Settings → Apps and sales channels → Develop apps → your app → API credentials → Storefront API access token."
    );
  }

  const products: StorefrontProduct[] = [];
  let cursor: string | null = null;

  const query = `
    query StorefrontProducts($first: Int!, $after: String) {
      products(first: $first, query: "status:active", after: $after) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price { amount }
                  compareAtPrice { amount }
                  quantityAvailable
                }
              }
            }
          }
        }
      }
    }
  `;

  do {
    const res = await fetch(storefrontUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({
        query,
        variables: { first: 250, after: cursor },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Storefront API: ${res.status} ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{
            node: {
              id: string;
              title: string;
              handle: string | null;
              descriptionHtml: string | null;
              variants: {
                edges: Array<{
                  node: {
                    id: string;
                    title: string;
                    sku: string | null;
                    price: { amount: string };
                    compareAtPrice: { amount: string } | null;
                    quantityAvailable: number | null;
                  };
                }>;
              };
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(`Storefront GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
    }

    const data = json.data?.products;
    if (!data) throw new Error("Storefront API: no products in response");

    for (const edge of data.edges) {
      const node = edge.node;
      products.push({
        shopify_product_id: parseGid(node.id),
        title: node.title ?? "",
        body_html: node.descriptionHtml ?? null,
        handle: node.handle ?? null,
        variants: (node.variants?.edges ?? []).map((ve) => ({
          shopify_variant_id: parseGid(ve.node.id),
          title: ve.node.title ?? null,
          sku: ve.node.sku ?? null,
          price: ve.node.price?.amount ?? "0",
          compare_at_price: ve.node.compareAtPrice?.amount ?? null,
          quantity_available: ve.node.quantityAvailable ?? 0,
        })),
      });
    }

    cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
  } while (cursor);

  return products;
}
