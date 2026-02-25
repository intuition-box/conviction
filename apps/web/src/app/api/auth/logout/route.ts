import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth/session";

export async function POST() {
  const setCookie = clearSessionCookie();
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": setCookie } }
  );
}
