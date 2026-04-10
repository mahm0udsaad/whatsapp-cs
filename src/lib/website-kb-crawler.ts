import { load } from "cheerio";

const MAX_ENTRIES = 30;
const MAX_ENTRIES_MULTI = 100;
const MAX_PAGES = 10;
const MIN_CONTENT_LENGTH = 60;
const MAX_CONTENT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Rekaz platform extractor
// Rekaz pages embed all data in a TanStack Router hydration script as inline
// JS objects. We extract service records and business settings from it.
// ---------------------------------------------------------------------------

function isRekazPage(html: string): boolean {
  return html.includes("window.__TENANT__") || html.includes("rekaz.io");
}

/**
 * Cleans HTML markup that leaks into Rekaz description fields.
 * The hydration script stores HTML as hex-escaped strings (\x3Cp>, \x3Cspan>, etc.)
 * and may also contain Windows carriage returns encoded as _x000d_.
 */
function cleanRekazDescription(text: string): string {
  if (!text) return "";
  let t = text
    // Unescape hex-encoded HTML tags (\x3C = <, \x3E = >)
    .replace(/\\x3C/gi, "<")
    .replace(/\\x3E/gi, ">")
    .replace(/\\x26/gi, "&")
    .replace(/\\x22/gi, '"')
    .replace(/\\x27/gi, "'")
    // Strip all HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Remove Windows carriage return encoding
    .replace(/_x000d_/gi, "\n")
    // Remove leftover literal \n escape sequences from JS strings
    .replace(/\\n/g, "\n")
    // Collapse excessive whitespace
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

function extractRekazSettings(html: string): Record<string, string> {
  const settings: Record<string, string> = {};
  // Matches: key:"Platform.X.Y",value:"Z"
  const kv = /key:"(Platform\.[^"]+)",value:"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = kv.exec(html)) !== null) settings[m[1]] = m[2];
  return settings;
}

function rekazCategory(name: string): string {
  // Massage — check before nails/hair to avoid false matches
  if (/مساج|تدليك|massage/i.test(name)) return "Massage Services";
  // Nails — both Arabic spellings of pedicure/manicure, plus أظافر with and without hamza
  if (/مناكير|باديكير|بديكير|أظافر|اظافر|nail|pedicure|manicure/i.test(name)) return "Nails & Foot Care";
  // Hair — treatments, bond repair, blowout, haircut, scalp, detox, extensions
  if (/شعر|كيراتين|تريتمنت|ترميم|روابط|استشوار|فروه|فروة|ديتوكس|اكستنشن|hair|keratin|treatment|blowout/i.test(name)) return "Hair Treatments";
  // Waxing — Arabic واكس is common alongside شمع
  if (/شمع|واكس|wax/i.test(name)) return "Waxing";
  // Facial & skin — بشره (without taa marbuta diacritic) is a common alternate spelling
  if (/وجه|بشرة|بشره|حواجب|تنظيف البشر|facial|eyebrow/i.test(name)) return "Facial & Skin";
  // Body treatments — برافين is the common Arabised spelling, not بارافين
  if (/برافين|بارافين|حمام|سكراب|paraffin|scrub/i.test(name)) return "Body Treatments";
  // Packages & bundles
  if (/باقة|بكج|بكـج|كبلز|package|bundle/i.test(name)) return "Packages";
  if (/حجامة|cupping/i.test(name)) return "Cupping";
  return "Other Services";
}

function extractRekazEntries(html: string): KBEntry[] {
  const entries: KBEntry[] = [];

  // 1. Business info from platform settings
  const s = extractRekazSettings(html);
  const bizName = s["Platform.Invoice.BrandName"] || s["Platform.Invoice.CommercialName"] || "";
  const arabicName = s["Platform.Invoice.CommercialName"] || "";
  const phone = s["Platform.Contact.MobileNumber"] || s["Platform.Contact.Whatsapp"] || "";
  const city = s["Platform.Contact.City"] || "";
  const country = s["Platform.Contact.Country"] || "";
  const instagram = s["Platform.Contact.Instagram"] || "";
  const banner = s["Platform.Banner.Text"] || "";

  if (bizName) {
    const parts: string[] = [`Business: ${bizName}`];
    if (arabicName && arabicName !== bizName) parts.push(`Arabic name: ${arabicName}`);
    if (phone) parts.push(`Phone / WhatsApp: +${phone}`);
    if (city || country) parts.push(`Location: ${[city, country].filter(Boolean).join(", ")}`);
    if (instagram) parts.push(`Instagram: ${instagram}`);
    if (banner) parts.push(`Note: ${banner}`);
    entries.push({ title: "Business Information", content: parts.join("\n"), section: "about" });
  }

  // 2. Services — pattern: name:"...", ..., amount:N,duration:N (they appear adjacent in Rekaz)
  interface Svc { name: string; description: string; amount: number; duration: number }
  const services: Svc[] = [];
  const seen = new Set<string>();
  const nameRe = /\bname:"([^"]{2,150})"/g;
  let m: RegExpExecArray | null;

  while ((m = nameRe.exec(html)) !== null) {
    const rawName = m[1];
    // Look ahead up to 1500 chars but stay within the same service object.
    // In Rekaz hydration, amount and duration always appear together: amount:N,duration:N
    const ahead = html.slice(m.index, m.index + 1500);

    // Find amount:N,duration:N as a pair (they are always adjacent in Rekaz output)
    const pairM = /\bamount:(\d+(?:\.\d+)?),duration:(\d+)\b/.exec(ahead);
    if (!pairM) continue;

    const amount = parseFloat(pairM[1]);
    const duration = parseInt(pairM[2]);

    // Sanity check: duration > 480 min (8h) is definitely a wrong field match
    if (duration > 480) continue;

    // Ensure the amount:duration pair appears before the next service name boundary
    const nextName = ahead.indexOf('name:"', 1);
    if (nextName !== -1 && pairM.index > nextName) continue;

    const cleanName = rawName.replace(/^[-\s]+/, "").replace(/[\u{1F300}-\u{1FFFF}]/gu, "").trim();
    if (!cleanName || seen.has(cleanName.toLowerCase())) continue;
    seen.add(cleanName.toLowerCase());

    // Extract description (appears before amount: in the object)
    const descM = /\bdescription:"([^"]{5,})"/.exec(ahead);
    const rawDesc = descM?.[1] || "";

    services.push({
      name: cleanName,
      description: cleanRekazDescription(rawDesc),
      amount,
      duration,
    });
  }

  // 3. Group services by category
  const byCategory = new Map<string, Svc[]>();
  for (const svc of services) {
    const cat = rekazCategory(svc.name);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(svc);
  }

  for (const [cat, items] of byCategory) {
    const lines = items.map((svc) => {
      let line = `• ${svc.name}: ${svc.amount} SAR`;
      if (svc.duration > 0) line += ` (${svc.duration} min)`;
      if (svc.description) line += `\n  ${svc.description}`;
      return line;
    });
    entries.push({ title: cat, content: lines.join("\n"), section: "services" });
  }

  return entries;
}

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

