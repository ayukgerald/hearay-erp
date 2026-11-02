import { Approve } from "./approve";

export const metadata = { title: "Approve on your phone" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Approve id={id} />;
}
