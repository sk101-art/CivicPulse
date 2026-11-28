"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
export function PasswordChangeForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="space-y-4 rounded-xl border border-[#DDDCD3] bg-white p-6" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmation")) { setMessage("New passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Password could not be changed."); return; }
      form.reset();
      setMessage("Password changed. Signing you out so you can use your new password.");
      await signOut({ callbackUrl: "/login" });
    } catch { setMessage("Connection failed. Please try again."); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-xl font-semibold">Change password</h2>
    <p>Changing your password invalidates existing sessions when they next contact the server.</p>
    <label className="block">Current password<input className="block w-full rounded border p-2" name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} /></label>
    <label className="block">New password (at least 12 characters)<input className="block w-full rounded border p-2" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
    <label className="block">Confirm new password<input className="block w-full rounded border p-2" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
    <p role="status" aria-live="polite">{message}</p>
    <button className="rounded bg-[#355858] px-4 py-2 text-white disabled:opacity-50" disabled={busy}>{busy ? "Changing password…" : "Change password"}</button>
  </form>;
}
