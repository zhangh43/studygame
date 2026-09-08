import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const serverAction = request.headers.get("next-action");
  if (serverAction) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "http.unexpected_server_action",
      path: request.nextUrl.pathname,
      method: request.method,
      serverAction: serverAction.slice(0, 80),
      forwardedFor: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }));
    return NextResponse.json({ error: "Server Actions are not supported by this service." }, { status: 400 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
