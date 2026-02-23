export default function Home() {
  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Shopify + Supabase Checkout</h1>
      <p style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
        <a href="/shop" style={{ padding: "0.5rem 1rem", background: "#1a1a1a", color: "#fff", borderRadius: 6, textDecoration: "none" }}>
          Shop (customer)
        </a>
        <a href="/admin/orders" style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", borderRadius: 6, textDecoration: "none" }}>
          Admin → Orders
        </a>
      </p>
    </main>
  );
}
