import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getSessionOrUnauthorized() {
  const session = await auth();

  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session, error: null };
}

export async function requireRole(...allowedRoles: string[]) {
  const { session, error } = await getSessionOrUnauthorized();

  if (error) return { session: null, error };

  if (!allowedRoles.includes(session!.user.role)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session: session!, error: null };
}
