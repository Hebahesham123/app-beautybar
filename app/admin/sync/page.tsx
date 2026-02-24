"use client";

import { useState } from "react";
import Link from "next/link";
import { parseJsonResponse } from "@/lib/fetch-json";

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; products?: number; error?: string } | null>(null);

  const runSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = await parseJsonResponse<{ error?: string; products?: number }>(res);
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setResult({ ok: true, products: data.products });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      if (msg === "Failed to fetch" || msg.toLowerCase().includes("fetch failed")) {
        setResult({ error: "Network error. Is the dev server running? Try: npm run dev" });
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
        <strong>Using only Client ID/Secret?</strong> If you get a 403 &quot;Cloudflare&quot; error when syncing locally, deploy the app (e.g. to Vercel), set the same env vars there, and run &quot;Sync now&quot; from the deployed admin. The token request often works from production.
      </p>
      <button
        type="button"
        onClick={runSync}
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
        {loading ? "Syncing…" : "Sync now"}
      </button>
      {result && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: result.error ? "#fef2f2" : "#f0fdf4", borderRadius: 6 }}>
          {result.error ? (
            <>
              <p style={{ color: "#b91c1c" }}>{result.error}</p>
              {(result.error.includes("403") || result.error.toLowerCase().includes("cloudflare")) && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#92400e" }}>
                  <strong>Options:</strong> (1) Use <code>SHOPIFY_ACCESS_TOKEN</code> from a legacy custom app in <code>.env.local</code> and restart, or (2) Deploy this app (e.g. Vercel), set the same env vars, and run Sync from the deployed site.
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
