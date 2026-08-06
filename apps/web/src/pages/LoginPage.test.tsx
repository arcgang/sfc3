import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { App } from "../App.js";
import { Layout } from "../components/Layout.js";
import { LoginPage } from "./LoginPage.js";
import { AuthProvider } from "../context/AuthContext.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { apiFetch, setToken, clearToken } from "../api.js";
const mockApiFetch = vi.mocked(apiFetch);
const mockSetToken = vi.mocked(setToken);
const mockClearToken = vi.mocked(clearToken);

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderViaApp(initialPath = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

function fillEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value } });
}

function fillPassword(value: string) {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value } });
}

function submitForm() {
  fireEvent.submit(screen.getByRole("button", { name: /Log In/i }).closest("form")!);
}

const VALID_RESPONSE = {
  data: {
    accessToken: "test-jwt-token",
    expiresAt: "2099-01-01T00:00:00.000Z",
    user: { id: "u1", email: "user@example.com" },
  },
};

// ── Route registration ────────────────────────────────────────────────────────

describe("/login route", () => {
  it("renders the Welcome back heading", () => {
    renderViaApp();
    screen.getByRole("heading", { name: "Welcome back", level: 1 });
  });
});

// ── Form fields ───────────────────────────────────────────────────────────────

describe("login form fields", () => {
  it("renders Email address and Password fields", () => {
    renderPage();
    screen.getByLabelText("Email address");
    screen.getByLabelText("Password");
  });

  it("renders the Log In button", () => {
    renderPage();
    screen.getByRole("button", { name: "Log In" });
  });

  it("renders the Forgot password? link", () => {
    renderPage();
    screen.getByRole("link", { name: "Forgot password?" });
  });
});

// ── Sign up link ──────────────────────────────────────────────────────────────

describe("sign up link", () => {
  it("Sign up link points to /register", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link.getAttribute("href")).toBe("/register");
  });

  it("Sign up link on /login page navigates to /register route", () => {
    renderViaApp();
    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link.getAttribute("href")).toBe("/register");
  });
});

// ── Security note ─────────────────────────────────────────────────────────────

describe("security note", () => {
  it("renders the lock-icon security copy", () => {
    renderPage();
    screen.getByText("Your session is secure and encrypted.");
  });

  it("renders 🔒 lock icon with aria-hidden before the security copy", () => {
    renderPage();
    const securityPara = screen.getByText("Your session is secure and encrypted.").parentElement!;
    const icon = securityPara.querySelector('[aria-hidden="true"]');
    expect(icon?.textContent).toBe("🔒");
  });
});

// ── Client-side validation — empty fields block submit ────────────────────────

describe("empty-field validation", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockApiFetch.mockReset();
  });

  it("blocks submit and shows required error when email is empty", async () => {
    renderPage();
    fillPassword("secret123");
    submitForm();

    await screen.findByText("Email address is required.");
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("blocks submit and shows required error when password is empty", async () => {
    renderPage();
    fillEmail("user@example.com");
    submitForm();

    await screen.findByText("Password is required.");
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("blocks submit and shows errors for both fields when both are empty", async () => {
    renderPage();
    submitForm();

    await screen.findByText("Email address is required.");
    await screen.findByText("Password is required.");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ── Successful login ──────────────────────────────────────────────────────────

describe("successful login", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockApiFetch.mockReset();
    mockSetToken.mockReset();
  });

  it("calls POST /auth/session with mode=login, email, and password", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    fillPassword("secret123");
    submitForm();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/auth/session", {
        method: "POST",
        body: JSON.stringify({ mode: "login", email: "user@example.com", password: "secret123" }),
      });
    });
  });

  it("stores accessToken via setToken after successful response", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    fillPassword("secret123");
    submitForm();

    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("test-jwt-token");
    });
  });

  it("redirects to /dashboard after successful login", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    fillPassword("secret123");
    submitForm();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });
});

// ── Failed login ──────────────────────────────────────────────────────────────

describe("failed login", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockApiFetch.mockReset();
  });

  it("shows a generic error message on 401 without confirming account existence", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Unauthorized"));
    renderPage();

    fillEmail("unknown@example.com");
    fillPassword("wrongpass");
    submitForm();

    await screen.findByText("Invalid email or password. Please try again.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not expose server error detail about which field failed", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('{"error":{"message":"Email not found"}}'));
    renderPage();

    fillEmail("nobody@example.com");
    fillPassword("anypass");
    submitForm();

    const errorEl = await screen.findByRole("alert");
    expect(errorEl.textContent).toBe("Invalid email or password. Please try again.");
    expect(screen.queryByText(/Email not found/)).toBeNull();
  });

  it("does not redirect to /dashboard on a failed login", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Bad credentials"));
    renderPage();

    fillEmail("user@example.com");
    fillPassword("wrongpass");
    submitForm();

    await screen.findByText("Invalid email or password. Please try again.");
    expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard", expect.anything());
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe("logout", () => {
  it("logout calls clearToken and navigates to /login when the Log out link is clicked", () => {
    mockClearToken.mockReset();
    mockNavigate.mockReset();

    // Render Layout directly inside AuthProvider + MemoryRouter — no need to
    // go through App's route guards to test the logout interaction.
    render(
      <MemoryRouter>
        <AuthProvider>
          <Layout />
        </AuthProvider>
      </MemoryRouter>,
    );

    const logoutLink = screen.getByRole("link", { name: "Log out" });
    fireEvent.click(logoutLink);

    expect(mockClearToken).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});
