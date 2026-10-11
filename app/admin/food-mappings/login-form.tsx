"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Token sign-in for the admin review interface. */
export function AdminLoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Invalid admin token." : "Admin review is unavailable.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <label htmlFor="admin-token" className="block text-sm font-medium">Admin token</label>
      <input
        id="admin-token"
        type="password"
        className="w-full rounded-md border p-2 text-sm"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        autoComplete="off"
      />
      <Button type="submit" disabled={submitting || !token}>{submitting ? "Signing in..." : "Sign in"}</Button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
