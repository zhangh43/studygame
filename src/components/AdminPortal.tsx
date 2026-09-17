"use client";

import { FormEvent, useState } from "react";
import type { AdminUser } from "@/lib/admin";

async function save(body: unknown) {
  const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save changes.");
}
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed. Please try again."; }

function UserRow({ user, onSaved }: { user: AdminUser; onSaved: (user: AdminUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const groupNumber = String(values.get("groupNumber")).trim();
    const courseNumber = String(values.get("courseNumber")).trim();
    const password = String(values.get("password"));
    setBusy(true); setFeedback("");
    try {
      await save({ action: "user", userId: user.id, groupNumber, courseNumber, ...(password ? { password } : {}) });
      onSaved({ ...user, groupNumber: groupNumber || null, courseNumber: courseNumber || null });
      (form.elements.namedItem("password") as HTMLInputElement).value = "";
      setFeedback("Saved.");
    } catch (error) { setFeedback(message(error)); } finally { setBusy(false); }
  }
  return <tr><td><strong>{user.displayName}</strong><br />{user.email}<br /><small className="muted">Joined {user.createdAt.slice(0, 10)}</small></td><td colSpan={4}>{user.isAdmin ? <span>Administrator · change your password below</span> : <form className="admin-user-form" onSubmit={submit}>
    <input aria-label={`Course for ${user.email}`} name="courseNumber" defaultValue={user.courseNumber ?? ""} maxLength={100} placeholder="No course" />
    <input aria-label={`Group for ${user.email}`} name="groupNumber" defaultValue={user.groupNumber ?? ""} maxLength={100} placeholder="No group" />
    <input aria-label={`New password for ${user.email}`} name="password" type="password" autoComplete="new-password" minLength={6} maxLength={200} placeholder="Leave unchanged" />
    <button className="secondary-button" disabled={busy}>Save user</button><span className="admin-feedback" role="status">{feedback}</span>
  </form>}</td></tr>;
}
export function AdminPortal({ initialUsers, initialSignupEnabled }: { initialUsers: AdminUser[]; initialSignupEnabled: boolean }) {
  const [users, setUsers] = useState(initialUsers);
  const [signup, setSignup] = useState(initialSignupEnabled);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState("");
  async function toggleSignup() {
    setBusy(true); setFeedback("");
    try { await save({ action: "signup", enabled: !signup }); setSignup(!signup); setFeedback("Signup setting saved."); }
    catch (error) { setFeedback(message(error)); } finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (values.get("password") !== values.get("confirmPassword")) { setPasswordFeedback("New passwords do not match."); return; }
    setPasswordBusy(true); setPasswordFeedback("");
    try { await save({ action: "password", currentPassword: values.get("currentPassword"), password: values.get("password") }); form.reset(); setPasswordFeedback("Password changed. Other admin sessions have been signed out."); }
    catch (error) { setPasswordFeedback(message(error)); } finally { setPasswordBusy(false); }
  }
  return <div className="admin-sections">
    <section className="admin-panel"><h2>New user signup</h2><p>Registration is <strong>{signup ? "enabled" : "disabled"}</strong>. Existing users can still sign in.</p><button className="secondary-button" disabled={busy} onClick={toggleSignup}>{signup ? "Disable signup" : "Enable signup"}</button><p role="status">{feedback}</p></section>
    <section className="admin-panel"><h2>Registered users ({users.length})</h2><p className="muted">Course and group numbers are optional text fields. Clear a field to remove the assignment. Setting a new password signs the user out.</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Course number</th><th>Group number</th><th>New password</th><th>Action</th></tr></thead><tbody>{users.map(user => <UserRow key={user.id} user={user} onSaved={updated => { setUsers(current => current.map(item => item.id === updated.id ? updated : item)); }} />)}</tbody></table></div></section>
    <section className="admin-panel"><h2>Change admin password</h2><form className="stack-form admin-password-form" onSubmit={changePassword}><label>Current password<input type="password" name="currentPassword" autoComplete="current-password" maxLength={200} required /></label><label>New password<input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={200} required /></label><label>Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={200} required /></label><button className="primary-button" disabled={passwordBusy}>Change password</button><p role="status">{passwordFeedback}</p></form></section>
  </div>;
}
