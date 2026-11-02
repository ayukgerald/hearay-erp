"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/phone-shell";
import { api } from "@/lib/client";

export function AdminNav({ name, role }: { name: string; role: "owner" | "staff" }) {
  const path = usePathname();
  const router = useRouter();
  const links = [
    { href: "/admin/orders", label: "Orders" },
    ...(role === "owner"
      ? [
          { href: "/admin/packages", label: "Packages & prices" },
          { href: "/admin/users", label: "Staff" },
        ]
      : []),
  ];
  async function signOut() {
    await api("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/admin/orders" className="py-1.5">
          <Logo />
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`inline-flex min-h-touch items-center whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${
                path.startsWith(l.href)
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-ink-muted sm:inline">
            {name} · <span className="capitalize">{role}</span>
          </span>
          <button
            onClick={signOut}
            className="inline-flex min-h-touch items-center rounded-xl px-3 font-semibold text-ink-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
