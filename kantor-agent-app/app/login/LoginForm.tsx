"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action}>
      {state?.error && <p className="login-error">{state.error}</p>}
      <div className="login-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="login-field">
        <label htmlFor="password">Kata Sandi</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <button className="login-submit" type="submit" disabled={pending}>
        {pending ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}
