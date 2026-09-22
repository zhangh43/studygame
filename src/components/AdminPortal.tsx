"use client";

import { FormEvent, useState } from "react";
import type { AdminUser } from "@/lib/admin";
import { useI18n } from "@/components/I18nProvider";
import { useAdminFeedback } from "@/components/useAdminFeedback";

async function save(body: unknown) {
  const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save changes.");
}

function UserRow({ user, onSaved, onDeleted }: { user: AdminUser; onSaved: (user: AdminUser) => void; onDeleted: (id: string) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const { feedback, setFeedback } = useAdminFeedback();
  const formId = `user-${user.id}`;
  async function deleteUser() {
    if (!window.confirm(t("admin.deleteConfirm", { user: user.email }))) return;
    setBusy(true); setFeedback(null);
    try { await save({ action: "deleteUser", userId: user.id }); onDeleted(user.id); }
    catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const groupNumber = String(values.get("groupNumber")).trim();
    const courseNumber = String(values.get("courseNumber")).trim();
    const password = String(values.get("password"));
    const displayName = String(values.get("displayName")).trim();
    const identifier = String(values.get("identifier")).trim().toLowerCase();
    setBusy(true); setFeedback(null);
    try {
      await save({ action: "user", userId: user.id, displayName, identifier, groupNumber, courseNumber, ...(password ? { password } : {}) });
      onSaved({ ...user, displayName, email: identifier, groupNumber: groupNumber || null, courseNumber: courseNumber || null });
      (form.elements.namedItem("password") as HTMLInputElement).value = "";
      (form.elements.namedItem("displayName") as HTMLInputElement).value = displayName;
      (form.elements.namedItem("identifier") as HTMLInputElement).value = identifier;
      setFeedback({ key: password ? "admin.userPasswordSaved" : "admin.saved" });
    } catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  if (user.isAdmin) return <tr><td>{user.displayName}</td><td>{user.email}</td><td><time dateTime={user.createdAt.slice(0, 10)}>{user.createdAt.slice(0, 10)}</time></td><td colSpan={4}>{t("admin.adminAccount")}</td></tr>;
  return <tr>
    <td><input form={formId} aria-label={t("admin.userDisplayName", { user: user.email })} name="displayName" defaultValue={user.displayName} minLength={2} maxLength={80} required disabled={busy} /></td>
    <td><input form={formId} aria-label={t("admin.userIdentifier", { user: user.email })} name="identifier" defaultValue={user.email} maxLength={254} autoCapitalize="none" spellCheck={false} required disabled={busy} /></td>
    <td><time dateTime={user.createdAt.slice(0, 10)}>{user.createdAt.slice(0, 10)}</time></td>
    <td><input form={formId} aria-label={t("admin.userCourse", { user: user.email })} name="courseNumber" defaultValue={user.courseNumber ?? ""} maxLength={100} placeholder={t("admin.noCourse")} disabled={busy} /></td>
    <td><input form={formId} aria-label={t("admin.userGroup", { user: user.email })} name="groupNumber" defaultValue={user.groupNumber ?? ""} maxLength={100} placeholder={t("admin.noGroup")} disabled={busy} /></td>
    <td><input form={formId} aria-label={t("admin.userPassword", { user: user.email })} name="password" type="password" autoComplete="new-password" minLength={6} maxLength={200} placeholder={t("admin.leavePassword")} disabled={busy} /></td>
    <td><form id={formId} className="admin-user-actions" onSubmit={submit}>
      <button className="secondary-button" disabled={busy}>{t(busy ? "admin.saving" : "admin.saveUser")}</button>
      <button type="button" className="secondary-button danger-button" disabled={busy} onClick={deleteUser}>{t("admin.deleteUser")}</button>
      <span role="status">{feedback}</span>
    </form></td>
  </tr>;
}
export function AdminPortal({ initialUsers, initialSignupEnabled }: { initialUsers: AdminUser[]; initialSignupEnabled: boolean }) {
  const { t } = useI18n();
  const [users, setUsers] = useState(initialUsers);
  const [signup, setSignup] = useState(initialSignupEnabled);
  const [busy, setBusy] = useState(false);
  const { feedback, setFeedback } = useAdminFeedback();
  const [passwordBusy, setPasswordBusy] = useState(false);
  const { feedback: passwordFeedback, setFeedback: setPasswordFeedback } = useAdminFeedback();
  async function toggleSignup() {
    setBusy(true); setFeedback(null);
    try { await save({ action: "signup", enabled: !signup }); setSignup(!signup); setFeedback({ key: "admin.signupSaved" }); }
    catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (values.get("password") !== values.get("confirmPassword")) { setPasswordFeedback({ key: "admin.passwordMismatch" }); return; }
    setPasswordBusy(true); setPasswordFeedback(null);
    try { await save({ action: "password", currentPassword: values.get("currentPassword"), password: values.get("password") }); form.reset(); setPasswordFeedback({ key: "admin.passwordChanged" }); }
    catch (error) { setPasswordFeedback({ error }); } finally { setPasswordBusy(false); }
  }
  return <div className="admin-sections">
    <section className="admin-panel"><h2>{t("admin.signupTitle")}</h2><p>{t(signup ? "admin.signupEnabled" : "admin.signupDisabled")}</p><button className="secondary-button" disabled={busy} onClick={toggleSignup}>{t(busy ? "admin.saving" : signup ? "admin.disableSignup" : "admin.enableSignup")}</button><p role="status">{feedback}</p></section>
    <section className="admin-panel"><h2>{t("admin.registeredUsers", { count: users.length })}</h2><p className="muted">{t("admin.assignmentsHint")}</p><div className="admin-table-scroll"><table className="admin-table admin-users-table"><thead><tr><th>{t("auth.displayName")}</th><th>{t("auth.identifier")}</th><th>{t("admin.joinDate")}</th><th>{t("admin.courseNumber")}</th><th>{t("admin.groupNumber")}</th><th>{t("auth.newPassword")}</th><th>{t("admin.action")}</th></tr></thead><tbody>{users.map(user => <UserRow key={user.id} user={user} onDeleted={id => setUsers(current => current.filter(item => item.id !== id))} onSaved={updated => { setUsers(current => current.map(item => item.id === updated.id ? updated : item)); }} />)}</tbody></table></div></section>
    <section className="admin-panel"><h2>{t("admin.changeAdminPassword")}</h2><form className="stack-form admin-password-form" onSubmit={changePassword}><label>{t("admin.currentPassword")}<input type="password" name="currentPassword" autoComplete="current-password" maxLength={200} required /></label><label>{t("auth.newPassword")}<input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={200} required /></label><label>{t("admin.confirmPassword")}<input type="password" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={200} required /></label><button className="primary-button" disabled={passwordBusy}>{t(passwordBusy ? "admin.saving" : "admin.changePassword")}</button><p role="status">{passwordFeedback}</p></form></section>
  </div>;
}
