import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { LoginPage } from "./LoginPage.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Route registration ────────────────────────────────────────────────────────

test("/login route renders the Welcome back heading", () => {
  renderViaApp();
  screen.getByRole("heading", { name: "Welcome back", level: 1 });
});

// ── Form fields ───────────────────────────────────────────────────────────────

test("login page renders Email address and Password fields", () => {
  renderPage();
  screen.getByLabelText("Email address");
  screen.getByLabelText("Password");
});

test("login page renders the Log In button", () => {
  renderPage();
  screen.getByRole("button", { name: "Log In" });
});

test("login page renders the Forgot password? link", () => {
  renderPage();
  screen.getByRole("link", { name: "Forgot password?" });
});

// ── Sign up link ──────────────────────────────────────────────────────────────

test("Sign up link points to /register", () => {
  renderPage();
  const link = screen.getByRole("link", { name: "Sign up" });
  expect(link.getAttribute("href")).toBe("/register");
});

test("Sign up link on /login page navigates to /register route", () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Sign up" });
  expect(link.getAttribute("href")).toBe("/register");
});
