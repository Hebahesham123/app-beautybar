import { getShopifyAccessToken, normalizeShopDomain } from "@/lib/shopify-auth";

const shopDomain = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN) || process.env.SHOPIFY_SHOP_DOMAIN!;
const locationId = process.env.SHOPIFY_LOCATION_ID!;

const baseUrl = `https://${shopDomain}/admin/api/2024-01`;

async function headers(): Promise<HeadersInit> {
  const token = await getShopifyAccessToken();
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };
}

/** Fetch product by ID from Shopify */
export async function getShopifyProduct(productId: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/products/${productId}.json`, { headers: await headers() });
  if (!res.ok) throw new Error(`Shopify product fetch failed: ${res.status}`);
  const json = await res.json();
  return json.product;
}

/** Fetch inventory levels for an inventory_item_id at location */
export async function getShopifyInventoryLevels(
  inventoryItemId: number,
  locationIdNum: number
): Promise<{ available: number }> {
  const params = new URLSearchParams({
    inventory_item_ids: String(inventoryItemId),
    location_ids: String(locationIdNum),
  });
  const res = await fetch(`${baseUrl}/inventory_levels.json?${params}`, { headers: await headers() });
  if (!res.ok) throw new Error(`Shopify inventory fetch failed: ${res.status}`);
  const json = await res.json();
  const level = json.inventory_levels?.[0];
  return { available: level?.available ?? 0 };
}

/**
 * Decrement inventory in Shopify when order is confirmed (COD or Paymob paid).
 * Uses InventoryLevelUpdate mutation to set available down by quantity.
 */
export async function decrementShopifyInventory(
  inventoryItemId: number,
  locationIdNum: number,
  quantity: number
): Promise<void> {
  // First get current level
  const { available } = await getShopifyInventoryLevels(inventoryItemId, locationIdNum);
  const newAvailable = Math.max(0, available - quantity);

  // GraphQL inventorySet mutation to set available quantity
  const mutation = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await fetch(`${baseUrl.replace("/admin/api/2024-01", "")}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          reason: "correction",
          name: "available",
          quantities: [
            {
              inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
              locationId: `gid://shopify/Location/${locationIdNum}`,
              quantity: newAvailable,
            },
          ],
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Shopify inventory decrement failed: ${res.status}`);
  const json = await res.json();
  const errs = json.data?.inventorySetQuantities?.userErrors ?? [];
  if (errs.length) throw new Error(`Shopify: ${errs.map((e: { message: string }) => e.message).join(", ")}`);
}

/** REST alternative: adjust inventory by delta (negative = decrement) */
export async function adjustShopifyInventoryRest(
  inventoryItemId: number,
  locationIdNum: number,
  delta: number
): Promise<void> {
  const res = await fetch(`${baseUrl}/inventory_levels/adjust.json`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({
      location_id: locationIdNum,
      inventory_item_id: inventoryItemId,
      available_adjustment: delta,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify adjust inventory failed: ${res.status} ${text}`);
  }
}

export function getShopifyLocationId(): number {
  const id = parseInt(locationId, 10);
  if (Number.isNaN(id)) throw new Error("Invalid SHOPIFY_LOCATION_ID");
  return id;
}
