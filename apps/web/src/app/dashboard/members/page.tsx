"use client";

import OrgManagePage from "@/app/app/org/manage/page";

/**
 * Members management lives at /app/org/manage. This route mounts the same
 * UI inside the org dashboard so it appears in the sub_type-aware sidebar.
 */
export default function OrgDashboardMembersPage() {
  return <OrgManagePage />;
}
