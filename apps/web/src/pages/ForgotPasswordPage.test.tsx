import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { App } from "../App.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
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

import { apiFetch } from "../api.js";
const mockApiFetch = vi.mocked(apiFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ForgotPasswordPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderViaApp(initialPath = "/forgot-password") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

function fillEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value } });
}

function submitForm() {
  fireEvent.submit(
    screen.getByRole("button", { name: /Send reset instructions/i }).closest("form")!,
  );
}

const VALID_RESPONSE = {
  data: {
    message: "If the account exists, password reset instructions have been sent.",
  },
};

// ── Route registration ────────────────────────────────────────────────────────

describe("/forgot-password route", () => {
  it("renders the Reset your password heading at /forgot-password", () => {
    renderViaApp();
    screen.getByRole("heading", { name: "Reset your password", level: 1 });
  });
});

// ── Forgot password link on login page ────────────────────────────────────────

describe("login page Forgot password? link", () => {
  it("Forgot password? is a link pointing to /forgot-password", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link.getAttribute("href")).toBe("/forgot-password");
  });
});

// ── Form structure ────────────────────────────────────────────────────────────

describe("forgot password form structure", () => {
  it("renders the Email address field", () => {
    renderPage();
    screen.getByLabelText("Email address");
  });

  it("renders the Send reset instructions button", () => {
    renderPage();
    screen.getByRole("button", { name: "Send reset instructions" });
  });

  it("renders the Back to log in link pointing to /login", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /Back to log in/i });
    expect(link.getAttribute("href")).toBe("/login");
  });
});

// ── Client-side validation ────────────────────────────────────────────────────

describe("empty-field validation", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("blocks submit and shows required error when email is empty", async () => {
    renderPage();
    submitForm();

    await screen.findByText("Email address is required.");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ── Successful submission ─────────────────────────────────────────────────────

describe("successful submission", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("calls POST /auth/session with mode=password_reset_request and email", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    submitForm();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/auth/session", {
        method: "POST",
        body: JSON.stringify({ mode: "password_reset_request", email: "user@example.com" }),
      });
    });
  });

  it("displays the neutral confirmation message after successful submission", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    submitForm();

    await screen.findByText(
      "If the account exists, password reset instructions have been sent.",
    );
  });

  it("displays the neutral message even when the email does not match an account", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("nobody@example.com");
    submitForm();

    await screen.findByText(
      "If the account exists, password reset instructions have been sent.",
    );
  });

  it("hides the form after successful submission", async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_RESPONSE);
    renderPage();

    fillEmail("user@example.com");
    submitForm();

    await screen.findByText(
      "If the account exists, password reset instructions have been sent.",
    );
    expect(
      screen.queryByRole("button", { name: /Send reset instructions/i }),
    ).toBeNull();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("request failure", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("shows an error message when the API call fails", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
    renderPage();

    fillEmail("user@example.com");
    submitForm();

    await screen.findByText("Something went wrong. Please try again.");
  });

  it("keeps the form visible after a failed submission", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
    renderPage();

    fillEmail("user@example.com");
    submitForm();

    await screen.findByText("Something went wrong. Please try again.");
    screen.getByRole("button", { name: /Send reset instructions/i });
  });
});
