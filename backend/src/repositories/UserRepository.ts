import { getDatabase } from "../db/connection.js";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  account_status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
}

export class UserRepository {
  private get db() {
    return getDatabase();
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db
      .prepare(
        "SELECT id, email, full_name, password_hash, account_status, created_at, updated_at FROM users WHERE email = ?",
      )
      .get(email) as UserRow | undefined;
  }

  create(input: CreateUserInput): UserRow {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, email, full_name, password_hash, account_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending_verification', ?, ?)`,
      )
      .run(input.id, input.email, input.fullName, input.passwordHash, now, now);

    const row = this.findByEmail(input.email);
    if (row === undefined) {
      throw new Error(`User insert succeeded but email ${input.email} was not found on re-read`);
    }
    return row;
  }
}
