import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/server/db/prisma";
import { getSessionFromCookieHeader } from "@/server/auth/session";

import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const session = getSessionFromCookieHeader(cookieHeader || null);
  if (!session) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { address: true, displayName: true, avatar: true },
  });

  if (!user) redirect("/");

  return (
    <DashboardClient
      address={user.address}
      displayName={user.displayName}
      avatar={user.avatar}
    />
  );
}
