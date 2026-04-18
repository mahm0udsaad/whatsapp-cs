import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — Nehgz",
  description: "Get help with the Nehgz dashboard and the Nehgz Bot mobile app.",
};

const SUPPORT_EMAIL = "support@whatsapp-cs.vercel.app";
const FEEDBACK_EMAIL = "feedback@whatsapp-cs.vercel.app";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Support</h1>
      <p className="mt-3 text-gray-600">
        We want Nehgz to feel invisible when it&apos;s working and fast to fix when
        it&apos;s not. Pick the channel that fits your situation.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900">General support</h2>
          <p className="mt-2 text-sm text-gray-600">
            Questions about setup, billing, or day-to-day use.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-4 inline-flex items-center text-emerald-700 font-medium hover:text-emerald-800"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
        <div className="rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900">TestFlight feedback</h2>
          <p className="mt-2 text-sm text-gray-600">
            Bugs, ideas, and rough edges in the Nehgz Bot iOS beta.
          </p>
          <a
            href={`mailto:${FEEDBACK_EMAIL}`}
            className="mt-4 inline-flex items-center text-emerald-700 font-medium hover:text-emerald-800"
          >
            {FEEDBACK_EMAIL}
          </a>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900">Common questions</h2>
        <dl className="mt-5 space-y-6">
          <div>
            <dt className="font-medium text-gray-900">How do I connect my WhatsApp number?</dt>
            <dd className="mt-1 text-sm text-gray-600">
              Sign in and go to WhatsApp Setup in the dashboard. We walk you through
              the Twilio / Meta sender provisioning flow step by step.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Does the AI reply in Arabic?</dt>
            <dd className="mt-1 text-sm text-gray-600">
              Yes. Nehgz replies in the customer&apos;s language. Arabic and English
              are supported out of the box.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Can a human take over a conversation?</dt>
            <dd className="mt-1 text-sm text-gray-600">
              Yes. The Nehgz Bot mobile app surfaces any thread flagged for escalation.
              One tap puts you in the conversation and pauses the AI.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Is my menu private to my restaurant?</dt>
            <dd className="mt-1 text-sm text-gray-600">
              Yes. Each restaurant&apos;s menu, knowledge base, and conversations are
              isolated. See our{" "}
              <Link href="/privacy" className="text-emerald-700 hover:underline">
                Privacy Policy
              </Link>{" "}
              for details.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
