import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MV Boxen Landesmeisterschaft | Röbel App",
  description:
    "Erlebe die MV Boxen Landesmeisterschaft live vor Ort oder im Livestream. Sichere dir jetzt dein Ticket!",
};

export default function LandesmeisterschaftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
