"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { parseJsonResponse } from "@/lib/fetch-json";

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(false);
  const [storefrontAvailable, setStorefrontAvailable] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ ok?: boolean; products?: number; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/shopify/sync-storefront", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setStorefrontAvailable(d.available === true))
      .catch(() => setStorefrontAvailable(false));
  }, []);

  const runSync = async (useStorefront: boolean) => {
    setLoading(true);
    setResult(null);
    const url = useStorefront ? "/api/shopify/sync-storefront" : "/api/shopify/sync";
    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await parseJsonResponse<{ error?: string; products?: number }>(res);
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setResult({ ok: true, products: data.products });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      if (msg === "Failed to fetch" || msg.toLowerCase().includes("fetch failed")) {
        setResult({ error: "Network error. Is the dev server running? Try: npm run dev" });
      } else if (msg === "Unauthorized" || msg.includes("401")) {
        setResult({ error: "You must be logged in as admin. Log in first, then try Sync again." });
      } else {
        setResult({ error: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/admin/orders" style={{ color: "#0066cc" }}>← Orders</Link>
      </p>
      <h1 style={{ marginBottom: "0.5rem" }}>Sync from Shopify</h1>
      <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Pull all products, variants, and inventory levels from your Shopify store into Supabase.
        Set <code>SHOPIFY_SHOP_DOMAIN</code>, <code>SHOPIFY_LOCATION_ID</code>, and either <code>SHOPIFY_ACCESS_TOKEN</code> or <code>SHOPIFY_CLIENT_ID</code> + <code>SHOPIFY_CLIENT_SECRET</code> in your env.
      </p>
      <p style={{ color: "#666", fontSize: "0.8rem", marginBottom: "1rem", padding: "0.5rem", background: "#f8f8f8", borderRadius: 4 }}>
        <strong>Using only Client ID/Secret?</strong> If you get a 403 &quot;Cloudflare&quot; error, use <strong>Sync via Storefront API</strong> below (set <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> in env), or use <code>SHOPIFY_ACCESS_TOKEN</code> from the same app’s API credentials.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => runSync(false)}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            background: "#1a1a1a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Syncing…" : "Sync (Admin API)"}
        </button>
        {storefrontAvailable && (
          <button
            type="button"
            onClick={() => runSync(true)}
            disabled={loading}
            style={{
              padding: "0.5rem 1rem",
              background: "#0d9488",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Syncing…" : "Sync via Storefront API (no 403)"}
          </button>
        )}
      </div>
      {storefrontAvailable === false && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#666" }}>
          To use Storefront sync (avoids 403): set <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> in your env. Get it in Shopify Admin → Settings → Apps and sales channels → Develop apps → your app → API credentials → <strong>Storefront API access token</strong>.
        </p>
      )}
      {result && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: result.error ? "#fef2f2" : "#f0fdf4", borderRadius: 6 }}>
          {result.error ? (
            <>
              <p style={{ color: "#b91c1c" }}>{result.error}</p>
              {(result.error.includes("403") || result.error.toLowerCase().includes("cloudflare")) && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#92400e" }}>
                  <strong>Reliable fix:</strong> Use <code>SHOPIFY_ACCESS_TOKEN</code> instead of Client ID/Secret. In Shopify Admin: Settings → Apps and sales channels → Develop apps → [your app] → API credentials → copy <strong>Admin API access token</strong>. In Vercel (and locally): set <code>SHOPIFY_ACCESS_TOKEN</code> to that value, remove <code>SHOPIFY_CLIENT_ID</code> and <code>SHOPIFY_CLIENT_SECRET</code>, then redeploy and run Sync again.
                </p>
              )}
              {(result.error.toLowerCase().includes("logged in") || result.error.toLowerCase().includes("unauthorized")) && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
                  <Link href="/admin/login" style={{ color: "#0066cc" }}>→ Go to Admin login</Link>
                </p>
              )}
            </>
          ) : (
            <p style={{ color: "#166534" }}>Synced {result.products ?? 0} products. <Link href="/shop">View shop</Link>.</p>
          )}
        </div>
      )}
    </div>
  );
}
