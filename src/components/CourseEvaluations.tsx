"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { CourseSheet, GroupEvaluation, Lesson, LessonEvaluation } from "@/lib/admin";

async function save(body: unknown) {
  const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save changes.");
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Request failed. Please try again."; }

type Evaluation = Pick<LessonEvaluation, "completed" | "presented" | "notes">;
function EvaluationForm({ initial, onSave, label }: { initial: Evaluation; onSave: (value: Evaluation) => Promise<void>; label: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setFeedback("");
    try {
      await onSave({ completed: values.has("completed"), presented: values.has("presented"), notes: String(values.get("notes")) });
      setFeedback("Saved.");
    } catch (error) { setFeedback(errorMessage(error)); } finally { setBusy(false); }
  }
  return <form className="admin-evaluation-form" aria-label={label} onSubmit={submit}>
    <label><input type="checkbox" name="completed" defaultChecked={initial.completed} /> Task completed</label>
    <label><input type="checkbox" name="presented" defaultChecked={initial.presented} /> Task presented</label>
    <textarea name="notes" aria-label={`${label} notes`} defaultValue={initial.notes} maxLength={4000} placeholder="Evaluation notes" rows={2} />
    <button className="secondary-button" disabled={busy}>{busy ? "Saving…" : "Save evaluation"}</button>
    <span role="status">{feedback}</span>
  </form>;
}
function Members({ group }: { group: GroupEvaluation }) {
  return group.members.length ? <>{group.members.map(member => <div key={member.id}>{member.name} <small className="muted">({member.email})</small></div>)}</> : <span className="muted">No current members · historical group</span>;
}
function LessonStar({ lesson, groups, course, onSaved }: { lesson: Lesson; groups: GroupEvaluation[]; course: string; onSaved: (winner: string | null) => void }) {
  const [winner, setWinner] = useState(lesson.starGroupNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      await save({ action: "lessonStar", courseNumber: course, lessonId: lesson.id, groupNumber: winner || null });
      onSaved(winner || null); setFeedback("Lesson star saved.");
    } catch (error) { setFeedback(errorMessage(error)); } finally { setBusy(false); }
  }
  return <form className="lesson-star-form" onSubmit={submit}><label>★ Lesson star winner <select value={winner} onChange={event => setWinner(event.target.value)}><option value="">No winner</option>{groups.map(group => <option key={group.groupNumber} value={group.groupNumber}>Group {group.groupNumber}</option>)}</select></label><button className="secondary-button" disabled={busy}>Save lesson star</button><span role="status">{feedback}</span><p className="muted">Only one group can win each lesson. Selecting another group replaces the winner; “No winner” clears the award.</p></form>;
}
function CourseWorkspace({ course }: { course: string }) {
  const [sheet, setSheet] = useState<CourseSheet | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"lessons" | "summary">("lessons");
  const [lessonId, setLessonId] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupFeedback, setSetupFeedback] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin?course=${encodeURIComponent(course)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!controller.signal.aborted) setSheet(result);
    }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [course, revision]);
  function refresh() { setSheet(null); setError(""); setRevision(value => value + 1); }
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const count = Number(new FormData(event.currentTarget).get("count"));
    setSetupBusy(true); setSetupFeedback("");
    try { await save({ action: "lessons", courseNumber: course, count }); refresh(); }
    catch (error) { setSetupFeedback(errorMessage(error)); } finally { setSetupBusy(false); }
  }
  const lesson = sheet?.lessons.find(item => item.id === lessonId) ?? sheet?.lessons[0];
  return <section className="admin-panel">
    <div className="evaluation-toolbar"><h2>Course {course}</h2><button className="secondary-button" onClick={refresh}>Refresh sheet</button></div>
    <div className="evaluation-tabs" role="tablist" aria-label="Evaluation view"><button role="tab" id="lessons-tab" aria-controls="lessons-panel" aria-selected={view === "lessons"} onClick={() => setView("lessons")}>Lesson evaluations</button><button role="tab" id="summary-tab" aria-controls="summary-panel" aria-selected={view === "summary"} onClick={() => setView("summary")}>Summary & final evaluation</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!sheet && !error && <p role="status">Loading evaluations…</p>}
    {sheet && <>
      {view === "lessons" ? <div role="tabpanel" id="lessons-panel" aria-labelledby="lessons-tab">
        {sheet.lessons.length < 20 && <form className="lesson-setup" onSubmit={setup}><label>{sheet.lessons.length ? "Expand course to" : "Number of lessons"} <input name="count" type="number" min={Math.max(10, sheet.lessons.length + 1)} max={20} defaultValue={Math.max(10, sheet.lessons.length + 1)} required /></label><button className="secondary-button" disabled={setupBusy}>{sheet.lessons.length ? "Add lessons" : "Create lessons"}</button><span role="status">{setupFeedback}</span><p className="muted">Choose 10–20 lessons. You can add more later, up to 20; existing evaluations are preserved.</p></form>}
        {lesson && <>
          <div className="admin-course-picker"><label>Lesson <select value={lesson.id} onChange={event => setLessonId(event.target.value)}>{sheet.lessons.map(item => <option key={item.id} value={item.id}>Lesson {item.lessonNumber}</option>)}</select></label><span className="muted">{sheet.lessons.length} lessons in this course</span></div>
          <LessonStar key={`${lesson.id}:${revision}`} lesson={lesson} groups={sheet.groups} course={course} onSaved={winner => setSheet(current => current && ({ ...current, lessons: current.lessons.map(item => item.id === lesson.id ? { ...item, starGroupNumber: winner } : item) }))} />
          <div className="admin-table-scroll"><table className="admin-table"><caption>Lesson {lesson.lessonNumber} · {course}</caption><thead><tr><th>Group</th><th>Members</th><th>Game stars</th><th>Lesson evaluation</th></tr></thead><tbody>{sheet.groups.map(group => {
            const evaluation = sheet.evaluations.find(item => item.lessonId === lesson.id && item.groupNumber === group.groupNumber);
            return <tr key={`${lesson.id}:${group.groupNumber}:${revision}`}><th scope="row">{group.groupNumber}{lesson.starGroupNumber === group.groupNumber && <span className="lesson-winner">★ Lesson star</span>}</th><td><Members group={group} /></td><td>{group.stars}</td><td><p className="muted">{evaluation ? "Evaluation recorded" : "Not yet evaluated"}</p><EvaluationForm label={`Lesson ${lesson.lessonNumber}, group ${group.groupNumber}`} initial={evaluation ?? { completed: false, presented: false, notes: "" }} onSave={async value => {
              await save({ action: "lessonEvaluation", courseNumber: course, lessonId: lesson.id, groupNumber: group.groupNumber, ...value });
              setSheet(current => current && ({ ...current, evaluations: [...current.evaluations.filter(item => item.lessonId !== lesson.id || item.groupNumber !== group.groupNumber), { lessonId: lesson.id, groupNumber: group.groupNumber, ...value }] }));
            }} /></td></tr>;
          })}</tbody></table></div>
        </>}
      </div> : <div role="tabpanel" id="summary-panel" aria-labelledby="summary-tab"><p className="muted">Totals cover all {sheet.lessons.length} lessons. Game stars are live totals across members’ games; lesson stars are awards selected by the admin. Final evaluations are saved separately from lesson records.</p>
        <div className="admin-table-scroll"><table className="admin-table"><caption>Course summary · {course}</caption><thead><tr><th>Group / members</th><th>Evaluated</th><th>Completed</th><th>Presented</th><th>Lesson stars</th><th>Game stars</th><th>Final evaluation</th></tr></thead><tbody>{sheet.groups.map(group => {
          const records = sheet.evaluations.filter(item => item.groupNumber === group.groupNumber);
          return <tr key={`${group.groupNumber}:${revision}`}><th scope="row">Group {group.groupNumber}<div className="summary-members"><Members group={group} /></div></th><td>{records.length} / {sheet.lessons.length}</td><td>{records.filter(item => item.completed).length} / {sheet.lessons.length}</td><td>{records.filter(item => item.presented).length} / {sheet.lessons.length}</td><td>★ {sheet.lessons.filter(item => item.starGroupNumber === group.groupNumber).length}</td><td>{group.stars}</td><td><EvaluationForm label={`Final evaluation, group ${group.groupNumber}`} initial={group} onSave={async value => {
            await save({ action: "evaluation", courseNumber: course, groupNumber: group.groupNumber, ...value });
            setSheet(current => current && ({ ...current, groups: current.groups.map(item => item.groupNumber === group.groupNumber ? { ...item, ...value } : item) }));
          }} /></td></tr>;
        })}</tbody></table></div>
      </div>}
      {!sheet.groups.length && <p>No groups assigned. Assign groups in <Link href="/admin">User management</Link>.</p>}
    </>}
  </section>;
}
export function CourseEvaluations({ courses }: { courses: string[] }) {
  const [course, setCourse] = useState("");
  return <div className="admin-sections"><div className="admin-course-picker"><label>Course <select value={course} onChange={event => setCourse(event.target.value)}><option value="">Choose a course</option>{courses.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>{!courses.length && <p>Assign course numbers in <Link href="/admin">User management</Link> to get started.</p>}{course ? <CourseWorkspace key={course} course={course} /> : courses.length > 0 && <p className="muted">Choose a course to evaluate lessons or review its final summary.</p>}</div>;
}
