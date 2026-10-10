import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Kantor Agent</h1>
        <p className="sub">Masuk untuk memantau aktivitas agent AI kampanye.</p>
        <LoginForm />
      </div>
    </div>
  );
}
