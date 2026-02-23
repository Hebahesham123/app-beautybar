"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { parseJsonResponse } from "@/lib/fetch-json";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  total: string;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
};

async function fetchOrders(): Promise<{ orders: Order[]; total: number }> {
  const r = await fetch("/api/admin/orders?limit=100", { credentials: "include" });
  if (r.status === 401) throw new Error("Unauthorized");
  return parseJsonResponse(r);
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    fetchOrders()
      .then((data) => {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((e) => {
        if (e.message === "Unauthorized") {
          router.replace("/admin/login");
          return;
        }
        const msg = e?.message ?? "";
        if (msg === "Failed to fetch" || msg.toLowerCase().includes("fetch failed")) {
          setError("Network error. Is the dev server running? Try: npm run dev");
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const ch = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders().then((data) => {
            setOrders(data.orders ?? []);
            setTotal(data.total ?? 0);
          });
        }
      )
      .subscribe();

    setChannel(ch);
    return () => {
      ch.unsubscribe();
    };
  }, []);

  if (loading) return <p>Loading orders…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}. <a href="/admin/login">Log in</a></p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1rem" }}>Orders ({total})</h1>
      <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1rem" }}>
        List updates in real time via Supabase Realtime.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <thead>
          <tr style={{ background: "#f8f8f8", textAlign: "left" }}>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Order</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Status</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Payment</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Total</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Customer</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}>Created</th>
            <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee" }}></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.75rem 1rem" }}>{o.order_number}</td>
              <td style={{ padding: "0.75rem 1rem" }}>
                <span style={{
                  padding: "0.25rem 0.5rem",
                  borderRadius: 4,
                  fontSize: "0.875rem",
                  background: o.status === "paid" || o.status === "cod_confirmed" ? "#d4edda" : o.status === "cancelled" ? "#f8d7da" : "#fff3cd",
                }}>
                  {o.status}
                </span>
              </td>
              <td style={{ padding: "0.75rem 1rem" }}>{o.payment_method}</td>
              <td style={{ padding: "0.75rem 1rem" }}>{o.total} {o.currency}</td>
              <td style={{ padding: "0.75rem 1rem" }}>{o.customer_name || o.customer_email || "—"}</td>
              <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#666" }}>
                {new Date(o.created_at).toLocaleString()}
              </td>
              <td style={{ padding: "0.75rem 1rem" }}>
                <a href={`/admin/orders/${o.id}`} style={{ color: "#0066cc" }}>View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p style={{ marginTop: "1rem", color: "#666" }}>No orders yet.</p>}
    </div>
  );
}
