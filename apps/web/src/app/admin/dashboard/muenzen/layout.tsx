import type React from "react";
import { MuenzenTabs } from "@/components/admin/muenzen/MuenzenTabs";

// Section sub-layout for the Röbel Münzen tokenomics console. The parent
// /admin/dashboard layout already gates the admin session; this just adds the
// tab navigation shared across the five sub-pages.
export default function MuenzenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <MuenzenTabs />
      {children}
    </div>
  );
}
