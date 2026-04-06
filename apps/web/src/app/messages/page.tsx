import MessagesPageClient from "./MessagesPageClient";

// Prevent static prerendering — requires AccountProvider context at runtime
export const dynamic = "force-dynamic";

export default function MessagesPage() {
  return <MessagesPageClient />;
}
