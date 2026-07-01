import jwt from "jsonwebtoken";

export type Role = "employee" | "administrator";

export interface AuthTokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

if (!JWT_SECRET) {
  // Fail loudly at startup rather than silently signing with "undefined"
  throw new Error("JWT_SECRET is not set. Add it to your .env file.");
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}
