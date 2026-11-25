"use client";
import { useEffect, useState } from "react";
export default function Login() {
  const [email, E] = useState(""),
    [password, P] = useState(""),
    [msg, M] = useState(""),
    [recovery, R] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (
      p.has("access_token") &&
      ["recovery", "invite"].includes(p.get("type") || "")
    ) {
      R(p);
      history.replaceState(null, "", "/login");
    } else {
      fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"action":"refresh"}',
      })
        .then((r) => {
          if (r.ok) location.replace("/");
        })
        .catch(() => {});
    }
  }, []);
  async function send(action: string) {
    M("Working…");
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email: email || undefined,
          password,
          access: recovery?.get("access_token") || undefined,
          refresh: recovery?.get("refresh_token") || undefined,
        }),
      });
      if (!r.ok) throw Error();
      if (action === "activate")
        M("Check your email to confirm your account, then sign in.");
      else if (action === "reset")
        M(
          "Check your email for a recovery link if your account is authorized.",
        );
      else location.replace("/");
    } catch {
      M(
        "Unable to sign in. Check your credentials or contact your administrator.",
      );
    }
  }
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }}>
      <img src="/brand/white.webp" alt="Keystone Estate Care" width="150" />
      <h1>{recovery ? "Set your password" : "Employee sign-in"}</h1>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void send(recovery ? "recover" : "login");
        }}
      >
        {!recovery && (
          <label>
            Work email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => E(e.target.value)}
            />
          </label>
        )}
        <label>
          {recovery ? "New password (12 characters minimum)" : "Password"}
          <input
            required
            type="password"
            minLength={recovery ? 12 : 1}
            autoComplete={recovery ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => P(e.target.value)}
          />
        </label>
        <button>{recovery ? "Save password" : "Sign in"}</button>
      </form>
      {!recovery && (
        <button disabled={!email} onClick={() => send("reset")}>
          Reset password
        </button>
      )}
      {!recovery && (
        <button
          disabled={!email || password.length < 12}
          onClick={() => send("activate")}
        >
          Activate invited account
        </button>
      )}
      <p role="status">{msg}</p>
    </main>
  );
}
