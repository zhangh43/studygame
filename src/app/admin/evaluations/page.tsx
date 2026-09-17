import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { evaluationCourses } from "@/lib/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { CourseEvaluations } from "@/components/CourseEvaluations";

export default async function EvaluationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/dashboard");
  return <div className="app-shell"><SiteHeader session={session} /><main className="community-content"><div className="community-hero compact-hero"><p className="eyebrow">Admin mode</p><h1>Course evaluations</h1><p>Record each lesson and review the whole course.</p></div><CourseEvaluations courses={await evaluationCourses()} /></main></div>;
}