/**
 * Extracts all same-domain links from a fetched page.
 */
function extractInternalLinks(
  $: ReturnType<typeof load>,
  baseUrl: string
): string[] {
  const base = new URL(baseUrl);
  const links: string[] = [];

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    try {
      const url = new URL(href, baseUrl);
      if (url.hostname !== base.hostname) return;
      // Skip asset/non-content URLs
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|ico|xml|json|zip|mp4|mp3)$/i.test(url.pathname)) return;
      url.hash = "";
      url.search = "";
      const normalized = url.toString().replace(/\/$/, "") || base.origin;
      links.push(normalized);
    } catch {
      // invalid url
    }
  });

  return [...new Set(links)];
}

/**
 * Fetches a single page and extracts KB entries from it.
 * Returns the entries plus internal links discovered on the page.
 */
async function crawlSinglePage(
  url: string,
  restaurantId: string
): Promise<{ entries: WebsiteKBEntry[]; links: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });
    if (!response.ok) return { entries: [], links: [] };
    html = await response.text();
  } catch {
    return { entries: [], links: [] };
  } finally {
    clearTimeout(timeout);
  }

  const $ = load(html);
  const links = extractInternalLinks($, url);

  // Use Rekaz-specific extractor when applicable — it parses the hydration
  // script directly for structured service + settings data.
  let raw: KBEntry[];
  if (isRekazPage(html)) {
    raw = extractRekazEntries(html);
  } else {
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

    raw = [
      ...(aboutFallback ? [aboutFallback] : []),
      ...headingSections,
      ...faqs,
      ...featureLists,
    ];
  }

  const seen = new Set<string>();
  const deduped = raw.filter((entry) => {
    const key = entry.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = new Date().toISOString();
  const entries: WebsiteKBEntry[] = deduped.slice(0, 20).map((entry) => ({
    restaurant_id: restaurantId,
    title: entry.title,
    content: entry.content,
    source_type: "crawled",
    metadata: { section: entry.section, source_url: url },
    created_at: now,
    updated_at: now,
  }));

  return { entries, links };
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

  // Use Rekaz-specific extractor when applicable
  let raw: KBEntry[];
  if (isRekazPage(html)) {
    raw = extractRekazEntries(html);
  } else {
    const $ = load(html);
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
    raw = [
      ...(aboutFallback ? [aboutFallback] : []),
      ...headingSections,
      ...faqs,
      ...featureLists,
    ];
  }

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
    source_type: "crawled",
    metadata: { section: entry.section, source_url: websiteUrl },
    created_at: now,
    updated_at: now,
  }));
}

/**
 * Crawls up to MAX_PAGES internal pages of a website, starting from
 * websiteUrl. Extracts and deduplicates knowledge base entries across
 * all pages, returning up to MAX_ENTRIES_MULTI entries total.
 */
export async function crawlWebsiteMultiPage(
  websiteUrl: string,
  restaurantId: string
): Promise<{ entries: WebsiteKBEntry[]; pagesCrawled: number }> {
  const visited = new Set<string>();
  const queue: string[] = [];
  const allEntries: WebsiteKBEntry[] = [];
  const globalSeenTitles = new Set<string>();

  // Normalize the seed URL
  try {
    const seed = new URL(websiteUrl);
    seed.hash = "";
    seed.search = "";
    queue.push(seed.toString().replace(/\/$/, "") || seed.origin);
  } catch {
    return { entries: [], pagesCrawled: 0 };
  }

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const { entries, links } = await crawlSinglePage(url, restaurantId);

    // Add entries, skipping cross-page title duplicates
    for (const entry of entries) {
      const titleKey = entry.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
      if (globalSeenTitles.has(titleKey)) continue;
      globalSeenTitles.add(titleKey);
      allEntries.push(entry);
      if (allEntries.length >= MAX_ENTRIES_MULTI) break;
    }

    if (allEntries.length >= MAX_ENTRIES_MULTI) break;

    // Enqueue unvisited internal links
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }
  }

  return { entries: allEntries.slice(0, MAX_ENTRIES_MULTI), pagesCrawled: visited.size };
}
