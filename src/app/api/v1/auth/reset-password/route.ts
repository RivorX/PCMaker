
import { createHash } from "crypto";
import { adminDataConnect } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";

interface GetAuthTokenData {
  authTokens: {
    id: string;
    tokenHash: string;
    expiresAt: string;
    usedAt: string | null;
    user: {
      id: string;
      email: string;
      isActive: boolean;
    };
  }[];
}

interface GetAuthTokenVariables {
  tokenHash: string;
  type: "PASSWORD_RESET";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token =
      typeof body.token === "string" ? body.token : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      return Response.json(
        { error: "Link resetowania hasła jest nieprawidłowy." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Hasło musi mieć minimum 8 znaków." },
        { status: 400 }
      );
    }

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await adminDataConnect.executeQuery<
      GetAuthTokenData,
      GetAuthTokenVariables
    >("GetAuthTokenByHash", {
      tokenHash,
      type: "PASSWORD_RESET",
    });

    const authToken = result.data.authTokens[0];

    if (!authToken) {
      return Response.json(
        { error: "Link resetowania hasła jest nieprawidłowy." },
        { status: 400 }
      );
    }

    if (authToken.usedAt) {
      return Response.json(
        { error: "Ten link został już wykorzystany." },
        { status: 400 }
      );
    }

    if (new Date(authToken.expiresAt).getTime() <= Date.now()) {
      return Response.json(
        { error: "Link resetowania hasła wygasł. Poproś o nowy." },
        { status: 400 }
      );
    }

    if (!authToken.user.isActive) {
      return Response.json(
        { error: "Konto nie jest aktywne." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await adminDataConnect.executeMutation("UpdateUserPassword", {
      id: authToken.user.id,
      password: hashedPassword,
    });

    await adminDataConnect.executeMutation("MarkAuthTokenUsed", {
      id: authToken.id,
      usedAt: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Hasło zostało zmienione. Możesz się zalogować.",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return Response.json(
      { error: "Nie udało się zmienić hasła. Spróbuj ponownie później." },
      { status: 500 }
    );
  }
}
