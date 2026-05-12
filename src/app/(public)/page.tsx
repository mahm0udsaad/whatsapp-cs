import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getTenantContextForUser } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "نِهجز — مساعد ذكي للواتساب يرد على عملائك على مدار الساعة",
  description:
    "نِهجز يربط متجرك بواتساب الأعمال ويرد على عملائك تلقائياً بلهجتك ومن قاعدة معرفتك. تنبيهات لحظية، تصنيف ذكي، وحملات تسويقية من تطبيق جوّال واحد.",
};

const WHATSAPP_NUMBER = "966554866685";
const WA_MSG = encodeURIComponent(
  "السلام عليكم، أرغب بتجربة نِهجز بوت لإدارة محادثات الواتساب."
);
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${WA_MSG}`;

const FEATURES = [
  {
    title: "ردود ذكية بلهجتك",
    body: "المساعد يرد على عملائك بالعربية السعودية الطبيعية، يتبع تعليماتك، ويعرف منتجاتك ومواعيدك من قاعدة معرفتك.",
    icon: "💬",
  },
  {
    title: "قاعدة معرفة خاصة بك",
    body: "ارفع منتجاتك، خدماتك، أسعارك، وسياسات متجرك مرة واحدة. المساعد يرد بدقة بدون تخمين.",
    icon: "📚",
  },
  {
    title: "تصنيف وتصعيد تلقائي",
    body: "النظام يصنّف المحادثات تلقائياً (شكوى، حجز، VIP) ويرفع المحادثات الحساسة لك مباشرة.",
    icon: "🏷️",
  },
  {
    title: "تنبيهات لحظية على جوّالك",
    body: "تطبيق جوّال للآيفون والأندرويد يصلك التنبيه فوراً لما يتدخل عميل أو يحتاج رد بشري.",
    icon: "🔔",
  },
  {
    title: "حملات تسويقية ذكية",
    body: "أرسل عروضك لقائمة عملائك بصور احترافية مولّدة بالذكاء الاصطناعي، وقوالب جاهزة معتمدة من واتساب.",
    icon: "📣",
  },
  {
    title: "خصوصية وعزل تام",
    body: "كل متجر له بيانات معزولة. لا نشارك محادثات أو معرفة بين العملاء، وكل شيء مشفر.",
    icon: "🔒",
  },
];

const SCREENS = [
  {
    src: "/screenshots/01-inbox.png",
    title: "صندوق محادثات موحد",
    body: "كل محادثات الواتساب في مكان واحد، مع حالة الرد والتصنيف والمتابعة.",
  },
  {
    src: "/screenshots/02-ai-chat.png",
    title: "ردود ذكية تلقائية",
    body: "المساعد يجاوب عملاءك بلهجتك من قاعدة معرفتك، ويسلّمك المحادثة عند الحاجة.",
  },
  {
    src: "/screenshots/03-bookings.png",
    title: "إدارة الحجوزات والطلبات",
    body: "متابعة الحجوزات والطلبات اللي تأتي عبر الواتساب من نفس التطبيق.",
  },
  {
    src: "/screenshots/04-team-shifts.png",
    title: "فريق ومناوبات",
    body: "نظّم موظفينك ومناوباتهم وحوّل المحادثات بينهم بضغطة.",
  },
  {
    src: "/screenshots/05-campaigns.png",
    title: "حملات تسويقية",
    body: "أنشئ حملة، ولّد صورة بالذكاء الاصطناعي، واستهدف عملاءك بقوالب معتمدة.",
  },
];

const PRICING = [
  {
    name: "Starter",
    price: "299",
    period: "ريال / شهرياً",
    convos: "حتى 500 محادثة شهرياً",
    features: [
      "ردود ذكية تلقائية",
      "قاعدة معرفة لمتجر واحد",
      "تطبيق جوّال للموبايل",
      "تنبيهات لحظية",
      "5 صور تسويقية / شهر",
    ],
    highlight: false,
  },
  {
    name: "Business",
    price: "999",
    period: "ريال / شهرياً",
    convos: "حتى 2,000 محادثة شهرياً",
    features: [
      "كل مميزات Starter",
      "تصنيف وتصعيد ذكي",
      "حملات تسويقية مع قوالب",
      "30 صورة تسويقية / شهر",
      "دعم فني خلال 24 ساعة",
    ],
    highlight: true,
  },
  {
    name: "Pro",
    price: "4,999",
    period: "ريال / شهرياً",
    convos: "حتى 10,000 محادثة شهرياً",
    features: [
      "كل مميزات Business",
      "فريق ومناوبات بدون حد",
      "تحليلات متقدمة",
      "150 صورة تسويقية / شهر",
      "دعم فني خلال ساعة",
    ],
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "تواصل معنا",
    period: "تسعير مخصص",
    convos: "محادثات غير محدودة",
    features: [
      "كل مميزات Pro",
      "API مخصص",
      "تكامل مع أنظمتك",
      "مدير حساب مخصص",
      "اتفاقية مستوى خدمة (SLA)",
    ],
    highlight: false,
  },
];

const FAQ = [
  {
    q: "كيف أربط رقم الواتساب الخاص بي؟",
    a: "بعد تسجيل الدخول للوحة التحكم، نعطيك خطوات واضحة لربط رقمك عبر واتساب للأعمال. نحن نتولى الإعداد التقني الكامل.",
  },
  {
    q: "هل المساعد يرد بالعربية السعودية؟",
    a: "نعم، اللهجة الافتراضية سعودية طبيعية. تقدر تخصص شخصية المساعد ولهجته من اللوحة.",
  },
  {
    q: "هل أقدر أتدخل وأرد بنفسي؟",
    a: "بالتأكيد. التطبيق ينبهك على جوّالك لما يحتاج عميل ردك، وبضغطة وحدة تستلم المحادثة وتوقف المساعد.",
  },
  {
    q: "هل بياناتي ومحادثاتي خاصة؟",
    a: "نعم، كل عميل عنده بيئة معزولة تماماً. ما نشارك أي بيانات بين المتاجر، وكل شيء مشفر في النقل والتخزين.",
  },
];

export default async function LandingPage() {
  // Logged-in users skip the marketing site and go straight to their workspace.
  const user = await getCurrentUser();
  if (user) {
    const tenant = await getTenantContextForUser(user.id);
    if (
      !tenant?.restaurant ||
      tenant.setupStatus === "draft" ||
      tenant.setupStatus === "failed"
    ) {
      redirect("/onboarding");
    }
    redirect("/dashboard");
  }

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/60 via-white to-white">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مدعوم بالذكاء الاصطناعي
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.15]">
              مساعدك الذكي على واتساب،<br />
              <span className="text-emerald-600">يرد على عملائك بدالك.</span>
            </h1>
            <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-xl">
              نِهجز يربط متجرك بواتساب الأعمال ويرد على عملائك تلقائياً بلهجتك، من قاعدة معرفتك،
              على مدار الساعة. أنت تتابع كل شيء من تطبيق جوّال واحد.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition"
              >
                اطلب تجربة الآن
                <span className="text-lg">←</span>
              </a>
              <Link
                href="#features"
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-6 py-3.5 text-gray-800 font-semibold hover:bg-gray-50 transition"
              >
                شاهد المميزات
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-base">✓</span>
                ردود فورية 24/7
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-base">✓</span>
                لا حاجة لمهارات تقنية
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-base">✓</span>
                تركيب خلال يوم واحد
              </div>
            </div>
          </div>
          <div className="relative flex justify-center lg:justify-start">
            <div className="absolute inset-0 -z-10 bg-emerald-500/10 blur-3xl rounded-full" />
            <div className="relative w-[280px] sm:w-[320px] aspect-[9/19.5] rounded-[2.5rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
              <Image
                src="/screenshots/02-ai-chat.png"
                alt="واجهة المحادثات الذكية في تطبيق نِهجز"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 320px, 320px"
              />
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { v: "<1 ثانية", l: "وقت الرد" },
            { v: "24/7", l: "متاح دائماً" },
            { v: "العربية", l: "لهجة سعودية طبيعية" },
            { v: "100%", l: "خصوصية وعزل بيانات" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{s.v}</div>
              <div className="mt-1 text-xs sm:text-sm text-gray-500">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-emerald-600">المميزات</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
            كل ما تحتاجه لإدارة عملاء الواتساب من مكان واحد
          </h2>
          <p className="mt-4 text-gray-600">
            نِهجز ما هو مجرد بوت، هو نظام كامل يخلّي متجرك يرد ويبيع وينظّم محادثاته بدون جهد إضافي.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          {/* Card 1: Wide */}
          <div className="sm:col-span-2 rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-8 border border-emerald-100 flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute left-6 bottom-6 text-8xl opacity-10 group-hover:scale-110 transition-transform duration-500 grayscale">🤖</div>
            <div className="text-4xl mb-4 relative z-10">{FEATURES[0].icon}</div>
            <h3 className="font-bold text-2xl text-emerald-950 relative z-10">{FEATURES[0].title}</h3>
            <p className="mt-3 text-emerald-800/80 leading-relaxed max-w-md relative z-10">{FEATURES[0].body}</p>
          </div>

          {/* Card 2 */}
          <div className="rounded-3xl bg-white border border-gray-200 p-8 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
            <div className="text-4xl mb-auto">{FEATURES[1].icon}</div>
            <h3 className="font-bold text-lg text-gray-900 mt-6">{FEATURES[1].title}</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{FEATURES[1].body}</p>
          </div>

          {/* Card 3 */}
          <div className="rounded-3xl bg-white border border-gray-200 p-8 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
            <div className="text-4xl mb-auto">{FEATURES[2].icon}</div>
            <h3 className="font-bold text-lg text-gray-900 mt-6">{FEATURES[2].title}</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{FEATURES[2].body}</p>
          </div>

          {/* Card 4 */}
          <div className="rounded-3xl bg-white border border-gray-200 p-8 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
            <div className="text-4xl mb-auto">{FEATURES[3].icon}</div>
            <h3 className="font-bold text-lg text-gray-900 mt-6">{FEATURES[3].title}</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{FEATURES[3].body}</p>
          </div>

          {/* Card 5 */}
          <div className="rounded-3xl bg-white border border-gray-200 p-8 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
            <div className="text-4xl mb-auto">{FEATURES[4].icon}</div>
            <h3 className="font-bold text-lg text-gray-900 mt-6">{FEATURES[4].title}</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{FEATURES[4].body}</p>
          </div>

          {/* Card 6: Wide Dark */}
          <div className="sm:col-span-2 rounded-3xl bg-gray-900 p-8 border border-gray-800 flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute left-6 top-6 text-8xl opacity-5 group-hover:scale-110 transition-transform duration-500">🔒</div>
            <div className="text-4xl mb-4 relative z-10">{FEATURES[5].icon}</div>
            <h3 className="font-bold text-2xl text-white relative z-10">{FEATURES[5].title}</h3>
            <p className="mt-3 text-gray-400 leading-relaxed max-w-md relative z-10">{FEATURES[5].body}</p>
          </div>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section id="screens" className="bg-gray-50 border-y border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-sm font-semibold text-emerald-600">واجهة التطبيق</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
              تحكم كامل من جوّالك
            </h2>
            <p className="mt-4 text-gray-600">
              تطبيق نِهجز بوت متوفر على iOS و Android. كل ما تحتاجه لإدارة محادثاتك في جيبك.
            </p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {SCREENS.map((s) => (
              <div key={s.src} className="text-center">
                <div className="relative mx-auto w-[220px] aspect-[9/19.5] rounded-[2rem] border-[8px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden">
                  <Image
                    src={s.src}
                    alt={s.title}
                    fill
                    className="object-cover"
                    sizes="220px"
                  />
                </div>
                <h3 className="mt-5 font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-xs mx-auto">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-emerald-600">الباقات</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
            باقات تناسب حجم متجرك
          </h2>
          <p className="mt-4 text-gray-600">
            ابدأ صغير وكبّر متى ما احتجت. كل الباقات تشمل الذكاء الاصطناعي والتطبيق الجوّال.
          </p>
        </div>

        {/*
          Business-only eligibility banner.
          Required for App Store Review 3.1.3(c) — Enterprise Services. All
          Nehgz plans are sold to businesses (legal entities or sole-trader
          merchants) for commercial use only. Individual, consumer, and
          family use is not offered, and no purchase happens inside the
          iOS app — all billing is processed on this website.
        */}
        <div
          id="business-only-pricing-notice"
          className="mt-8 mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-sm leading-relaxed text-emerald-900"
          role="note"
          aria-label="Business-only eligibility notice"
        >
          <p className="font-semibold mb-1">
            جميع الباقات للأعمال التجارية فقط (B2B)
          </p>
          <p>
            نِهجز بوت يُباع حصراً للمتاجر والمطاعم والكافيهات والصالونات
            والعيادات والأنشطة التجارية المسجَّلة. لا نوفّر حسابات للأفراد أو
            للاستخدام الشخصي أو العائلي. جميع المدفوعات تتم عبر هذا الموقع
            فقط وليس داخل تطبيق الجوّال.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PRICING.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                p.highlight
                  ? "border-emerald-500 shadow-xl shadow-emerald-500/10 bg-white ring-2 ring-emerald-500/20"
                  : "border-gray-200 bg-white"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 right-1/2 translate-x-1/2 inline-flex items-center rounded-full bg-emerald-600 text-white px-3 py-1 text-xs font-semibold shadow">
                  الأكثر طلباً
                </span>
              )}
              <h3 className="font-bold text-lg text-gray-900">{p.name}</h3>
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-gray-900">{p.price}</span>
                  {p.price !== "تواصل معنا" && (
                    <span className="text-sm text-gray-500">ريال</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{p.period}</p>
              </div>
              <p className="mt-4 text-sm font-semibold text-gray-900">{p.convos}</p>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px]">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  p.highlight
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
                    : "border border-gray-300 text-gray-800 hover:bg-gray-50"
                }`}
              >
                {p.price === "تواصل معنا" ? "تواصل معنا" : "ابدأ التجربة"}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-gray-500">
          * الأسعار لا تشمل رسوم واتساب من Meta والتي تحتسب على المحادثة.
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-600">أسئلة شائعة</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
              تسأل، نجاوب
            </h2>
          </div>
          <dl className="mt-12 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-xl bg-white border border-gray-200 p-6">
                <dt className="font-bold text-gray-900">{f.q}</dt>
                <dd className="mt-2 text-sm text-gray-600 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-10 sm:p-14 text-center text-white shadow-2xl shadow-emerald-600/20">
          <h2 className="text-3xl sm:text-4xl font-extrabold">
            جاهز توقف الرد اليدوي على الواتساب؟
          </h2>
          <p className="mt-4 text-emerald-50 max-w-xl mx-auto leading-relaxed">
            خلّي نِهجز يجاوب عملاءك من اليوم. نركّب لك كل شي خلال 24 ساعة، وأنت تتابع من جوّالك.
          </p>
          <div className="mt-8">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-emerald-700 font-bold hover:bg-emerald-50 transition shadow-lg"
            >
              اطلب تجربة على الواتساب
              <span className="text-lg">←</span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
