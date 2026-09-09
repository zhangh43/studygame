import { cookies } from "next/headers";
import { isLocale, makeTranslator, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("locale")?.value;
  return isLocale(value) ? value : "en";
}

export async function getTranslations() {
  return makeTranslator(await getLocale());
}
