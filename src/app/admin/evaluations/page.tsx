import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { evaluationCourses } from "@/lib/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { CourseEvaluations } from "@/components/CourseEvaluations";
import { getTranslations } from "@/lib/i18n-server";

export default async function EvaluationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/dashboard");
  const [courses, t] = await Promise.all([evaluationCourses(), getTranslations()]);
  return <div className="app-shell"><SiteHeader session={session} /><main className="community-content"><div className="community-hero compact-hero"><p className="eyebrow">{t("admin.mode")}</p><h1>{t("admin.evaluations")}</h1><p>{t("admin.evaluationsSubtitle")}</p></div><CourseEvaluations courses={courses} /></main></div>;
}
