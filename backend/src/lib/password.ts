import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/** Very small strength check used by register / reset-password. */
export function assertStrongEnough(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
}
