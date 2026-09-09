import { NextResponse } from "next/server";
import { z } from "zod";
import { isTrustedMutation } from "@/lib/auth";

const schema = z.object({ locale: z.enum(["en", "zh"]) });

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("locale", parsed.data.locale, {
    httpOnly: false,
    sameSite: "lax",
    // This preference is not sensitive. Leaving it non-Secure also supports
    // deployments intentionally accessed by a public IP over plain HTTP.
    secure: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return response;
}
