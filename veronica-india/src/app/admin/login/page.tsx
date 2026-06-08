"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import { safeAdminReturnTo } from "@/lib/admin-welcome";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeAdminReturnTo(searchParams.get("returnTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminApi.login(email, password);
      const destination = encodeURIComponent(returnTo);
      router.replace(`/admin/welcome?returnTo=${destination}`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            <span className="text-brand-orange">V</span>ERONICA
          </h1>
          <p className="text-white/40 text-sm mt-1">Admin Portal</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <label className="input-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="admin@test.local"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="input-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="text-sm text-danger font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-6">
          Mock credentials: admin@test.local / admin123
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-black" />}>
      <LoginForm />
    </Suspense>
  );
}
