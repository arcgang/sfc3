import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { RegisterPage } from "./RegisterPage.js";

// ── apiFetch mock ────────────────────────────────────────────────────────────

const mockApiFetch = {
  implementation: (_path: string, _opts: RequestInit): Promise<unknown> =>
    Promise.resolve({ data: { id: "u1", email: "a@b.com" } }),
};

vi.mock("../api.js", () => ({
  apiFetch: (path: string, opts: RequestInit) =>
    mockApiFetch.implementation(path, opts),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiFetch.implementation = (_path, _opts) =>
    Promise.resolve({ data: { id: "u1", email: "a@b.com" } });
});

// ── Route registration ────────────────────────────────────────────────────────

test("/register route renders the Create your account heading", () => {
  renderViaApp();
  screen.getByRole("heading", { name: "Create your account", level: 1 });
});

// ── Form renders all fields ───────────────────────────────────────────────────

test("form renders Full Name, Email address, and Password fields", () => {
  renderPage();
  screen.getByLabelText("Full Name");
  screen.getByLabelText("Email address");
  screen.getByLabelText("Password");
});

test("form renders the Create Account submit button", () => {
  renderPage();
  screen.getByRole("button", { name: "Create Account" });
});

// ── Required-field validation (empty submit) ──────────────────────────────────

test("submitting an empty form shows required-field errors for all three fields", () => {
  renderPage();

  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  screen.getByText("Full name is required.");
  screen.getByText("Email address is required.");
  screen.getByText("Password is required.");
});

test("submitting with only Full Name filled shows email and password errors", () => {
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  expect(screen.queryByText("Full name is required.")).toBeNull();
  screen.getByText("Email address is required.");
  screen.getByText("Password is required.");
});

// ── Email format validation ───────────────────────────────────────────────────

test("submitting with an invalid email format shows the email format error", () => {
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "not-an-email" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "validPass1" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  screen.getByText("Enter a valid email address.");
  expect(screen.queryByText("Full name is required.")).toBeNull();
  expect(screen.queryByText("Password is required.")).toBeNull();
});

// ── Password length validation ────────────────────────────────────────────────

test("submitting with a password shorter than 8 characters shows the password length error", () => {
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  screen.getByText("Password must be at least 8 characters.");
});

// ── Client-side validation blocks fetch ───────────────────────────────────────

test("client-side validation errors prevent apiFetch from being called", () => {
  const spy = vi.fn();
  mockApiFetch.implementation = spy;
  renderPage();

  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  expect(spy).not.toHaveBeenCalled();
});

// ── Successful registration navigates to /onboarding ─────────────────────────

test("valid form with mocked 201 response navigates to /onboarding", async () => {
  mockApiFetch.implementation = (_path, _opts) =>
    Promise.resolve({ data: { id: "abc", email: "alice@example.com" } });

  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice Smith" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securePass1" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/onboarding"));
});

test("valid form POSTs to /auth/session with mode=register", async () => {
  const calls: { path: string; opts: RequestInit }[] = [];
  mockApiFetch.implementation = (path, opts) => {
    calls.push({ path, opts });
    return Promise.resolve({ data: { id: "abc", email: "alice@example.com" } });
  };

  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice Smith" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securePass1" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.path).toBe("/auth/session");
  const body = JSON.parse(calls[0]!.opts.body as string) as Record<string, unknown>;
  expect(body["mode"]).toBe("register");
  expect(body["fullName"]).toBe("Alice Smith");
  expect(body["email"]).toBe("alice@example.com");
  expect(body["password"]).toBe("securePass1");
});

// ── 409 conflict shows error beneath email field ──────────────────────────────

test("mocked 409 response shows conflict error beneath the email field", async () => {
  const conflictBody = JSON.stringify({
    error: {
      type: "CONFLICT",
      details: [
        {
          code: "EMAIL_CONFLICT",
          message: "An account with this email already exists.",
          field: "email",
        },
      ],
    },
  });
  mockApiFetch.implementation = () =>
    Promise.reject(new Error(conflictBody));

  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alice Smith" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securePass1" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);

  await waitFor(() =>
    screen.getByText("An account with this email already exists."),
  );

  // Error appears in the email field container
  const emailContainer = screen.getByLabelText("Email address").closest("div")!;
  expect(emailContainer.textContent).toContain("An account with this email already exists.");
});
