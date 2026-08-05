const TOKEN_KEY = "wh_token";
const API_BASE_PATH = "/api/v1";

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function removeToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

function redirectToLogin(): void {
  window.location.href = "/login";
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = import.meta.env["VITE_API_URL"] ?? "http://localhost:3000";
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl}${API_BASE_PATH}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    removeToken();
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error((await res.text()) || "Request failed");
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable
  }
}

export function clearToken(): void {
  removeToken();
}
