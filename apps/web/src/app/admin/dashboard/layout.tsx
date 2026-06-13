import type React from "react"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { DashboardHeader } from "@/components/admin/dashboard-header"
import { isAuthenticated } from "@/lib/auth/session"

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Defense in depth: middleware already gates this route, but verify the
  // session server-side here too so the dashboard never renders unauthenticated.
  if (!(await isAuthenticated())) {
    redirect("/admin/login")
  }

  return (
    <div className="flex h-screen bg-card">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
