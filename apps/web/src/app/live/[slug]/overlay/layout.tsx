import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overlay · Röbel App Live",
  robots: { index: false, follow: false },
};

// OBS browser source: the root layout still renders <html>/<body>, the footer and toasters,
// so this layout forces everything transparent and hides site chrome for the overlay only.
const TRANSPARENT_CSS = `
html, body { background: transparent !important; background-color: transparent !important; overflow: hidden !important; }
body > * { background: transparent !important; }
footer, [data-sonner-toaster], [role="region"][aria-label*="otification"] { display: none !important; }
::-webkit-scrollbar { display: none; }
@keyframes live-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`;

export default function LiveOverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TRANSPARENT_CSS }} />
      {children}
    </>
  );
}
