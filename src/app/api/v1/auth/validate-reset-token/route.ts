
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDataConnect } from "@/lib/firebase-admin";

type GetAuthTokenData = {
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
};

type GetAuthTokenVariables = {
  tokenHash: string;
  type: "PASSWORD_RESET";
};

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(token)
    ) {
      return NextResponse.json(
        { valid: false, error: "Link resetowania hasła jest nieprawidłowy." },
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
      return NextResponse.json(
        { valid: false, error: "Link resetowania hasła jest nieprawidłowy." },
        { status: 400 }
      );
    }

    if (authToken.usedAt) {
      return NextResponse.json(
        { valid: false, error: "Ten link został już wykorzystany." },
        { status: 400 }
      );
    }

    if (new Date(authToken.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { valid: false, error: "Link resetowania hasła wygasł. Poproś o nowy." },
        { status: 400 }
      );
    }

    if (!authToken.user?.isActive) {
      return NextResponse.json(
        { valid: false, error: "Nie można zresetować hasła dla tego konta." },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Validate reset token error:", error);

    return NextResponse.json(
      { valid: false, error: "Nie udało się zweryfikować linku. Spróbuj ponownie." },
      { status: 500 }
    );
  }
}
