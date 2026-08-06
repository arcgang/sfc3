const TOKEN_KEY = "wh_token";
const EXPIRES_AT_KEY = "expiresAt";

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
