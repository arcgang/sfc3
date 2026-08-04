import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "./Footer.js";

test("Footer renders Privacy Policy link pointing to /privacy", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Privacy Policy" });
  expect(link.getAttribute("href")).toBe("/privacy");
});

test("Footer renders Terms of Service link pointing to /terms", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Terms of Service" });
  expect(link.getAttribute("href")).toBe("/terms");
});

test("Footer renders Contact link pointing to /contact", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Contact" });
  expect(link.getAttribute("href")).toBe("/contact");
});
