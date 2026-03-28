"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { PanelLeftOpen, PanelRightOpen, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

// Create a simple event-based sidebar toggle system
type SidebarToggleEvent = CustomEvent<{ type: "toggle" }>

// Function to dispatch a custom event for sidebar toggle
const toggleSidebar = () => {
  // Create and dispatch a custom event that the sidebar can listen for
  const event = new CustomEvent("sidebar-toggle", { detail: { type: "toggle" } }) as SidebarToggleEvent
  document.dispatchEvent(event)
}

export function DashboardHeader() {
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // Listen for sidebar state changes
  useEffect(() => {
    const handleSidebarStateChange = (e: CustomEvent<{ isOpen: boolean }>) => {
      setIsSidebarOpen(e.detail.isOpen)
    }

    // Add event listener
    document.addEventListener("sidebar-state-change", handleSidebarStateChange as EventListener)

    // Check initial state from localStorage
    const storedState = localStorage.getItem("sidebar-state")
    if (storedState) {
      setIsSidebarOpen(storedState === "open")
    }

    // Clean up
    return () => {
      document.removeEventListener("sidebar-state-change", handleSidebarStateChange as EventListener)
    }
  }, [])

  // Function to generate breadcrumb items based on the current path
  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean)

    // Create breadcrumb items
    const breadcrumbs = []

    // Add Dashboard as the first item
    breadcrumbs.push({
      label: "Dashboard",
      href: "/admin/dashboard",
      isCurrent: paths.length <= 1,
    })

    // Add additional breadcrumb items based on the path
    if (paths.length > 1) {
      const lastSegment = paths[paths.length - 1]
      let label = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1)

      if (lastSegment === "events") label = "Veranstaltungen"
      if (lastSegment === "news") label = "News"
      if (lastSegment === "feedback") label = "Feedback"
      if (lastSegment === "admins") label = "Admins"
      if (lastSegment === "settings") label = "Einstellungen"
      if (lastSegment === "speisekarten") label = "Speisekarten"
      if (lastSegment === "movies") label = "Kinoprogramm"

      breadcrumbs.push({
        label,
        href: pathname,
        isCurrent: true,
      })
    }

    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <header className="h-16 flex items-center justify-between gap-4 border-b bg-card px-4">
      <nav className="flex items-center gap-1 text-sm">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
          {isSidebarOpen ? <PanelRightOpen className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          <span className="sr-only">{isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}</span>
        </Button>
        {breadcrumbs.map((breadcrumb, index) => (
          <div key={breadcrumb.href} className="flex items-center">
            {index > 0 && <span className="mx-2 text-muted-foreground">›</span>}
            {breadcrumb.isCurrent ? (
              <span className="font-medium">{breadcrumb.label}</span>
            ) : (
              <Link href={breadcrumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {breadcrumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Database Search */}
      <div className="relative max-w-md w-full hidden md:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input type="search" placeholder="Datenbank durchsuchen..." className="pl-8 w-full bg-card" />
      </div>
    </header>
  )
}
