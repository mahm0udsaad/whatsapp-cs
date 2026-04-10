import { load } from "cheerio";

const MAX_ENTRIES = 30;
const MIN_CONTENT_LENGTH = 60;
const MAX_CONTENT_LENGTH = 2000;

// Section classifiers — broad enough to cover any business type
const SECTION_KEYWORDS: Record<string, string[]> = {
  about: [
    "about", "who we are", "our story", "our mission", "our vision",
    "history", "background", "overview", "introduction", "company",
    "عن", "من نحن", "قصتنا", "رؤيتنا", "رسالتنا", "نبذة",
  ],
  services: [
    "service", "what we do", "what we offer", "solutions", "capabilities",
    "expertise", "specialties", "offerings", "how we help",
    "خدمات", "ما نقدمه", "حلول", "تخصصات",
  ],
  products: [
    "product", "item", "collection", "catalogue", "catalog",
    "inventory", "range", "selection", "shop",
    "منتج", "منتجات", "مجموعة", "كتالوج",
  ],
  pricing: [
    "price", "pricing", "plan", "package", "subscription", "cost",
    "rate", "fee", "tariff", "quote", "estimate",
    "سعر", "أسعار", "باقة", "باقات", "اشتراك", "تكلفة",
  ],
  faq: [
    "faq", "frequently asked", "common question", "questions & answers",
    "q&a", "help", "support",
    "أسئلة", "أسئلة شائعة", "مساعدة", "دعم",
  ],
  process: [
    "how it works", "our process", "how we work", "steps",
    "methodology", "approach", "workflow",
    "كيف يعمل", "كيف نعمل", "خطوات", "منهجية",
  ],
  team: [
    "team", "staff", "people", "our experts", "leadership",
    "founders", "meet the",
    "فريق", "موظفون", "خبراء", "قيادة",
  ],
  portfolio: [
    "portfolio", "case study", "case studies", "work", "projects",
    "clients", "success stories", "testimonials", "reviews",
    "أعمال", "مشاريع", "عملاء", "شهادات", "مراجعات",
  ],
  contact: [
    "contact", "find us", "location", "address", "reach us",
    "get in touch", "visit us",
    "تواصل", "موقعنا", "عنواننا", "اتصل",
  ],
  hours: [
    "hours", "opening hours", "working hours", "timing",
    "schedule", "availability", "open",
    "ساعات", "أوقات", "جدول", "متاح",
  ],
  offers: [
    "offer", "deal", "discount", "promotion", "promo", "sale",
    "special", "limited", "coupon",
    "عروض", "تخفيض", "خصم", "تخفيضات", "عرض",
  ],
  policy: [
    "policy", "terms", "conditions", "refund", "return",
    "privacy", "shipping", "delivery", "warranty", "guarantee",
    "سياسة", "شروط", "إرجاع", "ضمان", "توصيل",
  ],
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return text.slice(0, MAX_CONTENT_LENGTH).trimEnd() + "…";
}

function classifySection(heading: string, content: string): string {
  const combined = (heading + " " + content).toLowerCase();

  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return section;
    }
  }

  return "general";
}

interface KBEntry {
  title: string;
  content: string;
  section: string;
}

/**
 * Walks h2/h3 headings and collects the text content under each one
 * until the next heading. Returns one KB entry per heading.
 */
function extractHeadingSections($: ReturnType<typeof load>): KBEntry[] {
  const entries: KBEntry[] = [];

  $("h2, h3").each((_i, el) => {
    const heading = cleanText($(el).text());
    if (!heading || heading.length < 3) return;

    const contentParts: string[] = [];
    let sibling = $(el).next();
    let depth = 0;

    while (sibling.length && depth < 10) {
      const tag = sibling.prop("tagName")?.toLowerCase();
      if (tag === "h1" || tag === "h2" || tag === "h3") break;

      const text = cleanText(sibling.text());
      if (text.length > 20) contentParts.push(text);

      sibling = sibling.next();
      depth++;
    }

    const content = contentParts.join(" ").trim();
    if (content.length < MIN_CONTENT_LENGTH) return;

    entries.push({
      title: heading,
      content: truncate(content),
      section: classifySection(heading, content),
    });
  });

  return entries;
}

/**
 * Extracts FAQ-style content from <dl>/<dt>/<dd> pairs and
 * common accordion/details patterns.
 */
