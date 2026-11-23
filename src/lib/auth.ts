import "server-only";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pcmaker_session";
const SESSION_DURATION = 8 * 60 * 60;

export type UserRole = "CLIENT" | "TECHNICIAN" | "ADMIN";

const VALID_ROLES: UserRole[] = ["CLIENT", "TECHNICIAN", "ADMIN"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeUserId(value: string): string | null {
  const normalized = value.trim();
  if (/^[0-9a-f]{32}$/i.test(normalized)) {
    const lower = normalized.toLowerCase();
    return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
  }
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET musi mieć co najmniej 32 znaki.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(username: string, role: UserRole = "CLIENT", userId?: string) {
  const token = new SignJWT({ username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h");

  if (userId) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) throw new Error("Nieprawidłowy identyfikator użytkownika.");
    token.setSubject(normalizedUserId);
  }
  return token.sign(getSecret());
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

    const userId = payload.sub === undefined ? undefined : normalizeUserId(payload.sub);
    if (payload.sub !== undefined && !userId) return null;

    return {
      username: payload.username,
      role: payload.role as UserRole,
      userId,
    };
  } catch {
    return null;
  }
}

export { SESSION_DURATION };
