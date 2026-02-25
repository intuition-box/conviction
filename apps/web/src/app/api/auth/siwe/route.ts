import { NextResponse } from "next/server";
import { verifyMessage } from "viem";

import { createSessionCookie } from "@/server/auth/session";
import {
  parseSiweMessage, parseTime, resolveUserId,
  MAX_AGE_MS, FUTURE_SKEW_MS,
} from "@/server/auth/siwe";
import { getErrorMessage } from "@/lib/getErrorMessage";

type SiweLoginPayload = {
  message: string;
  signature: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SiweLoginPayload | null;
    if (!body?.message || !body?.signature) {
      return NextResponse.json({ error: "Missing message or signature." }, { status: 400 });
    }

    const parsed = parseSiweMessage(body.message);

    // Validate domain
    const host = new URL(request.url).host;
    if (parsed.domain !== host) {
      return NextResponse.json({ error: "SIWE domain mismatch." }, { status: 403 });
    }

    // Validate chain
    const expectedChainId = Number(process.env.NEXT_PUBLIC_INTUITION_CHAIN_ID);
    if (Number.isFinite(expectedChainId) && parsed.chainId !== expectedChainId) {
      return NextResponse.json({ error: "SIWE chain mismatch." }, { status: 403 });
    }

    // Validate timestamps
    const now = Date.now();
    const issuedAtMs = parseTime("Issued At", parsed.issuedAt);
    if (issuedAtMs - now > FUTURE_SKEW_MS) {
      return NextResponse.json({ error: "SIWE issuedAt is in the future." }, { status: 403 });
    }
    const expirationMs = parseTime("Expiration Time", parsed.expirationTime);
    if (expirationMs <= now) {
      return NextResponse.json({ error: "SIWE message expired." }, { status: 403 });
    }
    if (now - issuedAtMs > MAX_AGE_MS) {
      return NextResponse.json({ error: "SIWE message too old." }, { status: 403 });
    }

    // Verify signature
    const valid = await verifyMessage({
      address: parsed.address as `0x${string}`,
      message: body.message,
      signature: body.signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid SIWE signature." }, { status: 403 });
    }

    // Resolve user
    const { userId, address } = await resolveUserId(parsed.address);

    // Create session cookie
    const setCookie = createSessionCookie(userId, address, parsed.chainId);

    return NextResponse.json(
      { ok: true, address, chainId: parsed.chainId },
      { headers: { "Set-Cookie": setCookie } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "SIWE authentication failed.") },
      { status: 403 },
    );
  }
}
