import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer.js";
import { ContactPage } from "./pages/ContactPage.js";
import { HomePage } from "./pages/HomePage";
import { PartnersServicesPage } from "./pages/PartnersServicesPage.js";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

function Placeholder() {
  return (
    <main>
      <h1>Web</h1>
      <p>App shell. Replace this with real features.</p>
    </main>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Footer />
    </>
  );
}
