"use client";

import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { AppRightPanel } from "./AppRightPanel";
import { AppMobileNav } from "./AppMobileNav";
import { MessageNotificationListener } from "./MessageNotificationListener";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1280px] mx-auto flex min-h-screen">
        {/* Desktop sidebar — sticky, collapses at md */}
        <aside className="hidden md:flex md:w-[72px] lg:w-64 flex-col flex-shrink-0 sticky top-0 h-screen transition-all duration-200">
          <AppSidebar />
        </aside>

        {/* Mobile sidebar (Sheet overlay) */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-64">
            <AppSidebar />
          </SheetContent>
        </Sheet>

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0">
          <AppHeader onToggleMobileSidebar={() => setMobileSidebarOpen(true)} />

          <main className="flex-1 pb-16 md:pb-0">
            <div className="px-4 sm:px-6 lg:px-8 py-6 lg:flex lg:gap-8">
              {/* Center content */}
              <div className="flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0">
                {children}
              </div>

              {/* Right panel — desktop only */}
              <aside className="hidden xl:block xl:w-80 flex-shrink-0">
                <AppRightPanel />
              </aside>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <AppMobileNav />

      {/* Background listener for unread message badges */}
      <MessageNotificationListener />
    </div>
  );
}
