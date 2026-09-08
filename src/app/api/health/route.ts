import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.query("SELECT 1");
    return NextResponse.json({
      status: "ok",
      database: { max: config.databasePoolMax(), total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount },
    });
  } catch (error) {
    return NextResponse.json({
      status: "unhealthy",
      error: error instanceof Error ? error.name : "DatabaseError",
    }, { status: 503 });
  }
}
