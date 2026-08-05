import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer.js";
import { ContactPage } from "./pages/ContactPage.js";
import { HomePage } from "./pages/HomePage";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

function Placeholder() {
  return (
    <main>
      <h1>Web</h1>
      <p>App shell. Replace this with real features.</p>
    </main>
  );
}

function WithFooter({ children }: { children: import("react").ReactNode }) {
  return (
    <>
      {children}
      <Footer />
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
