"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCartItems, clearCart, type CartItem } from "@/lib/cart";
import { parseJsonResponse } from "@/lib/fetch-json";

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [method, setMethod] = useState<"paymob" | "cod">("cod");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order_number: string; iframe_url?: string } | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    setCart(getCartItems());
    setMounted(true);
  }, []);

  const total = cart.reduce((s, c) => s + parseFloat(c.price) * c.quantity, 0);
  const items = cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }
    setLoading(true);
    try {
      const body = {
        items,
        customer_email: email,
        customer_phone: phone,
        customer_name: name,
        shipping_address: address ? { address1: address } : undefined,
      };
      if (method === "cod") {
        const res = await fetch("/api/checkout/cod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await parseJsonResponse<{ error?: string; order_number?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "Checkout failed");
        setSuccess({ order_number: data.order_number });
        clearCart();
      } else {
        const res = await fetch("/api/checkout/paymob-init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await parseJsonResponse<{ error?: string; order_number?: string; iframe_url?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "Checkout failed");
        setSuccess({ order_number: data.order_number, iframe_url: data.iframe_url });
        clearCart();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout failed";
      if (msg === "Failed to fetch" || msg.toLowerCase().includes("fetch failed") || msg.includes("invalid JSON")) {
        setError("Network error. Is the dev server running? Try: npm run dev");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return <p style={{ padding: "2rem" }}>Loading…</p>;

  if (cart.length === 0 && !success) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "1.5rem" }}>
        <p style={{ color: "#666" }}>Your cart is empty. <Link href="/shop">Add items</Link> first.</p>
      </main>
    );
  }

  if (success) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Order placed</h1>
        <p style={{ marginBottom: "1rem" }}>Order number: <strong>{success.order_number}</strong></p>
        {success.iframe_url ? (
          <div style={{ marginTop: "1.5rem" }}>
            <p style={{ marginBottom: "0.5rem" }}>Complete payment below:</p>
            <iframe
              src={success.iframe_url}
              title="Paymob payment"
              style={{ width: "100%", height: 500, border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        ) : (
          <p style={{ color: "#666" }}>Your COD order has been received.</p>
        )}
        <p style={{ marginTop: "1.5rem" }}><Link href="/shop">Continue shopping</Link></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.5rem", borderBottom: "1px solid #eee", paddingBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Checkout</h1>
        <Link href="/cart" style={{ color: "#666", fontSize: "0.875rem" }}>← Back to cart</Link>
      </header>

      <p style={{ marginBottom: "1rem" }}><strong>Total: {total.toFixed(2)} EGP</strong></p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label>
          <span style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>Email *</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "0.5rem" }} />
        </label>
        <label>
          <span style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>Phone *</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required style={{ width: "100%", padding: "0.5rem" }} />
        </label>
        <label>
          <span style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>Name *</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", padding: "0.5rem" }} />
        </label>
        <label>
          <span style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem" }}>Address (optional)</span>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: "0.5rem" }} placeholder="Street, city, zip" />
        </label>

        <fieldset style={{ border: "1px solid #eee", padding: "1rem", borderRadius: 6 }}>
          <legend style={{ padding: "0 0.5rem" }}>Payment</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input type="radio" name="method" checked={method === "cod"} onChange={() => setMethod("cod")} />
            Cash on delivery (COD)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="radio" name="method" checked={method === "paymob"} onChange={() => setMethod("paymob")} />
            Card (Paymob)
          </label>
        </fieldset>

        {error && <p style={{ color: "red", fontSize: "0.875rem" }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ padding: "0.75rem", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Processing…" : "Place order"}
        </button>
      </form>
    </main>
  );
}
