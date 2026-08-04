/* text: #111 on background: #fff — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */
export function PrivacyPolicy() {
  return (
    <main style={{ color: "#111111", backgroundColor: "#ffffff" }}>
      <h1>Privacy Policy</h1>

      <section aria-labelledby="data-ownership-heading">
        <h2 id="data-ownership-heading">Your Data, Your Control</h2>
        <p>
          WellnessHub is committed to protecting your privacy. Your personal
          health information is never sold to third parties — not to advertisers,
          data brokers, or any other organisation.
        </p>
        <p>
          All data you share with WellnessHub is encrypted at rest and in transit
          using industry-standard security practices, so your wellness information
          stays private and secure at all times.
        </p>
        <p>
          You own your health data. You may export a copy of all your information
          or request its permanent deletion at any time from the My Account page.
        </p>
      </section>

      <section aria-labelledby="what-we-collect-heading">
        <h2 id="what-we-collect-heading">What We Collect</h2>
        <p>
          We collect health metrics from devices you connect (smartwatches, smart
          scales), together with the account details you provide during sign-up.
          We use this information solely to provide the WellnessHub dashboard and
          personalised insights.
        </p>
      </section>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact</h2>
        <p>
          If you have any questions about this Privacy Policy or how we handle
          your data, please reach out via the Contact page.
        </p>
      </section>
    </main>
  );
}
