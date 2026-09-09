"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";

export function LogoutButton() {
  const router = useRouter();
  const { t } = useI18n();
  return <button className="text-button" onClick={async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }}>{t("nav.signOut")}</button>;
}
