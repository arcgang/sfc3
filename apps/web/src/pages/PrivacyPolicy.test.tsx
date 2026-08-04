import { render, screen } from "@testing-library/react";
import { PrivacyPolicy } from "./PrivacyPolicy.js";

test("PrivacyPolicy renders a level-1 heading with text 'Privacy Policy'", () => {
  render(<PrivacyPolicy />);
  screen.getByRole("heading", { name: /privacy policy/i, level: 1 });
});

test("PrivacyPolicy states data is never sold to third parties", () => {
  render(<PrivacyPolicy />);
  screen.getByText(/never sold to third parties/i);
});

test("PrivacyPolicy states data is encrypted at rest and in transit", () => {
  render(<PrivacyPolicy />);
  screen.getByText(/encrypted at rest and in transit/i);
});
