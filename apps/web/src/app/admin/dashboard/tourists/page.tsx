import { redirect } from "next/navigation";

export default function TouristsIndexPage() {
  redirect("/admin/dashboard/tourists/pois");
}
