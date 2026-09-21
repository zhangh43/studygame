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

function UserRow({ user, onSaved }: { user: AdminUser; onSaved: (user: AdminUser) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const { feedback, setFeedback } = useAdminFeedback();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const groupNumber = String(values.get("groupNumber")).trim();
    const courseNumber = String(values.get("courseNumber")).trim();
    const password = String(values.get("password"));
    setBusy(true); setFeedback(null);
    try {
      await save({ action: "user", userId: user.id, groupNumber, courseNumber, ...(password ? { password } : {}) });
      onSaved({ ...user, groupNumber: groupNumber || null, courseNumber: courseNumber || null });
      (form.elements.namedItem("password") as HTMLInputElement).value = "";
      setFeedback({ key: password ? "admin.userPasswordSaved" : "admin.saved" });
    } catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  return <tr><td><strong>{user.displayName}</strong><br />{user.email}<br /><small className="muted">{t("admin.joined", { date: user.createdAt.slice(0, 10) })}</small></td><td colSpan={4}>{user.isAdmin ? <span>{t("admin.adminAccount")}</span> : <form className="admin-user-form" onSubmit={submit}>
    <input aria-label={t("admin.userCourse", { user: user.email })} name="courseNumber" defaultValue={user.courseNumber ?? ""} maxLength={100} placeholder={t("admin.noCourse")} />
    <input aria-label={t("admin.userGroup", { user: user.email })} name="groupNumber" defaultValue={user.groupNumber ?? ""} maxLength={100} placeholder={t("admin.noGroup")} />
    <input aria-label={t("admin.userPassword", { user: user.email })} name="password" type="password" autoComplete="new-password" minLength={6} maxLength={200} placeholder={t("admin.leavePassword")} />
    <button className="secondary-button" disabled={busy}>{t(busy ? "admin.saving" : "admin.saveUser")}</button><span className="admin-feedback" role="status">{feedback}</span>
  </form>}</td></tr>;
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
    <section className="admin-panel"><h2>{t("admin.registeredUsers", { count: users.length })}</h2><p className="muted">{t("admin.assignmentsHint")}</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>{t("admin.user")}</th><th>{t("admin.courseNumber")}</th><th>{t("admin.groupNumber")}</th><th>{t("auth.newPassword")}</th><th>{t("admin.action")}</th></tr></thead><tbody>{users.map(user => <UserRow key={user.id} user={user} onSaved={updated => { setUsers(current => current.map(item => item.id === updated.id ? updated : item)); }} />)}</tbody></table></div></section>
    <section className="admin-panel"><h2>{t("admin.changeAdminPassword")}</h2><form className="stack-form admin-password-form" onSubmit={changePassword}><label>{t("admin.currentPassword")}<input type="password" name="currentPassword" autoComplete="current-password" maxLength={200} required /></label><label>{t("auth.newPassword")}<input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={200} required /></label><label>{t("admin.confirmPassword")}<input type="password" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={200} required /></label><button className="primary-button" disabled={passwordBusy}>{t(passwordBusy ? "admin.saving" : "admin.changePassword")}</button><p role="status">{passwordFeedback}</p></form></section>
  </div>;
}
