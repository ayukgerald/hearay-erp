import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "SMARTCARD_MISMATCH"
  | "PACKAGE_INACTIVE"
  | "ORDER_NOT_PAYABLE"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  SMARTCARD_MISMATCH: 400,
  PACKAGE_INACTIVE: 409,
  ORDER_NOT_PAYABLE: 409,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: STATUS[code] },
  );
}

/** Wraps a route handler so thrown ApiErrors / ZodErrors become the standard error shape. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err.code, err.message, err.details);
      if (err instanceof ZodError) {
        return errorResponse(
          "VALIDATION_FAILED",
          err.issues[0]?.message ?? "Invalid input",
          err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      if (err instanceof SyntaxError)
        return errorResponse("VALIDATION_FAILED", "Body must be valid JSON");
      console.error(err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong" } },
        { status: 500 },
      );
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}
