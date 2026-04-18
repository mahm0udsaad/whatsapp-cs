import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nehgz — WhatsApp AI Assistant for Restaurants",
  description:
    "Nehgz is a WhatsApp customer-service assistant for restaurants. Answer guests instantly, take orders on WhatsApp, and let your staff focus on the floor.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          WhatsApp AI for restaurants
        </p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">
          Your restaurant, always answering on WhatsApp
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
          Nehgz gives every restaurant a trained AI assistant on WhatsApp — so guests get
          instant answers to menu, hours, location, and order questions, and your team
          only steps in when it matters.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-white font-medium hover:bg-emerald-700"
          >
            Get started
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center rounded-lg border border-gray-300 px-5 py-2.5 text-gray-800 hover:bg-gray-50"
          >
            Talk to us
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Trained on your menu",
            body:
              "Upload your menu once. The assistant answers price, ingredient, and availability questions automatically.",
          },
          {
            title: "Takes orders on WhatsApp",
            body:
              "Guests can browse, order, and confirm delivery details entirely in chat. New orders show up instantly in your dashboard.",
          },
          {
            title: "Escalates to real staff",
            body:
              "Complex requests auto-route to a human. Your team sees the full thread and takes over with one tap.",
          },
          {
            title: "Operator mobile app",
            body:
              "Nehgz Bot for iPhone lets managers reply, monitor shifts, and track conversations on the go.",
          },
          {
            title: "Multi-language",
            body:
              "Built for Arabic and English customers out of the box. The assistant replies in the customer's language.",
          },
          {
            title: "Private by design",
            body:
              "Every restaurant's data stays isolated. We never share messages or menus across tenants.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-gray-200 p-6 hover:border-gray-300 transition"
          >
            <h3 className="font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-20 rounded-2xl bg-gray-50 p-10 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">
          Ready to go live on WhatsApp?
        </h2>
        <p className="mt-3 text-gray-600 max-w-xl mx-auto">
          Onboarding takes minutes. Point us at your menu, confirm your hours, and your
          restaurant is answering customers the same day.
        </p>
        <div className="mt-6">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-white font-medium hover:bg-emerald-700"
          >
            Create a restaurant
          </Link>
        </div>
      </section>
    </div>
  );
}
