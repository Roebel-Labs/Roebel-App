"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Calendar, LogOut, ChevronRight, Newspaper, MessageSquare, Film, UtensilsCrossed, Bell, Store, Bot, AlertTriangle, Flag, Megaphone, HelpCircle, CreditCard, Gift, UserCog, Map } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { NotificationDot } from "@/components/ui/notification-dot"
import { toast } from "@/hooks/use-toast"
import { useNotificationCounts } from "@/hooks/useNotificationCounts"
import { logoutAction } from "@/app/actions/dashboard-auth"
import type { NotificationCounts } from "@/app/actions/notification-counts"

export function AdminSidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false
  const { counts } = useNotificationCounts(60000) // Poll every 60 seconds

  const broadcastSidebarState = (isOpen: boolean) => {
    setTimeout(() => {
      const event = new CustomEvent("sidebar-state-change", { detail: { isOpen } })
      document.dispatchEvent(event)
      localStorage.setItem("sidebar-state", isOpen ? "open" : "closed")
    }, 0)
  }

  useEffect(() => {
    const storedState = localStorage.getItem("sidebar-state")
    if (storedState && !isMobile) {
      setIsCollapsed(storedState === "closed")
    } else if (isMobile) {
      setIsCollapsed(false)
    }
  }, [isMobile])

  useEffect(() => {
    const handleToggle = () => {
      if (window.innerWidth < 768) {
        broadcastSidebarState(true)
        return
      }

      setIsCollapsed((prev) => {
        const newState = !prev
        broadcastSidebarState(!newState)
        return newState
      })
    }

    document.addEventListener("sidebar-toggle", handleToggle)
    return () => {
      document.removeEventListener("sidebar-toggle", handleToggle)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await logoutAction()
      toast({
        title: "Erfolgreich abgemeldet",
        description: "Sie werden zur Anmeldeseite weitergeleitet.",
      })
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Abmeldung fehlgeschlagen.",
        variant: "destructive",
      })
    }
  }

  const isActive = (path: string) => {
    if (path === "/admin/dashboard") {
      return pathname === path
    }
    return pathname === path || pathname?.startsWith(path)
  }

  const mainLinks: {
    name: string
    href: string
    icon: React.ReactNode
    badgeKey: keyof NotificationCounts | null
  }[] = [
    {
      name: "Übersicht",
      href: "/admin/dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
      badgeKey: null,
    },
    {
      name: "Röbel Card",
      href: "/admin/dashboard/roebel-card",
      icon: <CreditCard className="h-5 w-5" />,
      badgeKey: null,
    },
    {
      name: "Veranstaltungen",
      href: "/admin/dashboard/events",
      icon: <Calendar className="h-5 w-5" />,
      badgeKey: "events",
    },
    {
      name: "News",
      href: "/admin/dashboard/news",
      icon: <Newspaper className="h-5 w-5" />,
      badgeKey: "news",
    },
    {
      name: "Feedback",
      href: "/admin/dashboard/feedback",
      icon: <MessageSquare className="h-5 w-5" />,
      badgeKey: "feedback",
    },
    {
      name: "Kinoprogramm",
      href: "/admin/dashboard/movies",
      icon: <Film className="h-5 w-5" />,
      badgeKey: "movies",
    },
    {
      name: "Speisekarten",
      href: "/admin/dashboard/speisekarten",
      icon: <UtensilsCrossed className="h-5 w-5" />,
      badgeKey: "speisekarten",
    },
    {
      name: "Gewerbe",
      href: "/admin/dashboard/gewerbe",
      icon: <Store className="h-5 w-5" />,
      badgeKey: "businesses",
    },
    {
      name: "Touristen",
      href: "/admin/dashboard/tourists",
      icon: <Map className="h-5 w-5" />,
      badgeKey: "touristHelpRequests",
    },
    {
      name: "Externe Konten",
      href: "/admin/dashboard/extern-accounts",
      icon: <UserCog className="h-5 w-5" />,
      badgeKey: "externAccounts",
    },
    {
      name: "Meldungen",
      href: "/admin/dashboard/alerts",
      icon: <AlertTriangle className="h-5 w-5" />,
      badgeKey: "alerts",
    },
    {
      name: "Ankündigungen",
      href: "/admin/dashboard/announcements",
      icon: <Megaphone className="h-5 w-5" />,
      badgeKey: null,
    },
    {
      name: "Gemeldete Beiträge",
      href: "/admin/dashboard/flagged-posts",
      icon: <Flag className="h-5 w-5" />,
      badgeKey: "flaggedPosts",
    },
    {
      name: "Push-Benachrichtigungen",
      href: "/admin/dashboard/notifications",
      icon: <Bell className="h-5 w-5" />,
      badgeKey: "pushNotifications",
    },
    {
      name: "Mecky Bot",
      href: "/admin/dashboard/mecky",
      icon: <Bot className="h-5 w-5" />,
      badgeKey: "meckyDrafts",
    },
    {
      name: "Hilfe & Tipps",
      href: "/admin/dashboard/help",
      icon: <HelpCircle className="h-5 w-5" />,
      badgeKey: null,
    },
    {
      name: "Belohnungen",
      href: "/admin/dashboard/rewards",
      icon: <Gift className="h-5 w-5" />,
      badgeKey: null,
    },
  ]

  const closeMobileSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      document.dispatchEvent(new CustomEvent("sidebar-toggle"))
    }
  }

  return (
    <div
      className={`${
        isCollapsed ? "w-20" : "w-64"
      } h-screen bg-card border-r border-border flex flex-col transition-all duration-300`}
    >
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center px-4 bg-card">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img
            src="/logo.png"
            alt="Wappen Röbel/Müritz"
            className="w-8 h-8 object-contain"
          />
          {!isCollapsed && <span className="font-medium tracking-tight text-lg">Röbel App</span>}
          
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <div className="mb-6">
          {!isCollapsed && (
            <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Hauptseiten</h3>
          )}
          <nav className="space-y-1">
            {mainLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md group transition-colors ${
                  isActive(link.href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={isCollapsed ? link.name : undefined}
                onClick={closeMobileSidebar}
              >
                <span className={`relative mr-3 ${isActive(link.href) ? "text-foreground" : "text-muted-foreground"}`}>
                  {link.icon}
                  {isCollapsed && link.badgeKey && counts && counts[link.badgeKey] > 0 && (
                    <NotificationDot
                      count={counts[link.badgeKey]}
                      size="sm"
                      className="absolute -top-1 -right-1"
                    />
                  )}
                </span>
                {!isCollapsed && (
                  <>
                    <span className="flex-1">{link.name}</span>
                    {link.badgeKey && counts && counts[link.badgeKey] > 0 && (
                      <NotificationDot
                        count={counts[link.badgeKey]}
                        showNumber
                        size="md"
                        className="mr-2"
                      />
                    )}
                    {isActive(link.href) && <ChevronRight className="h-4 w-4" />}
                  </>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Footer with user info */}
      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div>
                <p className="text-sm font-medium">Admin</p>
                <p className="text-xs text-muted-foreground truncate max-w-[120px]">admin@roebel.de</p>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="shrink-0">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Abmelden</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
