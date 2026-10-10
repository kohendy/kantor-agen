import { logout } from "@/app/actions";

export function DashboardHeader({ email }: { email: string }) {
  return (
    <header>
      <div>
        <h1>Kantor Agent</h1>
        <p>
          Kantor kampanye isometrik. Aktivitas di Mission Log berasal dari tabel{" "}
          <code>events</code> di Supabase, bukan data contoh.
        </p>
      </div>
      <div className="dash-header">
        <span className="dash-user">{email}</span>
        <form action={logout}>
          <button className="logout-btn" type="submit">
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
