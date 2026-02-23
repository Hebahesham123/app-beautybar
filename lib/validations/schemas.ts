import { z } from "zod";

const shippingAddressSchema = z.object({
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  zip: z.string().optional(),
});

/** Paymob init: create order + reservations, return iframe URL */
export const paymobInitSchema = z.object({
  items: z.array(
    z.object({
      variant_id: z.string().uuid(),
      quantity: z.number().int().min(1),
    })
  ),
  customer_email: z.string().email(),
  customer_phone: z.string().min(1),
  customer_name: z.string().min(1),
  shipping_address: shippingAddressSchema.optional(),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

/** COD checkout: create order and commit reservations immediately */
export const codCheckoutSchema = z.object({
  items: z.array(
    z.object({
      variant_id: z.string().uuid(),
      quantity: z.number().int().min(1),
    })
  ),
  customer_email: z.string().email(),
  customer_phone: z.string().min(1),
  customer_name: z.string().min(1),
  shipping_address: shippingAddressSchema.optional(),
});

/** Admin: update order status */
export const adminOrderUpdateSchema = z.object({
  status: z.enum(["pending_payment", "paid", "cod_confirmed", "cancelled", "refunded"]),
});

/** Admin: list orders query */
export const adminOrdersQuerySchema = z.object({
  status: z.enum(["pending_payment", "paid", "cod_confirmed", "cancelled", "refunded"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type PaymobInitInput = z.infer<typeof paymobInitSchema>;
export type CodCheckoutInput = z.infer<typeof codCheckoutSchema>;
export type AdminOrderUpdateInput = z.infer<typeof adminOrderUpdateSchema>;
export type AdminOrdersQueryInput = z.infer<typeof adminOrdersQuerySchema>;
