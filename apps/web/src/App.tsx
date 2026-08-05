import { Route, Routes, useLocation } from "react-router-dom";
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

<<<<<<< HEAD
function WithFooter({ children }: { children: import("react").ReactNode }) {
  return (
    <>
      {children}
      <Footer />
=======
export function App() {
  const location = useLocation();
  // HomePage renders its own footer; suppress the global one there to avoid duplicate links
  const showGlobalFooter = location.pathname !== "/";
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
      {showGlobalFooter && <Footer />}
>>>>>>> origin/main
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/privacy" element={<WithFooter><PrivacyPolicy /></WithFooter>} />
      <Route path="/contact" element={<WithFooter><ContactPage /></WithFooter>} />
      <Route path="*" element={<WithFooter><Placeholder /></WithFooter>} />
    </Routes>
  );
}
