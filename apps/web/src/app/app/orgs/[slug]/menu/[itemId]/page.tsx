import { MenuItemClient } from "./MenuItemClient";

export const dynamic = "force-dynamic";

export default async function MenuItemPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  return <MenuItemClient slug={slug} itemId={itemId} />;
}
