import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "2rem", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <h1>Page not found</h1>
      <p style={{ marginTop: "1rem", color: "#666" }}>
        The page you requested doesn’t exist. Use one of these:
      </p>
      <ul style={{ marginTop: "1.5rem", listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <li><Link href="/" style={{ color: "#0070f3" }}>Home</Link></li>
        <li><Link href="/shop" style={{ color: "#0070f3" }}>Shop</Link></li>
        <li><Link href="/cart" style={{ color: "#0070f3" }}>Cart</Link></li>
        <li><Link href="/checkout" style={{ color: "#0070f3" }}>Checkout</Link></li>
        <li><Link href="/admin/login" style={{ color: "#0070f3" }}>Admin login</Link></li>
        <li><Link href="/admin/orders" style={{ color: "#0070f3" }}>Admin orders</Link></li>
      </ul>
    </main>
  );
}
