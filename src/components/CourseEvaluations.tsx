"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { CourseSheet, GroupEvaluation, Lesson, LessonEvaluation } from "@/lib/admin";
import { useI18n } from "@/components/I18nProvider";
import { useAdminFeedback } from "@/components/useAdminFeedback";

async function save(body: unknown) {
  const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save changes.");
}

type Evaluation = Pick<LessonEvaluation, "completed" | "presented" | "notes">;
function EvaluationForm({ initial, onSave, label }: { initial: Evaluation; onSave: (value: Evaluation) => Promise<void>; label: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const { feedback, setFeedback } = useAdminFeedback();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setFeedback(null);
    try {
      await onSave({ completed: values.has("completed"), presented: values.has("presented"), notes: String(values.get("notes")) });
      setFeedback({ key: "admin.saved" });
    } catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  return <form className="admin-evaluation-form" aria-label={label} onSubmit={submit}>
    <label><input type="checkbox" name="completed" defaultChecked={initial.completed} /> {t("admin.taskCompleted")}</label>
    <label><input type="checkbox" name="presented" defaultChecked={initial.presented} /> {t("admin.taskPresented")}</label>
    <textarea name="notes" aria-label={t("admin.notesLabel", { label })} defaultValue={initial.notes} maxLength={4000} placeholder={t("admin.notes")} rows={2} />
    <button className="secondary-button" disabled={busy}>{t(busy ? "admin.saving" : "admin.saveEvaluation")}</button>
    <span role="status">{feedback}</span>
  </form>;
}
function Members({ group }: { group: GroupEvaluation }) {
  const { t } = useI18n();
  return group.members.length ? <>{group.members.map(member => <div key={member.id}>{member.name} <small className="muted">({member.email})</small></div>)}</> : <span className="muted">{t("admin.historicalGroup")}</span>;
}
function LessonStar({ lesson, groups, course, onSaved }: { lesson: Lesson; groups: GroupEvaluation[]; course: string; onSaved: (winner: string | null) => void }) {
  const { t } = useI18n();
  const [winner, setWinner] = useState(lesson.starGroupNumber ?? "");
  const [busy, setBusy] = useState(false);
  const { feedback, setFeedback } = useAdminFeedback();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback(null);
    try {
      await save({ action: "lessonStar", courseNumber: course, lessonId: lesson.id, groupNumber: winner || null });
      onSaved(winner || null); setFeedback({ key: "admin.lessonStarSaved" });
    } catch (error) { setFeedback({ error }); } finally { setBusy(false); }
  }
  return <form className="lesson-star-form" onSubmit={submit}><label>{t("admin.lessonStarWinner")} <select value={winner} onChange={event => setWinner(event.target.value)}><option value="">{t("admin.noWinner")}</option>{groups.map(group => <option key={group.groupNumber} value={group.groupNumber}>{t("admin.namedGroup", { group: group.groupNumber })}</option>)}</select></label><button className="secondary-button" disabled={busy}>{t(busy ? "admin.saving" : "admin.saveLessonStar")}</button><span role="status">{feedback}</span><p className="muted">{t("admin.lessonStarHint")}</p></form>;
}
function CourseWorkspace({ course }: { course: string }) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<CourseSheet | null>(null);
  const { feedback: error, setFeedback: setError } = useAdminFeedback();
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"lessons" | "summary">("lessons");
  const [lessonId, setLessonId] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const { feedback: setupFeedback, setFeedback: setSetupFeedback } = useAdminFeedback();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin?course=${encodeURIComponent(course)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed. Please try again.");
      if (!controller.signal.aborted) setSheet(result);
    }).catch(error => { if (!controller.signal.aborted) setError({ error }); });
    return () => controller.abort();
  }, [course, revision, setError]);
  function refresh() { setSheet(null); setError(null); setRevision(value => value + 1); }
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const count = Number(new FormData(event.currentTarget).get("count"));
    setSetupBusy(true); setSetupFeedback(null);
    try { await save({ action: "lessons", courseNumber: course, count }); refresh(); }
    catch (error) { setSetupFeedback({ error }); } finally { setSetupBusy(false); }
  }
  const lesson = sheet?.lessons.find(item => item.id === lessonId) ?? sheet?.lessons[0];
  return <section className="admin-panel">
    <div className="evaluation-toolbar"><h2>{t("admin.namedCourse", { course })}</h2><button className="secondary-button" onClick={refresh}>{t("admin.refreshSheet")}</button></div>
    <div className="evaluation-tabs" role="tablist" aria-label={t("admin.evaluationView")}><button role="tab" id="lessons-tab" aria-controls="lessons-panel" aria-selected={view === "lessons"} onClick={() => setView("lessons")}>{t("admin.lessonEvaluations")}</button><button role="tab" id="summary-tab" aria-controls="summary-panel" aria-selected={view === "summary"} onClick={() => setView("summary")}>{t("admin.summaryFinal")}</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!sheet && !error && <p role="status">{t("admin.loadingEvaluations")}</p>}
    {sheet && <>
      {view === "lessons" ? <div role="tabpanel" id="lessons-panel" aria-labelledby="lessons-tab">
        {sheet.lessons.length < 20 && <form className="lesson-setup" onSubmit={setup}><label>{t(sheet.lessons.length ? "admin.expandCourse" : "admin.lessonCount")} <input name="count" type="number" min={Math.max(10, sheet.lessons.length + 1)} max={20} defaultValue={Math.max(10, sheet.lessons.length + 1)} required /></label><button className="secondary-button" disabled={setupBusy}>{t(setupBusy ? "admin.saving" : sheet.lessons.length ? "admin.addLessons" : "admin.createLessons")}</button><span role="status">{setupFeedback}</span><p className="muted">{t("admin.lessonsHint")}</p></form>}
        {lesson && <>
          <div className="admin-course-picker"><label>{t("admin.lesson")} <select value={lesson.id} onChange={event => setLessonId(event.target.value)}>{sheet.lessons.map(item => <option key={item.id} value={item.id}>{t("admin.namedLesson", { number: item.lessonNumber })}</option>)}</select></label><span className="muted">{t("admin.courseLessonCount", { count: sheet.lessons.length })}</span></div>
          <LessonStar key={`${lesson.id}:${revision}`} lesson={lesson} groups={sheet.groups} course={course} onSaved={winner => setSheet(current => current && ({ ...current, lessons: current.lessons.map(item => item.id === lesson.id ? { ...item, starGroupNumber: winner } : item) }))} />
          <div className="admin-table-scroll"><table className="admin-table"><caption>{t("admin.lessonCaption", { number: lesson.lessonNumber, course })}</caption><thead><tr><th>{t("admin.group")}</th><th>{t("admin.members")}</th><th>{t("admin.gameStars")}</th><th>{t("admin.lessonEvaluation")}</th></tr></thead><tbody>{sheet.groups.map(group => {
            const evaluation = sheet.evaluations.find(item => item.lessonId === lesson.id && item.groupNumber === group.groupNumber);
            return <tr key={`${lesson.id}:${group.groupNumber}:${revision}`}><th scope="row">{group.groupNumber}{lesson.starGroupNumber === group.groupNumber && <span className="lesson-winner">{t("admin.lessonStar")}</span>}</th><td><Members group={group} /></td><td>{group.stars}</td><td><p className="muted">{t(evaluation ? "admin.evaluationRecorded" : "admin.notEvaluated")}</p><EvaluationForm label={t("admin.lessonGroupLabel", { number: lesson.lessonNumber, group: group.groupNumber })} initial={evaluation ?? { completed: false, presented: false, notes: "" }} onSave={async value => {
              await save({ action: "lessonEvaluation", courseNumber: course, lessonId: lesson.id, groupNumber: group.groupNumber, ...value });
              setSheet(current => current && ({ ...current, evaluations: [...current.evaluations.filter(item => item.lessonId !== lesson.id || item.groupNumber !== group.groupNumber), { lessonId: lesson.id, groupNumber: group.groupNumber, ...value }] }));
            }} /></td></tr>;
          })}</tbody></table></div>
        </>}
      </div> : <div role="tabpanel" id="summary-panel" aria-labelledby="summary-tab"><p className="muted">{t("admin.summaryHint", { count: sheet.lessons.length })}</p>
        <div className="admin-table-scroll"><table className="admin-table"><caption>{t("admin.summaryCaption", { course })}</caption><thead><tr><th>{t("admin.groupMembers")}</th><th>{t("admin.evaluated")}</th><th>{t("admin.completed")}</th><th>{t("admin.presented")}</th><th>{t("admin.lessonStars")}</th><th>{t("admin.gameStars")}</th><th>{t("admin.finalEvaluation")}</th></tr></thead><tbody>{sheet.groups.map(group => {
          const records = sheet.evaluations.filter(item => item.groupNumber === group.groupNumber);
          return <tr key={`${group.groupNumber}:${revision}`}><th scope="row">{t("admin.namedGroup", { group: group.groupNumber })}<div className="summary-members"><Members group={group} /></div></th><td>{records.length} / {sheet.lessons.length}</td><td>{records.filter(item => item.completed).length} / {sheet.lessons.length}</td><td>{records.filter(item => item.presented).length} / {sheet.lessons.length}</td><td>★ {sheet.lessons.filter(item => item.starGroupNumber === group.groupNumber).length}</td><td>{group.stars}</td><td><EvaluationForm label={t("admin.finalGroupLabel", { group: group.groupNumber })} initial={group} onSave={async value => {
            await save({ action: "evaluation", courseNumber: course, groupNumber: group.groupNumber, ...value });
            setSheet(current => current && ({ ...current, groups: current.groups.map(item => item.groupNumber === group.groupNumber ? { ...item, ...value } : item) }));
          }} /></td></tr>;
        })}</tbody></table></div>
      </div>}
      {!sheet.groups.length && <p>{t("admin.noGroups")} <Link href="/admin">{t("admin.users")}</Link></p>}
    </>}
  </section>;
}
export function CourseEvaluations({ courses }: { courses: string[] }) {
  const { t } = useI18n();
  const [course, setCourse] = useState("");
  return <div className="admin-sections"><div className="admin-course-picker"><label>{t("admin.course")} <select value={course} onChange={event => setCourse(event.target.value)}><option value="">{t("admin.chooseCourse")}</option>{courses.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>{!courses.length && <p>{t("admin.noCourses")} <Link href="/admin">{t("admin.users")}</Link></p>}{course ? <CourseWorkspace key={course} course={course} /> : courses.length > 0 && <p className="muted">{t("admin.chooseCourseHint")}</p>}</div>;
}
