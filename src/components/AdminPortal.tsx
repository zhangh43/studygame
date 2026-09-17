"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminUser, GroupEvaluation } from "@/lib/admin";

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
function EvaluationRow({ group, course }: { group: GroupEvaluation; course: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    setBusy(true); setFeedback("");
    try {
      await save({ action: "evaluation", courseNumber: course, groupNumber: group.groupNumber, completed: values.has("completed"), presented: values.has("presented"), notes: values.get("notes") });
      setFeedback("Saved.");
    } catch (error) { setFeedback(message(error)); } finally { setBusy(false); }
  }
  return <tr><th scope="row">{group.groupNumber}</th><td>{group.members.map(member => <div key={member.id}>{member.name} <small className="muted">({member.email})</small></div>)}</td><td><strong aria-label={`${group.stars} stars`}>★ {group.stars}</strong></td><td><form className="admin-evaluation-form" onSubmit={submit}>
    <label><input type="checkbox" name="completed" defaultChecked={group.completed} /> Task completed</label>
    <label><input type="checkbox" name="presented" defaultChecked={group.presented} /> Task presented</label>
    <textarea name="notes" aria-label={`Notes for group ${group.groupNumber}`} defaultValue={group.notes} maxLength={4000} placeholder="Evaluation notes" rows={2} />
    <button className="secondary-button" disabled={busy}>Save evaluation</button><span role="status">{feedback}</span>
  </form></td></tr>;
}
export function AdminPortal({ initialUsers, initialSignupEnabled }: { initialUsers: AdminUser[]; initialSignupEnabled: boolean }) {
  const [users, setUsers] = useState(initialUsers);
  const [signup, setSignup] = useState(initialSignupEnabled);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [course, setCourse] = useState("");
  const [sheet, setSheet] = useState<{ course: string; groups: GroupEvaluation[] } | null>(null);
  const [sheetError, setSheetError] = useState("");
  const [revision, setRevision] = useState(0);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState("");
  const courses = [...new Set(users.filter(user => !user.isAdmin).map(user => user.courseNumber).filter((value): value is string => !!value))].sort();
  useEffect(() => {
    if (!course) return;
    const controller = new AbortController();
    fetch(`/api/admin?course=${encodeURIComponent(course)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!controller.signal.aborted) setSheet({ course, groups: result.groups });
    }).catch(error => { if (!controller.signal.aborted) setSheetError(message(error)); });
    return () => controller.abort();
  }, [course, revision]);
  function refreshSheet() { setSheet(null); setSheetError(""); setRevision(value => value + 1); }
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
  const unassigned = users.filter(user => !user.isAdmin && user.courseNumber === course && !user.groupNumber);
  return <div className="admin-sections">
    <section className="admin-panel"><h2>New user signup</h2><p>Registration is <strong>{signup ? "enabled" : "disabled"}</strong>. Existing users can still sign in.</p><button className="secondary-button" disabled={busy} onClick={toggleSignup}>{signup ? "Disable signup" : "Enable signup"}</button><p role="status">{feedback}</p></section>
    <section className="admin-panel"><h2>Registered users ({users.length})</h2><p className="muted">Course and group numbers are optional text fields. Clear a field to remove the assignment. Setting a new password signs the user out.</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Course number</th><th>Group number</th><th>New password</th><th>Action</th></tr></thead><tbody>{users.map(user => <UserRow key={user.id} user={user} onSaved={updated => { setUsers(current => current.map(item => item.id === updated.id ? updated : item)); refreshSheet(); }} />)}</tbody></table></div></section>
    <section className="admin-panel"><h2>Course evaluation sheet</h2><p className="muted">Completion, presentation, and notes apply to the group in this course. Stars are read-only totals from all games created by its current members. Refresh to fetch the latest counts.</p><div className="admin-course-picker"><label>Course <select value={course} onChange={event => { setCourse(event.target.value); setSheet(null); setSheetError(""); }}><option value="">Choose a course</option>{[...new Set([...courses, ...(course ? [course] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className="secondary-button" disabled={!course} onClick={refreshSheet}>Refresh sheet</button></div>
      {!courses.length && <p>Assign course numbers to users above to create a course sheet.</p>}
      {sheetError && <p role="alert" className="form-error">{sheetError}</p>}
      {course && !sheet && !sheetError && <p role="status">Loading evaluations…</p>}
      {sheet?.course === course && <><div className="admin-table-scroll"><table className="admin-table"><caption>Course {course}</caption><thead><tr><th>Group</th><th>Members</th><th>Stars</th><th>Evaluation</th></tr></thead><tbody>{sheet.groups.map(group => <EvaluationRow key={`${course}:${group.groupNumber}:${revision}`} group={group} course={course} />)}</tbody></table></div>{!sheet.groups.length && <p>No groups assigned in this course.</p>}</>}
      {course && unassigned.length > 0 && <p><strong>Awaiting group assignment:</strong> {unassigned.map(user => user.email).join(", ")}. Assign groups in Registered users.</p>}
    </section>
    <section className="admin-panel"><h2>Change admin password</h2><form className="stack-form admin-password-form" onSubmit={changePassword}><label>Current password<input type="password" name="currentPassword" autoComplete="current-password" maxLength={200} required /></label><label>New password<input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={200} required /></label><label>Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" minLength={6} maxLength={200} required /></label><button className="primary-button" disabled={passwordBusy}>Change password</button><p role="status">{passwordFeedback}</p></form></section>
  </div>;
}
