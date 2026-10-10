import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // Proxy sudah mengarahkan pengguna tanpa session ke /login, ini jaga-jaga saja.
  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="wrap">
      <DashboardHeader email={data.user.email ?? ""} />
      <Dashboard />
    </div>
  );
}
