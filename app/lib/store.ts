import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  plan: "Starter" | "Pro";
  createdAt: string;
};

const filePath = path.join(process.cwd(), "app", "data", "users.json");
const SCRYPT_KEY_LENGTH = 64;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) {
    return false;
  }
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, keyBuffer);
}

async function ensureStore() {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]", "utf8");
  }
}

async function readUsers(): Promise<AppUser[]> {
  await ensureStore();
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: AppUser[]) {
  await ensureStore();
  await fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf8");
}

export async function createUser(user: { name: string; email: string; password: string; plan: "Starter" | "Pro" }) {
  const users = await readUsers();
  const normalizedEmail = user.email.trim().toLowerCase();
  const emailTaken = users.some((entry) => entry.email === normalizedEmail);
  if (emailTaken) {
    return null;
  }

  const newUser: AppUser = {
    id: `user_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    name: user.name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(user.password),
    plan: user.plan,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  await writeUsers(users);
  return newUser;
}

export async function findUserByEmail(email: string) {
  const users = await readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  return users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

export function createToken(user: AppUser) {
  return `stockers_${user.id}_${Buffer.from(user.email).toString("base64")}`;
}
