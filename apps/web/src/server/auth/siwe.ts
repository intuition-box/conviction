import { verifyMessage } from "viem";

import { prisma } from "@/server/db/prisma";
import { getSessionFromRequest } from "@/server/auth/session";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SIGN_IN_SUFFIX = " wants you to sign in with your Ethereum account:";
export const MAX_AGE_MS = 10 * 60 * 1000;
export const FUTURE_SKEW_MS = 5 * 60 * 1000;

type ParsedSiwe = {
  domain: string;
  address: string;
  chainId: number;
  nonce: string | null;
  issuedAt: string | null;
  expirationTime: string | null;
  uri: string | null;
};

function decodeMessage(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    throw new Error("Invalid SIWE message encoding.");
  }
}

export function parseSiweMessage(message: string): ParsedSiwe {
  const lines = message.split("\n");
  if (lines.length < 2) {
    throw new Error("Invalid SIWE message format.");
  }

  const header = lines[0]?.trim();
  if (!header.endsWith(SIGN_IN_SUFFIX)) {
    throw new Error("Invalid SIWE message header.");
  }

  const domain = header.slice(0, -SIGN_IN_SUFFIX.length);
  const address = lines[1]?.trim();
  if (!address || !ADDRESS_REGEX.test(address)) {
    throw new Error("Invalid SIWE address.");
  }

  let cursor = 2;
  if (lines[cursor] === "") cursor += 1;

  while (cursor < lines.length && lines[cursor] !== "") {
    cursor += 1;
  }
  if (lines[cursor] === "") cursor += 1;

  const fields: Record<string, string> = {};
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]?.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      fields[key] = value;
    }
  }

  const chainId = Number(fields["Chain ID"]);
  if (!Number.isFinite(chainId)) {
    throw new Error("Invalid SIWE chain id.");
  }

  return {
    domain,
    address,
    chainId,
    nonce: fields["Nonce"] ?? null,
    issuedAt: fields["Issued At"] ?? null,
    expirationTime: fields["Expiration Time"] ?? null,
    uri: fields["URI"] ?? null,
  };
}

export function parseTime(label: string, value: string | null): number {
  if (!value) {
    throw new Error(`SIWE ${label} is required.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`SIWE ${label} is invalid.`);
  }
  return parsed;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export async function resolveUserId(address: string) {
  const normalizedAddress = normalizeAddress(address);

  // Check if user exists by address
  const existing = await prisma.user.findUnique({
    where: { address: normalizedAddress },
    select: { id: true },
  });

  if (existing) {
    // Update lastActiveAt
    await prisma.user.update({
      where: { id: existing.id },
      data: { lastActiveAt: new Date() },
    });
    return { userId: existing.id, address: normalizedAddress };
  }

  // Create new user with address
  const user = await prisma.user.create({
    data: {
      address: normalizedAddress,
      lastActiveAt: new Date(),
    },
  });

  return { userId: user.id, address: normalizedAddress };
}

/**
 * Authenticate a request. Checks session cookie first, then falls back to
 * SIWE headers for backwards compatibility.
 */
export async function requireSiweAuth(request: Request) {
  // 1. Try session cookie (fast path — no crypto verification needed)
  const session = getSessionFromRequest(request);
  if (session) {
    return {
      userId: session.userId,
      address: session.address,
      chainId: session.chainId,
    };
  }

  // 2. Fall back to SIWE headers (legacy path)
  const messageHeader = request.headers.get("x-siwe-message");
  const signature = request.headers.get("x-siwe-signature");

  if (!messageHeader || !signature) {
    throw new Error("Authentication required. Please sign in.");
  }

  const message = decodeMessage(messageHeader);
  const parsed = parseSiweMessage(message);

  const host = new URL(request.url).host;
  if (parsed.domain !== host) {
    throw new Error("SIWE domain mismatch.");
  }

  const expectedChainId = Number(process.env.NEXT_PUBLIC_INTUITION_CHAIN_ID);
  if (Number.isFinite(expectedChainId) && parsed.chainId !== expectedChainId) {
    throw new Error("SIWE chain mismatch.");
  }

  const now = Date.now();
  const issuedAtMs = parseTime("Issued At", parsed.issuedAt);
  if (issuedAtMs - now > FUTURE_SKEW_MS) {
    throw new Error("SIWE issuedAt is in the future.");
  }

  const expirationMs = parseTime("Expiration Time", parsed.expirationTime);
  if (expirationMs <= now) {
    throw new Error("SIWE message expired.");
  }
  if (now - issuedAtMs > MAX_AGE_MS) {
    throw new Error("SIWE message too old.");
  }

  const valid = await verifyMessage({
    address: parsed.address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!valid) {
    throw new Error("Invalid SIWE signature.");
  }

  const { userId, address } = await resolveUserId(parsed.address);

  return {
    userId,
    address,
    chainId: parsed.chainId,
  };
}
