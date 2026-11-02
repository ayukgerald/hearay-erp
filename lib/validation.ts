import { z } from "zod";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

/** Body of POST /api/orders. Unknown keys (e.g. a "totalXaf" from the browser) are dropped. */
export const createOrderSchema = z.object({
  smartcardNumber: z.string({ required_error: "Enter your smartcard number" }).max(40),
  smartcardConfirm: z.string({ required_error: "Retype your smartcard number" }).max(40),
  packageId: z.string().regex(UUID_RE, "Choose a package"),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)], {
    errorMap: () => ({ message: "Months must be 1, 3, 6 or 12" }),
  }),
  phone: z.string({ required_error: "Enter your phone number" }).max(30),
  paymentMethod: z.enum(["mtn_momo", "orange_money"], {
    errorMap: () => ({ message: "Choose MTN Mobile Money or Orange Money" }),
  }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
