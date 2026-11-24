
import { createHash } from "crypto";
import { adminDataConnect } from "@/lib/firebase-admin";

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
  type: "ACTIVATION";
}

function redirectToLogin(status: string) {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    throw new Error("Missing APP_URL environment variable.");
  }

  const loginUrl = new URL("/", appUrl);
  loginUrl.searchParams.set("activation", status);

  return Response.redirect(loginUrl, 303);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      return redirectToLogin("invalid");
    }

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await adminDataConnect.executeQuery<
      GetAuthTokenData,
      GetAuthTokenVariables
    >("GetAuthTokenByHash", {
      tokenHash,
      type: "ACTIVATION",
    });

    const authToken = result.data.authTokens[0];

    if (!authToken) {
      return redirectToLogin("invalid");
    }

    if (authToken.usedAt) {
      return redirectToLogin("used");
    }

    if (new Date(authToken.expiresAt).getTime() <= Date.now()) {
      return redirectToLogin("expired");
    }

    if (authToken.user.isActive) {
      return redirectToLogin("success");
    }

    await adminDataConnect.executeMutation("MarkAuthTokenUsed", {
      id: authToken.id,
      usedAt: new Date().toISOString(),
    });

    await adminDataConnect.executeMutation("ActivateUser", {
      id: authToken.user.id,
    });

    return redirectToLogin("success");
  } catch (error) {
    console.error("Activation error:", error);

    return redirectToLogin("error");
  }
}
