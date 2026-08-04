import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContactPage } from "./ContactPage.js";

test("ContactPage renders a level-1 heading with text 'Contact Us'", () => {
  render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: /contact us/i, level: 1 });
});

test("ContactPage renders paragraph text 'Get in touch with us. We\\'d love to hear from you.'", () => {
  render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  );
  screen.getByText("Get in touch with us. We’d love to hear from you.");
});
