import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getTenantContextForUser } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "نِحجز — مساعد ذكي للواتساب يرد على عملائك على مدار الساعة",
  description:
    "نِحجز يربط متجرك بواتساب الأعمال ويرد على عملائك تلقائياً بلهجتك ومن قاعدة معرفتك. تنبيهات لحظية، تصنيف ذكي، وحملات تسويقية من تطبيق جوّال واحد.",
};

const WHATSAPP_NUMBER = "966554866685";
const WA_MSG = encodeURIComponent(
  "السلام عليكم، أرغب بتجربة نِحجز بوت لإدارة محادثات الواتساب."
);
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${WA_MSG}`;

const FEATURES = [
  {
    title: "ردود ذكية بلهجتك",
    body: "المساعد يرد على عملائك بالعربية السعودية الطبيعية، يتبع تعليماتك، ويعرف منتجاتك ومواعيدك من قاعدة معرفتك.",
    tag: "AI Reply",
    stat: "أقل من ثانية",
  },
  {
    title: "قاعدة معرفة خاصة بك",
    body: "ارفع منتجاتك، خدماتك، أسعارك، وسياسات متجرك مرة واحدة. المساعد يرد بدقة بدون تخمين.",
    tag: "Knowledge",
    stat: "مصدر واحد",
  },
  {
    title: "تصنيف وتصعيد تلقائي",
    body: "النظام يصنّف المحادثات تلقائياً (شكوى، حجز، VIP) ويرفع المحادثات الحساسة لك مباشرة.",
    tag: "Routing",
    stat: "حساسية أعلى",
  },
  {
    title: "تنبيهات لحظية على جوّالك",
    body: "تطبيق جوّال للآيفون والأندرويد يصلك التنبيه فوراً لما يتدخل عميل أو يحتاج رد بشري.",
    tag: "Push",
    stat: "فوري",
  },
  {
    title: "حملات تسويقية ذكية",
    body: "أرسل عروضك لقائمة عملائك بصور احترافية مولّدة بالذكاء الاصطناعي، وقوالب جاهزة معتمدة من واتساب.",
    tag: "Campaigns",
    stat: "جاهز للإطلاق",
  },
  {
    title: "خصوصية وعزل تام",
    body: "كل متجر له بيانات معزولة. لا نشارك محادثات أو معرفة بين العملاء، وكل شيء مشفر.",
    tag: "Security",
    stat: "عزل كامل",
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
    title: "طلبات تنتظر قرارك",
    body: "البوت يصعّد لك المحادثات الحساسة، وتراجع الطلب وتستلم المحادثة وتتخذ القرار بضغطة.",
  },
  {
    src: "/screenshots/04-team-shifts.png",
    title: "فريق ومناوبات",
    body: "تابع توفّر فريقك وضغط العمل عليهم، وحوّل المحادثات بينهم بسهولة.",
  },
  {
    src: "/screenshots/05-campaigns.png",
    title: "تسويق متعدد القنوات",
    body: "أدر حملاتك ومنشوراتك على واتساب وانستقرام وفيسبوك، وتابع الأداء من مكان واحد.",
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
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(1,31,145,0.08),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(252,189,5,0.05),transparent_40%),linear-gradient(180deg,#f8fbff_0%,#ffffff_50%,#f0f7ff_100%)]">
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#011F91]/20 to-transparent" />
        
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-[#011F91]/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[30%] h-[30%] bg-[#FCBD05]/5 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pt-6 pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-10 lg:pb-24">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#011F91]/10 bg-white/60 backdrop-blur-md px-4 py-2 text-xs font-bold text-[#011F91] shadow-sm mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FCBD05] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FCBD05]"></span>
              </span>
              منصة تشغيل واتساب للأعمال بالذكاء الاصطناعي
            </div>
            
            <h1 className="text-4xl font-black leading-[1.1] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl [text-wrap:balance]">
              مساعد واتساب <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#011F91] to-[#4361ee]">يبدو كأنه جزء</span> من فريقك.
            </h1>
            
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 lg:text-xl">
              نِحجز يربط متجرك بواتساب الأعمال ويرد على عملائك تلقائياً بلهجتك، من قاعدة معرفتك،
              على مدار الساعة. <span className="font-semibold text-slate-900">أنت تتابع كل شيء من تطبيق جوّال واحد.</span>
            </p>
            
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-[#011F91] px-8 py-4 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                اطلب تجربة الآن
                <span className="text-xl transition-transform group-hover:translate-x-[-4px]">←</span>
              </a>
              <Link
                href="#features"
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-8 py-4 font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
              >
                شاهد المميزات
              </Link>
            </div>
            
            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-3 space-x-reverse">
                {["نون", "سلة", "زد", "مكياجي"].map((name, i) => (
                  <div key={i} className="relative h-10 w-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                    <Image src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=100`} alt={name} fill className="object-cover" unoptimized />
                  </div>
                ))}
                <div className="z-10 h-10 w-10 rounded-full border-2 border-white bg-[#011F91] flex items-center justify-center text-[10px] font-bold text-white">
                  +50
                </div>
              </div>
              <div className="text-sm">
                <div className="font-bold text-slate-950">موثوق من قبل متاجر رائدة</div>
                <div className="text-slate-500">في المملكة العربية السعودية</div>
              </div>
            </div>
          </div>

          <div className="relative z-10 lg:ml-[-1rem]">
            <div className="relative mx-auto w-full max-w-[320px]">
              <div className="relative z-20 rounded-[2.5rem] border-[10px] border-slate-950 bg-slate-950 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]">
                <div className="aspect-[9/19] overflow-hidden rounded-[1.8rem] bg-white">
                  <Image
                    src="/screenshots/02-ai-chat.png"
                    alt="واجهة المحادثات الذكية"
                    fill
                    priority
                    className="object-cover"
                  />
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-3 h-5 w-20 rounded-full bg-slate-950" />
              </div>

              <div className="absolute -left-8 top-16 z-30 animate-bounce-subtle">
                <div className="rounded-xl border border-white/50 bg-white/80 p-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-lg">
                      <span className="">💬</span>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">الرد الذكي</div>
                      <div className="text-xs font-bold text-slate-900">تم الرد على عميل VIP</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -right-6 bottom-24 z-30 animate-bounce-subtle" style={{ animationDelay: '1s' }}>
                <div className="rounded-xl border border-white/50 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-md text-white">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#FCBD05] flex items-center justify-center">
                      <span className="text-lg">🚀</span>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-[#FCBD05] uppercase tracking-wider">حملة نشطة</div>
                      <div className="text-xs font-bold">وصول بنسبة 98%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -inset-20 z-0 border border-slate-200/50 rounded-full pointer-events-none" />
              <div className="absolute -inset-40 z-0 border border-slate-200/30 rounded-full pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-slate-100 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
          {[
            { v: "<1 ثانية", l: "وقت الرد", i: "⚡" },
            { v: "24/7", l: "متاح دائماً", i: "🌙" },
            { v: "العربية", l: "لهجة سعودية", i: "🇸🇦" },
            { v: "100%", l: "خصوصية البيانات", i: "🔒" },
          ].map((s) => (
            <div key={s.l} className="flex flex-col items-center text-center">
              <div className="text-2xl mb-2">{s.i}</div>
              <div className="text-3xl font-black text-slate-950">{s.v}</div>
              <div className="text-sm text-slate-500 font-medium">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section (Bento Grid) */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 sm:py-32 scroll-mt-20">
        <div className="flex flex-col items-center text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#011F91]/5 px-4 py-2 text-xs font-bold text-[#011F91] mb-4">
            المميزات الذكية
          </div>
          <h2 className="text-3xl font-black text-slate-950 sm:text-5xl lg:text-6xl tracking-tight [text-wrap:balance]">
            نظام خدمة عملاء مصمم <br className="hidden md:block" /> ليسبق تطلعاتك
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            دمجنا أحدث تقنيات الذكاء الاصطناعي مع واجهة مستخدم بديهية لنوفر لك تجربة إدارة محادثات لا مثيل لها.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 md:grid-rows-2 gap-4 h-auto md:h-[700px]">
          <div className="md:col-span-3 md:row-span-2 relative overflow-hidden rounded-[2.5rem] border border-[#011F91]/10 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] p-8 lg:p-12 group transition-all hover:shadow-2xl hover:shadow-[#011F91]/5">
            <div className="relative z-10 flex flex-col h-full">
              <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl mb-8 group-hover:scale-110 transition-transform">
                🤖
              </div>
              <h3 className="text-3xl font-black text-slate-950 mb-4">{FEATURES[0].title}</h3>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">{FEATURES[0].body}</p>
              <div className="mt-auto">
                <div className="inline-flex items-center gap-4 rounded-2xl bg-white/60 backdrop-blur-sm p-4 border border-white/50">
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">زمن الرد</div>
                  <div className="text-2xl font-black text-[#011F91]">{FEATURES[0].stat}</div>
                </div>
              </div>
            </div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] aspect-square bg-[#011F91]/5 rounded-full blur-3xl group-hover:bg-[#011F91]/10 transition-colors" />
          </div>

          <div className="md:col-span-3 md:row-span-1 relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-8 group transition-all hover:border-[#FCBD05]/30">
            <div className="relative z-10 flex gap-6 items-start">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center text-2xl group-hover:rotate-12 transition-transform">
                📚
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">{FEATURES[1].title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{FEATURES[1].body}</p>
              </div>
            </div>
          </div>

          <div className="md:col-span-1 md:row-span-1 relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-slate-50 p-6 flex flex-col items-center text-center group transition-all hover:bg-slate-100">
             <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🎯</div>
             <h3 className="text-sm font-bold text-slate-950">{FEATURES[2].title}</h3>
          </div>

          <div className="md:col-span-2 md:row-span-1 relative overflow-hidden rounded-[2.5rem] border border-slate-950 bg-slate-950 p-8 text-white group">
            <div className="relative z-10">
              <div className="text-xs font-bold text-[#FCBD05] uppercase tracking-widest mb-4">{FEATURES[3].tag}</div>
              <h3 className="text-xl font-bold mb-2">{FEATURES[3].title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{FEATURES[3].body}</p>
            </div>
            <div className="absolute top-0 right-0 p-4 opacity-20 text-4xl">📱</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-8 flex items-center gap-8 group">
             <div className="h-16 w-16 shrink-0 rounded-2xl bg-[#FCBD05]/10 flex items-center justify-center text-3xl">
                🎨
             </div>
             <div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">{FEATURES[4].title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{FEATURES[4].body}</p>
             </div>
          </div>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-8 flex items-center gap-8 group">
             <div className="h-16 w-16 shrink-0 rounded-2xl bg-emerald-50 flex items-center justify-center text-3xl">
                🔒
             </div>
             <div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">{FEATURES[5].title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{FEATURES[5].body}</p>
             </div>
          </div>
        </div>
      </section>

      {/* Screens Section */}
      <section id="screens" className="relative overflow-hidden bg-slate-950 py-24 sm:py-32 scroll-mt-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(67,97,238,0.15),transparent_70%)]" />
        
        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-[#FCBD05] mb-4">
                تجربة المستخدم
              </div>
              <h2 className="text-3xl font-black text-white sm:text-5xl lg:text-6xl tracking-tight">
                كل قنواتك <br /> <span className="text-[#4361ee]">في جيبك</span>
              </h2>
            </div>
            <p className="max-w-md text-lg text-slate-400 leading-relaxed">
              صممنا تطبيق الجوال ليكون مركز تحكم ذكي يسمح لك بمراقبة المساعد والتدخل في أي لحظة بضغطة زر واحدة.
            </p>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-12 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SCREENS.map((s) => (
              <div 
                key={s.src} 
                className="flex-none w-[280px] sm:w-[320px] snap-center"
              >
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-b from-[#4361ee]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem] blur-2xl -z-10" />
                  
                  <div className="relative mx-auto rounded-[3rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden aspect-[9/19]">
                    <Image
                      src={s.src}
                      alt={s.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-3 h-5 w-20 rounded-full bg-slate-900" />
                  </div>
                  
                  <div className="mt-8 text-center sm:text-right">
                    <h3 className="text-xl font-bold text-white mb-2">{s.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Sales Section */}
      <section id="contact-sales" className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 scroll-mt-20">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_70%_50%,rgba(1,31,145,0.03),transparent_50%)] pointer-events-none" />
        
        <div className="relative z-10 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#011F91]/5 px-4 py-2 text-xs font-bold text-[#011F91] mb-6">
              للأعمال والشركات
            </div>
            <h2 className="text-4xl font-black text-slate-950 sm:text-5xl lg:text-6xl tracking-tight [text-wrap:balance] mb-8">
              حلول متكاملة <br /> تناسب حجم طموحاتك
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed mb-10">
              {"نحن لا نقدم مجرد \"بوت\"، بل نقدم تجربة تشغيل متكاملة تبدأ بفهم احتياجاتك وتنتهي بضبط دقيق لقاعدة المعرفة والربط التقني."}
            </p>
            
            <div className="space-y-6">
              {[
                { t: "إعداد يدوي مخصص", d: "فريقنا يقوم بضبط كل التفاصيل التقنية لضمان أعلى جودة." },
                { t: "دعم فني متميز", d: "مدير حساب مخصص لمتابعة أداء المساعد معك بشكل دوري." }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-6 w-6 rounded-full bg-[#FCBD05] flex-shrink-0 flex items-center justify-center text-[10px] mt-1">✓</div>
                  <div>
                    <h4 className="font-bold text-slate-950">{item.t}</h4>
                    <p className="text-slate-600 text-sm">{item.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap gap-4">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-2xl bg-[#011F91] px-8 py-4 font-bold text-white shadow-xl transition-all hover:scale-[1.02]"
              >
                تواصل مع المبيعات
                <span className="text-xl">←</span>
              </a>
              <Link
                href="/support"
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-8 py-4 font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                مركز المساعدة
              </Link>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 lg:p-10 shadow-sm transition-all hover:shadow-xl">
               <h3 className="text-2xl font-black text-slate-950 mb-4">سياسة الأعمال</h3>
               <p className="text-slate-600 leading-relaxed mb-6">
                 خدمة نِحجز مخصصة حصراً للأنشطة التجارية المسجلة (B2B). نحن نؤمن بأن الجودة تتطلب تركيزاً تاماً على احتياجات قطاع الأعمال.
               </p>
               <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-2xl">🏛️</span>
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">يتطلب سجل تجاري ساري</div>
               </div>
            </div>
            
            <div className="rounded-[2.5rem] border border-slate-950 bg-slate-950 p-8 lg:p-10 text-white relative overflow-hidden">
               <div className="relative z-10">
                 <h3 className="text-2xl font-bold mb-4">لماذا الإعداد اليدوي؟</h3>
                 <p className="text-slate-400 leading-relaxed">
                   لأن الذكاء الاصطناعي يحتاج إلى توجيه دقيق. نحن نضمن أن المساعد يرد بلهجتك السعودية الطبيعية ويتبع سياسات متجرك حرفياً.
                 </p>
               </div>
               <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-slate-50 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-950 sm:text-5xl tracking-tight mb-4">
              تسأل، <span className="text-[#011F91]">نجاوب</span>
            </h2>
            <p className="text-lg text-slate-600">كل ما تحتاج معرفته عن منصة نِحجز</p>
          </div>
          
          <div className="grid gap-4">
            {FAQ.map((f) => (
              <div
                key={f.q}
                className="group rounded-[2rem] border border-slate-200 bg-white p-6 lg:p-8 transition-all hover:border-[#011F91]/30 hover:shadow-lg"
              >
                <div className="flex justify-between items-start gap-4">
                  <h3 className="text-lg lg:text-xl font-bold text-slate-950">{f.q}</h3>
                  <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#011F91]/5 transition-colors">
                    <span className="text-[#011F91] font-bold">+</span>
                  </div>
                </div>
                <p className="mt-4 text-slate-600 leading-relaxed max-w-3xl">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <div className="relative overflow-hidden rounded-[3rem] bg-[#011F91] p-10 sm:p-20 text-center text-white shadow-2xl">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(252,189,5,0.2),transparent_50%)] pointer-events-none" />
          <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.627 0l.83.83L1.457 55.457l-.83-.83L54.627 0zm-53.17 0l.83.83L59.285 55.457l-.83-.83L1.457 0z' fill='%23ffffff' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")` }} />
          
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-4xl font-black sm:text-6xl tracking-tight mb-6 [text-wrap:balance]">
              جاهز لتغيير طريقة تواصلك <br /> مع عملائك؟
            </h2>
            <p className="text-xl text-white/70 leading-relaxed mb-10">
              انضم إلى عشرات المتاجر التي وفرت آلاف ساعات العمل اليدوي باستخدام نِحجز. نركّب لك كل شيء خلال 24 ساعة.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-10 py-5 font-bold text-[#011F91] shadow-xl transition-all hover:bg-[#FCBD05] hover:text-[#011F91] hover:scale-105"
              >
                اطلب تجربة حية الآن
                <span className="text-2xl">←</span>
              </a>
              <div className="text-sm font-bold text-white/50">بدون تعقيدات تقنية • دعم فني 24/7</div>
            </div>
          </div>
          
          <div className="absolute top-10 left-10 text-6xl opacity-10 hidden lg:block">💬</div>
          <div className="absolute bottom-10 right-10 text-6xl opacity-10 hidden lg:block">⚡</div>
        </div>
      </section>
    </>
  );
}