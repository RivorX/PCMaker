import { cookies } from "next/headers";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_DURATION,
  normalizeUserId,
  type UserRole,
} from "@/lib/auth";
import { adminDataConnect } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";

const privateHeaders = { "Cache-Control": "private, no-store" };

type GetUserByEmailData = {
  users: Array<{
    id: string;
    email: string;
    password: string;
    role: string;
    isActive: boolean;
  }>;
};

export async function POST(request: Request) {
  if (!process.env.SESSION_SECRET) {
    return Response.json(
      { error: "Logowanie nie zostało skonfigurowane na serwerze." },
      { status: 500, headers: privateHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe dane żądania." }, { status: 400, headers: privateHeaders });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Nieprawidłowe dane żądania." }, { status: 400, headers: privateHeaders });
  }

  const data = body as Record<string, unknown>;
  const identifier =
    typeof data.identifier === "string" ? data.identifier.trim() : "";
  const password =
    typeof data.password === "string" ? data.password : "";

  if (!identifier || !password) {
    return Response.json(
      { error: "Podaj adres e-mail i hasło." },
      { status: 400, headers: privateHeaders }
    );
  }

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL;

  const isAdminIdentifier =
    (!!adminUsername && identifier === adminUsername) ||
    (!!adminEmail && identifier.toLowerCase() === adminEmail.toLowerCase());

  if (adminPassword && isAdminIdentifier) {
    if (password !== adminPassword) {
      return Response.json(
        { error: "Nieprawidłowy login lub hasło." },
        { status: 401, headers: privateHeaders }
      );
    }
    return issueSession(adminUsername ?? adminEmail!, "ADMIN");
  }

  try {
    const { data: queryData } =
      await adminDataConnect.executeQuery<
        GetUserByEmailData,
        { email: string }
      >("GetUserByEmail", { email: identifier.toLowerCase() });

    const user = queryData.users?.[0];

    if (!user) {
      return Response.json(
        { error: "Nieprawidłowy e-mail lub hasło." },
        { status: 401, headers: privateHeaders }
      );
    }

    if (!user.isActive) {
      return Response.json(
        { error: "Konto jest nieaktywne. Skontaktuj się z obsługą." },
        { status: 403, headers: privateHeaders }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return Response.json(
        { error: "Nieprawidłowy e-mail lub hasło." },
        { status: 401, headers: privateHeaders }
      );
    }

    const userId = normalizeUserId(user.id);
    if (!userId) {
      return Response.json(
        { error: "Nie udało się ustalić identyfikatora konta. Spróbuj ponownie." },
        { status: 500, headers: privateHeaders },
      );
    }

    return issueSession(user.email, user.role as UserRole, userId);
  } catch (error) {
    console.error("Błąd logowania:", error);
    return Response.json(
      { error: "Wystąpił błąd podczas logowania. Spróbuj ponownie." },
      { status: 500, headers: privateHeaders }
    );
  }
}

async function issueSession(username: string, role: UserRole, userId?: string) {
  try {
    const token = await createSession(username, role, userId);
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION,
    });

    return Response.json({ success: true, role, accountBacked: Boolean(userId) }, {
      headers: privateHeaders,
    });
  } catch (error) {
    console.error("Nie udało się utworzyć sesji:", error);
    return Response.json(
      { error: "Wystąpił błąd podczas tworzenia sesji." },
      { status: 500, headers: privateHeaders }
    );
  }
}
