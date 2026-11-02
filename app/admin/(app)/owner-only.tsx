import Link from "next/link";

export function OwnerOnly() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center" data-testid="owner-only">
      <h1 className="text-xl font-extrabold">Owner only</h1>
      <p className="mt-2 text-ink-muted">Only the owner can change packages, prices and staff.</p>
      <Link href="/admin/orders" className="btn-primary mt-5">
        Back to orders
      </Link>
    </div>
  );
}
