import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../repositories/UserRepository.js";

const scryptAsync = promisify(scrypt);

const SALT_LEN = 16;
const KEY_LEN = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

export interface RegisterResult {
  id: string;
  email: string;
  fullName: string;
  personaMode: "default";
  requiresOnboarding: true;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "DuplicateEmailError";
  }
}

export class AuthService {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository = new UserRepository()) {
    this.repo = repo;
  }

  async register(
    email: string,
    password: string,
    fullName: string,
  ): Promise<RegisterResult> {
    const normalised = email.toLowerCase();
    const existing = this.repo.findByEmail(normalised);
    if (existing) {
      throw new DuplicateEmailError();
    }

    const passwordHash = await hashPassword(password);
    const id = uuidv4();
    this.repo.create({ id, email: normalised, fullName, passwordHash });

    return {
      id,
      email: normalised,
      fullName,
      personaMode: "default",
      requiresOnboarding: true,
    };
  }
}
