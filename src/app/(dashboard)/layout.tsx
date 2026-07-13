import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={session.name} userRole={session.role} />
      <main className="flex-1 overflow-y-auto p-4 pt-[4.5rem] lg:p-6">{children}</main>
    </div>
  );
}
