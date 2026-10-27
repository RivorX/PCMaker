
import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE, SESSION_DURATION } from "@/lib/auth";

export async function POST(request: Request) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const expectedEmail = process.env.ADMIN_EMAIL;

  if (
    !expectedUsername ||
    !expectedPassword ||
    !process.env.SESSION_SECRET
  ) {
    return Response.json(
      { error: "Logowanie nie zostało skonfigurowane na serwerze." },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Nieprawidłowe dane żądania." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return Response.json(
      { error: "Nieprawidłowe dane żądania." },
      { status: 400 }
    );
  }

  const data = body as Record<string, unknown>;
  const identifier =
    typeof data.identifier === "string"
      ? data.identifier.trim()
      : "";
  const password =
    typeof data.password === "string"
      ? data.password
      : "";

  const identifierMatches =
    identifier === expectedUsername ||
    (!!expectedEmail && identifier.toLowerCase() === expectedEmail.toLowerCase());

  if (!identifierMatches || password !== expectedPassword) {
    return Response.json(
      { error: "Nieprawidłowy login lub hasło." },
      { status: 401 }
    );
  }

  try {
    const token = await createSession(expectedUsername);
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Nie udało się utworzyć sesji:", error);

    return Response.json(
      { error: "Wystąpił błąd podczas tworzenia sesji." },
      { status: 500 }
    );
  }
}
