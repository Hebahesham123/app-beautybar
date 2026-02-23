"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCartItems, setCartItems, type CartItem } from "@/lib/cart";
import { parseJsonResponse } from "@/lib/fetch-json";

type Variant = {
  id: string;
  product_id: string;
  title: string | null;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: number;
};

type Product = {
  id: string;
  title: string;
  body_html: string | null;
  handle: string | null;
  status: string;
};

function loadCart(): CartItem[] {
  return getCartItems();
}

function saveCart(items: CartItem[]) {
  setCartItems(items);
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    setCart(loadCart());
    fetch("/api/products")
      .then(async (r) => {
        const data = await parseJsonResponse<{ error?: string; products?: Product[]; variantsByProduct?: Record<string, Variant[]> }>(r);
        if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
        return data;
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProducts(data.products ?? []);
        setVariantsByProduct(data.variantsByProduct ?? {});
      })
      .catch((e) => {
        const msg = e?.message ?? "";
        if (msg === "Failed to fetch" || msg.toLowerCase().includes("fetch failed")) {
          setError("Network error. Is the dev server running? Try: npm run dev");
        } else if (msg.includes("Check the terminal") || msg.includes("invalid JSON")) {
          setError(msg);
        } else {
          setError(msg || "Could not load products");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const addToCart = (v: Variant, qty: number) => {
    const title = v.title || v.sku || "Item";
    const existing = cart.find((c) => c.variant_id === v.id);
    let next: CartItem[];
    if (existing) {
      next = cart.map((c) =>
        c.variant_id === v.id ? { ...c, quantity: c.quantity + qty } : c
      );
    } else {
      next = [...cart, { variant_id: v.id, quantity: qty, title, price: v.price, sku: v.sku }];
    }
    setCart(next);
    saveCart(next);
    setAdded(v.id);
    setTimeout(() => setAdded(null), 2000);
  };

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  if (loading) return <p style={{ padding: "2rem", textAlign: "center" }}>Loading…</p>;
  if (error) return <p style={{ padding: "2rem", color: "red" }}>Error: {error}</p>;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #eee", paddingBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Shop</h1>
        <div>
          <Link href="/" style={{ marginRight: "1rem", color: "#666" }}>Home</Link>
          <Link href="/cart" style={{ fontWeight: 600 }}>
            Cart ({cartCount})
          </Link>
        </div>
      </header>

      {products.length === 0 ? (
        <p style={{ color: "#666" }}>No products yet. Sync from Shopify or add products in admin.</p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {products.map((p) => (
            <li key={p.id} style={{ marginBottom: "2rem", padding: "1rem", background: "#fafafa", borderRadius: 8 }}>
              <h2 style={{ marginBottom: "0.5rem", fontSize: "1.25rem" }}>{p.title}</h2>
              <ul style={{ listStyle: "none", marginTop: "0.75rem" }}>
                {(variantsByProduct[p.id] ?? []).map((v) => (
                  <li key={v.id} style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <span style={{ flex: "1 1 200px" }}>
                      {v.title || v.sku || "Default"} — {v.price} EGP
                      {v.available !== undefined && (
                        <span style={{ marginLeft: "0.5rem", color: "#666", fontSize: "0.875rem" }}>
                          ({v.available} in stock)
                        </span>
                      )}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="number"
                        min={1}
                        max={v.available ?? 99}
                        defaultValue={1}
                        id={`qty-${v.id}`}
                        style={{ width: 56, padding: "0.25rem" }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById(`qty-${v.id}`) as HTMLInputElement;
                          const qty = Math.max(1, parseInt(input?.value || "1", 10) || 1);
                          addToCart(v, qty);
                        }}
                        disabled={(v.available ?? 0) < 1}
                        style={{
                          padding: "0.35rem 0.75rem",
                          background: added === v.id ? "#22c55e" : "#1a1a1a",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: (v.available ?? 0) >= 1 ? "pointer" : "not-allowed",
                        }}
                      >
                        {added === v.id ? "Added" : "Add to cart"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
