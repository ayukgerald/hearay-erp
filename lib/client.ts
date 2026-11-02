"use client";

/** Browser-side helpers shared by the customer and admin screens. */

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError("NETWORK", "No connection. Check your internet and try again.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiClientError(
      e.code ?? "UNKNOWN",
      e.message ?? "Something went wrong. Please try again.",
      res.status,
      e.details,
    );
  }
  return body as T;
}

export type PublicPackage = {
  id: string;
  code: string;
  name: string;
  monthlyPriceXaf: number;
  badge: string | null;
};
export type PackagesResponse = {
  packages: PublicPackage[];
  serviceFeeXaf: number;
  smartcardLengths: number[];
  months: number[];
};

const CACHE_KEY = "hearay.packages.v1";

/** Package data from screen 1, kept for screens 2 and 3 (refetched if missing, e.g. after a refresh in a new tab). */
export async function loadPackages(opts: { fresh?: boolean } = {}): Promise<PackagesResponse> {
  if (!opts.fresh) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { at, data } = JSON.parse(raw) as { at: number; data: PackagesResponse };
        if (Date.now() - at < 30 * 60_000) return data;
      }
    } catch {
      /* storage unavailable */
    }
  }
  const data = await api<PackagesResponse>("/api/packages");
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
  return data;
}

export const METHOD_LABEL = { mtn_momo: "MTN MoMo", orange_money: "Orange Money" } as const;
export type Method = keyof typeof METHOD_LABEL;

export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  return s.toString();
}
