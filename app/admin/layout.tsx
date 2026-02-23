export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <header style={{ padding: "1rem 1.5rem", background: "#1a1a1a", color: "#fff", display: "flex", gap: "1rem", alignItems: "center" }}>
        <a href="/admin/orders" style={{ color: "#fff", fontWeight: 600 }}>Orders</a>
        <a href="/admin/sync" style={{ color: "#ccc", fontSize: "0.875rem" }}>Sync Shopify</a>
        <a href="/admin/login" style={{ color: "#aaa", fontSize: "0.875rem" }}>Login</a>
      </header>
      <main style={{ padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
