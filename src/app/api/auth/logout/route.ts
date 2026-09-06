import { NextResponse } from "next/server";
import { destroySession, isTrustedMutation } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  await destroySession();
  return NextResponse.json({ ok: true });
}
