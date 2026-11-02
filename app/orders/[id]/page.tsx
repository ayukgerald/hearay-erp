import { Confirmation } from "./confirmation";

export const metadata = { title: "Your order" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Confirmation id={id} />;
}
