"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { parseJsonResponse } from "@/lib/fetch-json";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  paymob_transaction_id: string | null;
  total: string;
  currency: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  shipping_address: unknown;
  reservations_committed_at: string | null;
  shopify_inventory_decremented_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItem = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: string;
  title: string | null;
  sku: string | null;
};

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  useEffect(() => {
    fetch(`/api/admin/orders/${id}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) throw new Error("Unauthorized");
        return parseJsonResponse<{ order: Order; items: OrderItem[] }>(r);
      })
      .then((data) => {
        setOrder(data.order);
        setItems(data.items ?? []);
        setNewStatus(data.order?.status ?? "");
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
  }, [id]);

  const handleUpdateStatus = async () => {
    if (!order || newStatus === order.status) return;
    setUpdating(true);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      credentials: "include",
    });
    setUpdating(false);
    if (res.ok) {
      const data = await parseJsonResponse<{ order: Order }>(res);
      setOrder(data.order);
    } else {
      const err = await parseJsonResponse<{ error?: string }>(res).catch(() => ({}));
      setError(err.error ?? "Update failed");
    }
  };

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!order) return <p>Order not found.</p>;

  const statuses = ["pending_payment", "paid", "cod_confirmed", "cancelled", "refunded"];

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        <a href="/admin/orders" style={{ color: "#0066cc" }}>← Back to orders</a>
      </p>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>{order.order_number}</h1>
        <p style={{ color: "#666", fontSize: "0.875rem" }}>ID: {order.id}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1.5rem", marginTop: "1rem" }}>
          <dt style={{ color: "#666" }}>Status</dt>
          <dd>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ marginRight: "0.5rem", padding: "0.25rem 0.5rem" }}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={handleUpdateStatus} disabled={updating || newStatus === order.status}>
              {updating ? "Updating…" : "Update status"}
            </button>
          </dd>
          <dt style={{ color: "#666" }}>Payment</dt>
          <dd>{order.payment_method} {order.paymob_transaction_id ? ` · ${order.paymob_transaction_id}` : ""}</dd>
          <dt style={{ color: "#666" }}>Total</dt>
          <dd>{order.total} {order.currency}</dd>
          <dt style={{ color: "#666" }}>Customer</dt>
          <dd>{order.customer_name || order.customer_email || "—"} {order.customer_phone ? ` · ${order.customer_phone}` : ""}</dd>
          <dt style={{ color: "#666" }}>Created</dt>
          <dd>{new Date(order.created_at).toLocaleString()}</dd>
          <dt style={{ color: "#666" }}>Reservations committed</dt>
          <dd>{order.reservations_committed_at ? new Date(order.reservations_committed_at).toLocaleString() : "—"}</dd>
          <dt style={{ color: "#666" }}>Shopify inventory decremented</dt>
          <dd>{order.shopify_inventory_decremented_at ? new Date(order.shopify_inventory_decremented_at).toLocaleString() : "—"}</dd>
        </dl>
        {order.shipping_address && typeof order.shipping_address === "object" ? (
          <pre style={{ marginTop: "1rem", padding: "0.75rem", background: "#f8f8f8", borderRadius: 4, fontSize: "0.875rem" }}>
            {JSON.stringify(order.shipping_address, null, 2)}
          </pre>
        ) : null}
      </div>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ marginBottom: "1rem" }}>Items</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "0.5rem 0" }}>Title / SKU</th>
              <th style={{ padding: "0.5rem 0" }}>Qty</th>
              <th style={{ padding: "0.5rem 0" }}>Unit price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem 0" }}>{i.title || i.sku || i.variant_id}</td>
                <td style={{ padding: "0.5rem 0" }}>{i.quantity}</td>
                <td style={{ padding: "0.5rem 0" }}>{i.unit_price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
