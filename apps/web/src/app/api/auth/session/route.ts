import { NextResponse } from "next/server";

import { getSessionFromRequest, clearSessionCookie } from "@/server/auth/session";

/** Check if a valid session exists. */
export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
  });
}

/** Logout — clear the session cookie. */
export async function DELETE() {
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
