import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  redirect((await getSession()) ? "/dashboard" : "/login");
}
