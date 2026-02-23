export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      admin_users: {
        Row: { id: string; email: string; supabase_user_id: string | null; created_at: string };
        Insert: { id?: string; email: string; supabase_user_id?: string | null; created_at?: string };
        Update: { id?: string; email?: string; supabase_user_id?: string | null; created_at?: string };
      };
      products: {
        Row: {
          id: string;
          shopify_product_id: string;
          title: string;
          body_html: string | null;
          handle: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & {
          shopify_product_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          shopify_variant_id: string;
          shopify_inventory_item_id: number | null;
          title: string | null;
          sku: string | null;
          price: string;
          compare_at_price: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["product_variants"]["Row"]> & {
          product_id: string;
          shopify_variant_id: string;
          price: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_variants"]["Insert"]>;
      };
      inventory_levels: {
        Row: {
          id: string;
          variant_id: string;
          shopify_location_id: number;
          shopify_inventory_item_id: number;
          on_hand: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          variant_id: string;
          shopify_location_id: number;
          shopify_inventory_item_id: number;
          on_hand: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_levels"]["Insert"]>;
      };
      reservations: {
        Row: {
          id: string;
          variant_id: string;
          order_id: string | null;
          quantity: number;
          status: "active" | "committed" | "expired" | "released";
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          variant_id: string;
          order_id?: string | null;
          quantity: number;
          status?: "active" | "committed" | "expired" | "released";
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reservations"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          status: "pending_payment" | "paid" | "cod_confirmed" | "cancelled" | "refunded";
          payment_method: "paymob" | "cod";
          paymob_transaction_id: string | null;
          paymob_hmac_verified: boolean;
          total: string;
          currency: string;
          customer_email: string | null;
          customer_phone: string | null;
          customer_name: string | null;
          shipping_address: Json | null;
          reservations_committed_at: string | null;
          shopify_inventory_decremented_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]> & {
          order_number: string;
          payment_method: "paymob" | "cod";
          total: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          unit_price: string;
          title: string | null;
          sku: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          unit_price: string;
          title?: string | null;
          sku?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
      };
      webhook_events: {
        Row: {
          id: string;
          source: "shopify" | "paymob";
          topic: string | null;
          external_id: string | null;
          payload_hash: string | null;
          processed_at: string;
        };
        Insert: {
          id?: string;
          source: "shopify" | "paymob";
          topic?: string | null;
          external_id?: string | null;
          payload_hash?: string | null;
          processed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_events"]["Insert"]>;
      };
    };
  };
}

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type InventoryLevel = Database["public"]["Tables"]["inventory_levels"]["Row"];
export type Reservation = Database["public"]["Tables"]["reservations"]["Row"];
