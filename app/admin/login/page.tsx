"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseJsonResponse } from "@/lib/fetch-json";

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
      credentials: "include",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await parseJsonResponse<{ error?: string }>(res).catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }
    router.push("/admin/orders");
    router.refresh();
  };

  return (
    <div style={{ maxWidth: 360, margin: "4rem auto", padding: "2rem", background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <h1 style={{ marginBottom: "1rem" }}>Admin login</h1>
      <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1rem" }}>
        Use the value of <code>ADMIN_SECRET</code> from your <code>.env.local</code>.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
          Admin secret
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: 4 }}
          placeholder="ADMIN_SECRET"
        />
        {error && <p style={{ color: "red", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1rem", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 4 }}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
