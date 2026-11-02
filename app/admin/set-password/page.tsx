import { SetPassword } from "./set-password";

export const metadata = { title: "Set your password" };

/** Landing page for Supabase invite links: the new staff member chooses a password. */
export default function Page() {
  return (
    <SetPassword
      url={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
    />
  );
}
