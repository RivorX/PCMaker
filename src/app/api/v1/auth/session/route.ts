
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    return Response.json(
      { authenticated: false },
      { status: 401 }
    );
  }

  return Response.json({
    authenticated: true,
    user: {
      username: session.username,
      role: session.role,
    },
  });
}
