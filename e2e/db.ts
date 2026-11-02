import { PrismaClient } from "@prisma/client";
import { E2E_ENV } from "../playwright.config";

export const db = new PrismaClient({ datasources: { db: { url: E2E_ENV.DATABASE_URL } } });

export const OWNER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@e2e.test",
  name: "Olive Owner",
};
export const STAFF = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "staff@e2e.test",
  name: "Sam Staff",
};
export const PASSWORD = E2E_ENV.DEV_ADMIN_PASSWORD;

/** Unique Cameroon mobile number for each test run. lastDigit 0 makes FakeProvider decline. */
export function phone(lastDigit: number) {
  const mid = String(Date.now() % 10_000_000).padStart(7, "0");
  return `6${mid}${lastDigit}`;
}
