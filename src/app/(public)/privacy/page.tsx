import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Nehgz",
  description:
    "How Nehgz collects, uses, and protects data for the Nehgz web dashboard and Nehgz Bot mobile app.",
};

const EFFECTIVE_DATE = "April 18, 2026";
const CONTACT_EMAIL = "privacy@whatsapp-cs.vercel.app";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-gray-700 leading-relaxed [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-emerald-700 [&_a]:underline hover:[&_a]:text-emerald-800">
      <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="text-sm text-gray-500">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        This Privacy Policy explains how Nehgz (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
        collects and uses information when you use the Nehgz web dashboard at{" "}
        <a href="https://whatsapp-cs.vercel.app">whatsapp-cs.vercel.app</a> or the
        Nehgz Bot iOS app (together, the &ldquo;Service&rdquo;). The Service is a tool
        for restaurants to operate an AI-powered customer-service assistant on
        WhatsApp.
      </p>

      <h2>1. Who this policy applies to</h2>
      <p>
        Nehgz serves two groups: (a) restaurant operators who hold a Nehgz account and
        use the dashboard or mobile app, and (b) end-customers who message the
        restaurant on WhatsApp. This policy covers both groups.
      </p>

      <h2>2. Information we collect</h2>
      <h3>2.1 Restaurant operator accounts</h3>
      <ul>
        <li>Account details: name, email, phone number, role, restaurant name.</li>
        <li>
          Restaurant configuration: menu, hours, delivery areas, AI assistant
          instructions, team member accounts.
        </li>
        <li>
          WhatsApp sender metadata provided through Twilio (phone number, display
          name, approval status).
        </li>
        <li>
          Device and session data required to run the mobile app, including push
          notification tokens and anonymous diagnostic logs.
        </li>
      </ul>

      <h3>2.2 End-customer WhatsApp conversations</h3>
      <ul>
        <li>
          Messages sent to the restaurant&apos;s WhatsApp number, including text,
          attachments, and delivery/read status.
        </li>
        <li>WhatsApp profile phone number and display name as provided by WhatsApp.</li>
        <li>Order details a customer submits in chat (items, address, notes).</li>
      </ul>
      <p>
        We do not independently control WhatsApp. Messages reach us through Meta and
        Twilio under their own terms and privacy policies.
      </p>

      <h3>2.3 Automatic data</h3>
      <p>
        We collect basic technical data such as IP address, browser or device type,
        timestamps, and error reports when you use the Service. This is used only to
        operate, secure, and debug the Service.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To route WhatsApp messages to the correct restaurant.</li>
        <li>
          To generate AI replies trained on the restaurant&apos;s own menu and
          knowledge base.
        </li>
        <li>
          To display conversations, orders, and operational metrics to authorized
          operators.
        </li>
        <li>
          To send push notifications about new messages and escalations to the mobile
          app.
        </li>
        <li>To maintain security, prevent abuse, and meet legal obligations.</li>
      </ul>

      <h2>4. AI processing</h2>
      <p>
        Reply generation uses third-party AI providers (currently Google Gemini). Only
        the specific message context required to produce a reply is sent. We do not
        authorize these providers to train their public models on restaurant or
        customer conversations. Prompts may be temporarily retained by the provider
        solely for abuse monitoring as described in their own policies.
      </p>

      <h2>5. Sharing</h2>
      <p>We share data only with the service providers that power the product:</p>
      <ul>
        <li>
          <strong>Supabase</strong> — database and authentication hosting.
        </li>
        <li>
          <strong>Twilio</strong> and <strong>Meta / WhatsApp Business Platform</strong>{" "}
          — message delivery.
        </li>
        <li>
          <strong>Google</strong> — AI inference.
        </li>
        <li>
          <strong>Vercel</strong> — web hosting.
        </li>
        <li>
          <strong>Apple Push Notification Service</strong> — iOS push delivery.
        </li>
      </ul>
      <p>
        We do not sell personal information. We do not share data between restaurants.
        Each tenant&apos;s data is logically isolated.
      </p>

      <h2>6. Data retention</h2>
      <p>
        Conversations, orders, and operator accounts are retained while the restaurant
        has an active Nehgz account. When an account is deleted, associated data is
        removed within 30 days, except where we are required to retain it for legal,
        accounting, or security reasons.
      </p>

      <h2>7. Security</h2>
      <p>
        We use encryption in transit (HTTPS), row-level security in our database, and
        scoped API keys. No system is perfectly secure, but we work to limit blast
        radius if a vulnerability is discovered.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can request access, correction, or deletion of your personal data by
        emailing us. If you are an end-customer who messaged a restaurant using Nehgz,
        please contact that restaurant directly; we will support their response.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is not intended for people under 13. We do not knowingly collect
        data from children.
      </p>

      <h2>10. International users</h2>
      <p>
        Nehgz operates out of the Kingdom of Saudi Arabia and processes data on
        infrastructure that may be located in other regions. By using the Service, you
        consent to processing in those regions.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy. Material changes will be announced in-product or by
        email to account owners. Continued use of the Service constitutes acceptance of
        the updated policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions, requests, or complaints? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
