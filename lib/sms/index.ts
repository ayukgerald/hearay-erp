import type { Order } from "@prisma/client";
import { db } from "../db";
import { formatXaf } from "../money";

export interface SmsSender {
  readonly name: string;
  send(to: string, body: string): Promise<{ providerReference: string | null }>;
}

/** Prints messages to the server log. Used until an SMS provider is chosen. */
export class ConsoleSmsSender implements SmsSender {
  readonly name = "console";
  async send(to: string, body: string) {
    console.log(`[sms] to=${to} ${body}`);
    return { providerReference: null };
  }
}

export function getSmsSender(): SmsSender {
  switch ((process.env.SMS_PROVIDER ?? "console").toLowerCase()) {
    case "console":
      return new ConsoleSmsSender();
    default:
      throw new Error(`Unknown SMS_PROVIDER "${process.env.SMS_PROVIDER}"`);
  }
}

export type SmsKind = "payment_received" | "renewed";

export function smsBody(
  kind: SmsKind,
  o: Pick<Order, "reference" | "packageName" | "months" | "totalXaf" | "smartcardNumber">,
): string {
  const plan = `${o.packageName}, ${o.months} month${o.months > 1 ? "s" : ""}`;
  if (kind === "payment_received") {
    return `Hearay: Payment received, order ${o.reference} (${plan}, ${formatXaf(o.totalXaf).replace(/ /g, " ")}). Renewing your DStv account ${o.smartcardNumber} now. We will SMS you when it is done.`;
  }
  return `Hearay: Done! Your DStv account ${o.smartcardNumber} has been renewed (${plan}). Order ${o.reference}. Thank you.`;
}

/**
 * Sends one SMS for an order and logs it in sms_messages. Sends each kind at
 * most once per order. Never throws: an SMS failure must not undo a payment.
 */
export async function sendOrderSms(
  orderId: string,
  kind: SmsKind,
  sender: SmsSender = getSmsSender(),
) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return null;
    const existing = await db.smsMessage.findFirst({
      where: { orderId, kind, status: { in: ["queued", "sent"] } },
    });
    if (existing) return existing;

    const msg = await db.smsMessage.create({
      data: {
        orderId,
        toPhone: order.customerPhone,
        kind,
        body: smsBody(kind, order),
        status: "queued",
      },
    });
    try {
      const { providerReference } = await sender.send(msg.toPhone, msg.body);
      return await db.smsMessage.update({
        where: { id: msg.id },
        data: { status: "sent", providerReference },
      });
    } catch (err) {
      console.error("[sms] send failed", err);
      return await db.smsMessage.update({ where: { id: msg.id }, data: { status: "failed" } });
    }
  } catch (err) {
    console.error("[sms] could not log message", err);
    return null;
  }
}
