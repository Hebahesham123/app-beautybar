"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { parseJsonResponse } from "@/lib/fetch-json";

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; products?: number; error?: string } | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [autoBackfillDone, setAutoBackfillDone] = useState(false);
  const autoBackfillStarted = useRef(false);

  // When there are no products, run a full sync once so all (old + new) products appear
  useEffect(() => {
    if (autoBackfillStarted.current) return;
    autoBackfillStarted.current = true;
    (async () => {
      try {
        const res = await fetch("/api/shopify/product-count", { credentials: "include" });
        const data = await parseJsonResponse<{ count?: number }>(res);
        const count = typeof data.count === "number" ? data.count : 0;
        if (count > 0) {
          setAutoBackfillDone(true);
          return;
        }
        setLoading(true);
        setResult(null);
        const headers: Record<string, string> = {};
        if (syncSecret.trim()) headers["x-sync-secret"] = syncSecret.trim();
        else if (adminSecret.trim()) headers["x-admin-key"] = adminSecret.trim();
        // Prefer Storefront (no 403); fallback to Admin API
        let syncRes = await fetch("/api/shopify/sync-storefront", { method: "POST", credentials: "include", headers });
        let syncData = await parseJsonResponse<{ error?: string; products?: number }>(syncRes);
        if (!syncRes.ok && (syncRes.status === 400 || syncData.error?.includes("Storefront"))) {
          syncRes = await fetch("/api/shopify/sync", { method: "POST", credentials: "include", headers });
          syncData = await parseJsonResponse<{ error?: string; products?: number }>(syncRes);
        }
        if (!syncRes.ok) {
          setResult({ error: syncData.error ?? "Sync failed" });
          setAutoBackfillDone(true);
          return;
        }
        setResult({ ok: true, products: syncData.products });
      } catch {
        // Ignore: user may not be logged in; they can sync manually
      } finally {
        setLoading(false);
        setAutoBackfillDone(true);
      }
    })();
  }, []);

  const runSync = async (useStorefront: boolean) => {
    setLoading(true);
    setResult(null);
    const url = useStorefront ? "/api/shopify/sync-storefront" : "/api/shopify/sync";
    const headers: Record<string, string> = {};
    if (syncSecret.trim()) headers["x-sync-secret"] = syncSecret.trim();
    else if (adminSecret.trim()) headers["x-admin-key"] = adminSecret.trim();
    try {
      const res = await fetch(url, { method: "POST", credentials: "include", headers });
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
      <p style={{ color: "#2563eb", fontSize: "0.875rem", marginBottom: "0.75rem", padding: "0.5rem", background: "#eff6ff", borderRadius: 4 }}>
        <strong>All products (new + old):</strong> The first time you open this page with no products in the database, a full sync runs automatically so all existing Shopify products appear. With webhooks set up, new and updated products then stay in sync. Use the buttons below to sync again anytime.
      </p>
      {loading && !result && (
        <p style={{ color: "#0d9488", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Loading all products from Shopify for the first time…
        </p>
      )}
      <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Pull all products, variants, and inventory levels from your Shopify store into Supabase.
        Set <code>SHOPIFY_SHOP_DOMAIN</code>, <code>SHOPIFY_LOCATION_ID</code>, and either <code>SHOPIFY_ACCESS_TOKEN</code> or <code>SHOPIFY_CLIENT_ID</code> + <code>SHOPIFY_CLIENT_SECRET</code> in your env.
      </p>
      <p style={{ color: "#666", fontSize: "0.8rem", marginBottom: "1rem", padding: "0.5rem", background: "#f8f8f8", borderRadius: 4 }}>
        <strong>Using only Client ID/Secret?</strong> If you get a 403 &quot;Cloudflare&quot; error, use <strong>Sync via Storefront API</strong> below (set <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> in env), or use <code>SHOPIFY_ACCESS_TOKEN</code> from the same app’s API credentials.
      </p>
      <p style={{ marginBottom: "0.5rem", fontSize: "0.875rem", color: "#333" }}>
        <strong>Recommended:</strong> Use Storefront API (avoids 404/403). You need <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> in .env.local — get it in Shopify → your app → API credentials → <strong>Storefront API access token</strong>.
      </p>
      <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#f0fdf4", borderRadius: 6, border: "1px solid #86efac" }}>
        <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem", fontWeight: 600 }}>Sync without logging in</p>
        <p style={{ fontSize: "0.8rem", color: "#666", marginBottom: "0.5rem" }}>
          Set <code>SYNC_SECRET</code> in .env.local, then enter it below. Or use your admin secret (same as login).
        </p>
        <input
          type="password"
          value={syncSecret}
          onChange={(e) => setSyncSecret(e.target.value)}
          placeholder="Sync secret (SYNC_SECRET from env)"
          style={{ padding: "0.4rem 0.5rem", width: "100%", maxWidth: 280, marginBottom: "0.4rem", display: "block" }}
          autoComplete="off"
        />
        <input
          type="password"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          placeholder="Or admin secret (ADMIN_SECRET)"
          style={{ padding: "0.4rem 0.5rem", width: "100%", maxWidth: 280 }}
          autoComplete="off"
        />
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => runSync(true)}
          disabled={loading}
          style={{
            padding: "0.6rem 1.25rem",
            background: "#0d9488",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Syncing…" : "Sync via Storefront API"}
        </button>
        <button
          type="button"
          onClick={() => runSync(false)}
          disabled={loading}
          style={{
            padding: "0.6rem 1rem",
            background: "#1a1a1a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "…" : "Sync via Admin API"}
        </button>
      </div>
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
                  Enter your <strong>admin secret</strong> in the box above (same value as in <code>ADMIN_SECRET</code> in .env.local), then try Sync again. Or <Link href="/admin/login" style={{ color: "#0066cc" }}>log in again</Link> and use the same URL for the whole session (e.g. always http://localhost:3001).
                </p>
              )}
              {result.error.includes("404") && (
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#92400e" }}>
                  <strong>Use Storefront instead:</strong> Add <code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> to <code>.env.local</code> (get it in Shopify → your app → API credentials → Storefront API access token). Restart the app, then refresh this page — the main button will become &quot;Sync now (Storefront API)&quot; and will work without 404.
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
