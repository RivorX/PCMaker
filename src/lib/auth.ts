import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pcmaker_session";
const SESSION_DURATION = 8 * 60 * 60;

export type UserRole = "CLIENT" | "TECHNICIAN" | "ADMIN";

const VALID_ROLES: UserRole[] = ["CLIENT", "TECHNICIAN", "ADMIN"];

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET musi mieć co najmniej 32 znaki.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(username: string, role: UserRole = "CLIENT") {
  return new SignJWT({ username, role })
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
      typeof payload.username !== "string" ||
      typeof payload.role !== "string" ||
      !VALID_ROLES.includes(payload.role as UserRole)
    ) {
      return null;
    }

    return {
      username: payload.username,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export { SESSION_DURATION };