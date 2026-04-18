import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Nehgz",
  description:
    "Terms governing use of the Nehgz web dashboard and Nehgz Bot mobile app.",
};

const EFFECTIVE_DATE = "April 18, 2026";
const CONTACT_EMAIL = "support@whatsapp-cs.vercel.app";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-gray-700 leading-relaxed [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-emerald-700 [&_a]:underline hover:[&_a]:text-emerald-800">
      <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
      <p className="text-sm text-gray-500">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        These Terms of Service (“Terms”) govern your access to and use of the Nehgz
        web dashboard at{" "}
        <a href="https://whatsapp-cs.vercel.app">whatsapp-cs.vercel.app</a> and the
        Nehgz Bot iOS app (together, the “Service”). By creating an account or using
        the Service, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        Nehgz provides restaurants with a WhatsApp AI assistant, an operator dashboard,
        a mobile app for operators, and related tooling. Nehgz relies on third-party
        platforms (including Meta WhatsApp Business, Twilio, Supabase, Google, and
        Apple). Availability of the Service depends on the availability of those
        platforms.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account and keep your
        credentials secure. You are responsible for everything that happens under your
        account. Each restaurant account is intended for a single restaurant or group
        of restaurants under common ownership.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not use the Service to send spam or unsolicited messages.</li>
        <li>
          Do not configure the AI assistant to impersonate another business or to
          deceive customers.
        </li>
        <li>
          Do not use the Service to send content that is illegal, harassing, or
          violates Meta&apos;s WhatsApp Business Messaging Policy.
        </li>
        <li>Do not attempt to bypass rate limits, tenant boundaries, or authentication.</li>
        <li>Do not upload menus or content you do not have the right to use.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these rules or that put the
        health of the platform at risk.
      </p>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of menus, knowledge-base articles, messages, and other
        content you or your customers submit. You grant Nehgz a limited license to
        store, process, and display this content solely to operate the Service for you.
      </p>

      <h2>5. Customer messages</h2>
      <p>
        You are responsible for complying with local law and with WhatsApp&apos;s own
        policies in your communications with end-customers, including obtaining any
        required consent before messaging them.
      </p>

      <h2>6. Fees</h2>
      <p>
        Some plans may be free during the pilot period. Paid plans, when offered, will
        be billed according to the pricing presented at checkout. You are responsible
        for any taxes and for any usage-based charges imposed by Meta or Twilio for
        WhatsApp messaging.
      </p>

      <h2>7. AI output</h2>
      <p>
        The AI assistant generates replies based on your configuration and may
        occasionally produce inaccurate or unexpected output. You are responsible for
        reviewing the configuration and for any reply sent from your restaurant&apos;s
        account. Nehgz does not guarantee that AI output will be error-free.
      </p>

      <h2>8. Beta features and TestFlight</h2>
      <p>
        Features marked as beta — including access through Apple TestFlight — are
        provided as-is for evaluation. They may change, break, or be withdrawn without
        notice. Feedback submitted through TestFlight or by email helps us improve the
        Service.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY
        KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEHGZ WILL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR
        RELATED TO YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY WILL NOT EXCEED THE
        FEES YOU PAID US IN THE 3 MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM,
        OR 100 USD IF GREATER.
      </p>

      <h2>11. Termination</h2>
      <p>
        You can stop using the Service at any time by deleting your account. We may
        terminate or suspend accounts that violate these Terms, that threaten the
        Service, or that remain inactive for an extended period.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms. If changes are material we will give reasonable
        notice. Continued use after the effective date of an update constitutes
        acceptance.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Kingdom of Saudi Arabia, without
        regard to its conflict-of-laws rules.
      </p>

      <h2>14. Contact</h2>
      <p>
        For questions about these Terms, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
