"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCartItems, setCartItems, type CartItem } from "@/lib/cart";

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCart(getCartItems());
    setMounted(true);
  }, []);

  const updateQty = (variantId: string, delta: number) => {
    const next = cart
      .map((c) => (c.variant_id === variantId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
      .filter((c) => c.quantity > 0);
    setCart(next);
    setCartItems(next);
  };

  const remove = (variantId: string) => {
    const next = cart.filter((c) => c.variant_id !== variantId);
    setCart(next);
    setCartItems(next);
  };

  const total = cart.reduce((s, c) => s + parseFloat(c.price) * c.quantity, 0);

  if (!mounted) return <p style={{ padding: "2rem" }}>Loading…</p>;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.5rem", borderBottom: "1px solid #eee", paddingBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Cart</h1>
        <Link href="/shop" style={{ color: "#666", fontSize: "0.875rem" }}>← Back to shop</Link>
      </header>

      {cart.length === 0 ? (
        <p style={{ color: "#666" }}>Your cart is empty. <Link href="/shop">Browse products</Link>.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", marginBottom: "1.5rem" }}>
            {cart.map((c) => (
              <li key={c.variant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <strong>{c.title}</strong> {c.sku && <span style={{ color: "#666", fontSize: "0.875rem" }}>({c.sku})</span>}
                  <br />
                  <span style={{ fontSize: "0.875rem", color: "#666" }}>{c.price} EGP × {c.quantity}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button type="button" onClick={() => updateQty(c.variant_id, -1)} style={{ padding: "0.25rem 0.5rem" }}>−</button>
                  <span>{c.quantity}</span>
                  <button type="button" onClick={() => updateQty(c.variant_id, 1)} style={{ padding: "0.25rem 0.5rem" }}>+</button>
                  <button type="button" onClick={() => remove(c.variant_id)} style={{ marginLeft: "0.5rem", color: "#c00", fontSize: "0.875rem" }}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "1.125rem", marginBottom: "1rem" }}><strong>Total: {total.toFixed(2)} EGP</strong></p>
          <Link href="/checkout" style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "#1a1a1a", color: "#fff", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}>Proceed to checkout</Link>
        </>
      )}
    </main>
  );
}
