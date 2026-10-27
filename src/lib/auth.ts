
import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pcmaker_session";
const SESSION_DURATION = 8 * 60 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET musi mieć co najmniej 32 znaki."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createSession(username: string) {
  return new SignJWT({
    username,
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySession(token?: string) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (
      payload.role !== "admin" ||
      typeof payload.username !== "string"
    ) {
      return null;
    }

    return {
      username: payload.username,
      role: "admin" as const,
    };
  } catch {
    return null;
  }
}

export { SESSION_DURATION };
