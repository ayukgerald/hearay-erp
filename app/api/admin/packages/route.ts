import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ApiError, handle, readJson } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";

export const dynamic = "force-dynamic";

const price = z.number().int("Price must be whole FCFA").min(0).max(10_000_000);
const createSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,40}$/, "Code: lowercase letters, digits, - or _"),
  name: z.string().trim().min(1).max(60),
  monthlyPriceXaf: price,
  isActive: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  badge: z.string().trim().max(30).nullish(),
});
const patchSchema = z.object({
  id: z.string().regex(UUID_RE),
  name: z.string().trim().min(1).max(60).optional(),
  monthlyPriceXaf: price.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  badge: z.string().trim().max(30).nullish(),
});

export const GET = handle(async () => {
  await requireAdmin(["owner"]);
  const packages = await db.package.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ packages });
});

export const POST = handle(async (req: Request) => {
  await requireAdmin(["owner"]);
  const input = createSchema.parse(await readJson(req));
  if (input.isActive && input.monthlyPriceXaf <= 0) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Set a price above 0 before showing a package to customers.",
    );
  }
  try {
    const pkg = await db.package.create({ data: { ...input, badge: input.badge || null } });
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError("CONFLICT", `A package with code "${input.code}" already exists.`);
    }
    throw err;
  }
});

/** Edit price, name, badge, order, or hide/show. Old orders keep their snapshot price. */
export const PATCH = handle(async (req: Request) => {
  await requireAdmin(["owner"]);
  const { id, badge, ...rest } = patchSchema.parse(await readJson(req));
  const current = await db.package.findUnique({ where: { id } });
  if (!current) throw new ApiError("NOT_FOUND", "Package not found");
  const willBeActive = rest.isActive ?? current.isActive;
  const willCost = rest.monthlyPriceXaf ?? current.monthlyPriceXaf;
  if (willBeActive && willCost <= 0) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Set a price above 0 before showing a package to customers.",
    );
  }
  const pkg = await db.package.update({
    where: { id },
    data: { ...rest, ...(badge !== undefined ? { badge: badge || null } : {}) },
  });
  return NextResponse.json({ package: pkg });
});
