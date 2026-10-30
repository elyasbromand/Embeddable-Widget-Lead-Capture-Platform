import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { ConflictError, UnauthorizedError } from "../errors.js";
import * as usersRepository from "../repositories/usersRepository.js";

// OWASP Password Storage Cheat Sheet, Argon2id minimum: 19 MiB memory, 2 iterations, 1 lane.
// These end up inside each hash string, so raising them later doesn't break existing logins.
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TOKEN_TTL = "1h";

// Checked when the email is unknown, so "no such user" costs as much time as "wrong password"
// and response timing doesn't reveal which emails have accounts.
const DUMMY_HASH = await argon2.hash("not-a-real-password", HASH_OPTIONS);

export async function register(email, password) {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);
  const user = await usersRepository.createUser(email, passwordHash);
  // Trade-off: 409 tells a caller this email has an account. Accepted for an owner sign-up form.
  if (!user) throw new ConflictError("Email is already registered");
  return { user, token: issueToken(user.id) };
}

export async function login(email, password) {
  const user = await usersRepository.findUserByEmail(email);
  const valid = await argon2.verify(user?.password_hash ?? DUMMY_HASH, password);
  // One message for both cases: a caller can't tell an unknown email from a wrong password.
  if (!user || !valid) throw new UnauthorizedError("Invalid email or password");
  return { user: { id: user.id, email: user.email }, token: issueToken(user.id) };
}

// Returns { id } for a valid token. Any failure (bad signature, expired, malformed) is one 401.
export function verifyToken(token) {
  try {
    // Pin the algorithm: never let the token's own header choose how it is checked.
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    return { id: payload.sub };
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

function issueToken(userId) {
  // Only the user id goes in: a JWT is signed, not encrypted, so anyone holding it can read it.
  return jwt.sign({}, config.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: TOKEN_TTL,
  });
}