function extractFaqs($: ReturnType<typeof load>): KBEntry[] {
  const entries: KBEntry[] = [];

  // <dl> definition lists
  $("dl").each((_i, dl) => {
    $(dl).find("dt").each((_j, dt) => {
      const question = cleanText($(dt).text());
      const answer = cleanText($(dt).next("dd").text());
      if (question && answer.length >= MIN_CONTENT_LENGTH) {
        entries.push({ title: question, content: truncate(answer), section: "faq" });
      }
    });
  });

  // <details>/<summary> accordions
  $("details").each((_i, el) => {
    const question = cleanText($(el).find("summary").first().text());
    // Remove the summary text from the full text to get just the answer
    const fullText = cleanText($(el).text());
    const answer = cleanText(fullText.replace(question, ""));
    if (question && answer.length >= MIN_CONTENT_LENGTH) {
      entries.push({ title: question, content: truncate(answer), section: "faq" });
    }
  });

  return entries;
}

/**
 * Extracts list items that look like service/product/feature lists —
 * groups under the nearest preceding heading.
 */
function extractFeatureLists($: ReturnType<typeof load>): KBEntry[] {
  const entries: KBEntry[] = [];

  $("ul, ol").each((_i, list) => {
    const items = $(list)
      .find("li")
      .map((_j, li) => cleanText($(li).text()))
      .get()
      .filter((t) => t.length > 5 && t.length < 200);

    if (items.length < 2) return;

    // Find the closest preceding heading
    const prev = $(list).prevAll("h1, h2, h3, h4").first();
    const heading = cleanText(prev.text()) || "Key points";

    const content = items.map((item) => `• ${item}`).join("\n");
    if (content.length < MIN_CONTENT_LENGTH) return;

    entries.push({
      title: heading,
      content: truncate(content),
      section: classifySection(heading, content),
    });
  });

  return entries;
}

/**
 * Fallback: pulls meta description or the first substantial paragraph
 * as a general "About" entry when no heading-based about section exists.
 */
function extractAboutFallback(
  $: ReturnType<typeof load>,
  existingEntries: KBEntry[]
): KBEntry | null {
  const hasAbout = existingEntries.some((e) => e.section === "about");
  if (hasAbout) return null;

  const metaDesc = cleanText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content")
  );
  if (metaDesc.length >= MIN_CONTENT_LENGTH) {
    return { title: "About", content: truncate(metaDesc), section: "about" };
  }

  let fallback: string | null = null;
  $("p").each((_i, el) => {
    if (fallback) return;
    const text = cleanText($(el).text());
    if (text.length >= 100) fallback = text;
  });

  if (fallback) {
    return { title: "About", content: truncate(fallback), section: "about" };
  }

  return null;
}

export interface WebsiteKBEntry {
  restaurant_id: string;
  title: string;
  content: string;
  source_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches a business website and extracts structured knowledge base entries
 * covering all content types: about, services, products, pricing, FAQs,
 * process, team, portfolio, contact, hours, offers, policies, and more.
 *
 * Works for any business type — restaurants, service providers, e-commerce,
 * clinics, agencies, etc.
 *
 * Returns up to MAX_ENTRIES deduplicated entries. Failures are silent so
 * they never block onboarding provisioning.
 */
export async function crawlWebsiteForKnowledgeBase(
  websiteUrl: string,
  restaurantId: string
): Promise<WebsiteKBEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let html: string;
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }

  const $ = load(html);

  // Remove noise before extraction
  $(
    "nav, footer, header, script, style, noscript, " +
    "[class*='cookie'], [class*='banner'], [class*='popup'], " +
    "[id*='cookie'], [id*='banner'], [class*='ad-'], [id*='ad-'], " +
    "[class*='newsletter'], [class*='subscribe']"
  ).remove();

  const headingSections = extractHeadingSections($);
  const faqs = extractFaqs($);
  const featureLists = extractFeatureLists($);
  const aboutFallback = extractAboutFallback($, headingSections);

  const raw: KBEntry[] = [
    ...(aboutFallback ? [aboutFallback] : []),
    ...headingSections,
    ...faqs,
    ...featureLists,
  ];

  // Deduplicate by normalised title (keep first occurrence)
  const seen = new Set<string>();
  const deduped = raw.filter((entry) => {
    const key = entry.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = new Date().toISOString();

  return deduped.slice(0, MAX_ENTRIES).map((entry) => ({
    restaurant_id: restaurantId,
    title: entry.title,
    content: entry.content,
    source_type: "website_crawl",
    metadata: { section: entry.section, source_url: websiteUrl },
    created_at: now,
    updated_at: now,
  }));
}
