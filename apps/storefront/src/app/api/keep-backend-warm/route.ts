import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "https://binchen-backend.onrender.com";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown", durationMs: Date.now() - started },
      { status: 502 },
    );
  }
}
