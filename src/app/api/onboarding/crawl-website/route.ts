import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import {
  RestaurantWebsiteCrawlResponse,
  RestaurantWebsitePrefill,
} from "@/lib/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const COUNTRY_CURRENCY: Record<string, string> = {
  EG: "EGP",
  SA: "SAR",
  AE: "AED",
  KW: "KWD",
};

const SUPPORTED_COUNTRIES = new Set(["EG", "SA", "AE", "KW"]);

// All schema.org types that represent a business, service provider, or product seller
const BUSINESS_SCHEMA_TYPES = new Set([
  "organization",
  "localbusiness",
  "restaurant",
  "foodestablishment",
  "store",
  "hotel",
  "lodgingbusiness",
  "healthandbeautybusiness",
  "professionalservice",
  "financialservice",
  "legalservice",
  "medicalorganization",
  "educationalorganization",
  "sportsorganization",
  "entertainmentbusiness",
  "travelagency",
  "automotivebusiness",
  "realestate",
  "homegoodsstore",
  "clothingstore",
  "electronicsstore",
  "bookstore",
  "pharmacyordrugstore",
  "beautysalon",
  "hairsalon",
  "gym",
  "sportsactivitylocation",
  "dentist",
  "physician",
  "hospital",
  "accountingservice",
  "insuranceagency",
  "movingcompany",
  "plumber",
  "electrician",
  "generalcontractor",
  "itservice",
  "softwareapplication",
  "product",
  "service",
]);

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isSafeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "metadata.google.internal",
      "169.254.169.254",
    ];

    if (blocked.includes(hostname)) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return {
      html: await response.text(),
      finalUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonValue(value: string): unknown[] {
  const raw = cleanText(value);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function flattenStructuredData(input: unknown): Record<string, unknown>[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(flattenStructuredData);
  }

  const record = input as Record<string, unknown>;
  const graph = record["@graph"];

  return [record, ...flattenStructuredData(graph)];
}

function hasBusinessType(node: Record<string, unknown>): boolean {
  const typeValue = node["@type"];
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  return types.some((item) => {
    if (typeof item !== "string") return false;
    return BUSINESS_SCHEMA_TYPES.has(item.toLowerCase().replace(/\s+/g, ""));
  });
}

function findBusinessSchema($: ReturnType<typeof load>): Record<string, unknown> | null {
  const scripts = $('script[type="application/ld+json"]')
    .map((_index, element) => $(element).contents().text())
    .get();

  const nodes = scripts
    .flatMap((script) => parseJsonValue(script))
    .flatMap((item) => flattenStructuredData(item));

  // Prefer specific business types over generic Organization
  const specific = nodes.find((n) => {
    const t = getString(n["@type"])?.toLowerCase() ?? "";
    return t !== "organization" && hasBusinessType(n);
  });

  return specific ?? nodes.find(hasBusinessType) ?? null;
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    return cleaned || undefined;
  }

  return undefined;
}

function getUrl(value: unknown, baseUrl: string): string | undefined {
  if (typeof value === "string") {
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  if (value && typeof value === "object" && "url" in value) {
    return getUrl((value as { url?: unknown }).url, baseUrl);
  }

  return undefined;
}

function getCountryCode(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  const mappings: Array<[string, string]> = [
    ["egypt", "EG"],
    [" مصر", "EG"],
    ["saudi", "SA"],
    ["saudi arabia", "SA"],
    ["السعود", "SA"],
    ["uae", "AE"],
    ["united arab emirates", "AE"],
    ["الإمارات", "AE"],
    ["kuwait", "KW"],
    ["الكويت", "KW"],
  ];

  for (const [needle, country] of mappings) {
    if (normalized.includes(needle.trim().toLowerCase())) {
      return country;
    }
  }

  const upper = value.trim().toUpperCase();
  return SUPPORTED_COUNTRIES.has(upper) ? upper : undefined;
}

function inferCountry(params: {
  schema: Record<string, unknown> | null;
  bodyText: string;
  finalUrl: string;
}): string | undefined {
  const schemaCountry = getCountryCode(
    getString(
      (params.schema?.address as { addressCountry?: unknown } | undefined)
        ?.addressCountry
    )
  );

  if (schemaCountry) return schemaCountry;

  const telephone = getString(params.schema?.telephone);
  if (telephone?.startsWith("+20")) return "EG";
  if (telephone?.startsWith("+966")) return "SA";
  if (telephone?.startsWith("+971")) return "AE";
  if (telephone?.startsWith("+965")) return "KW";

  const body = params.bodyText.toLowerCase();
  if (body.includes("riyadh") || body.includes("jeddah") || body.includes("ksa")) return "SA";
  if (body.includes("cairo") || body.includes("alexandria")) return "EG";
  if (body.includes("dubai") || body.includes("abu dhabi")) return "AE";
  if (body.includes("kuwait city")) return "KW";

  const hostname = new URL(params.finalUrl).hostname.toLowerCase();
  if (hostname.endsWith(".sa")) return "SA";
  if (hostname.endsWith(".eg")) return "EG";
  if (hostname.endsWith(".ae")) return "AE";
  if (hostname.endsWith(".kw")) return "KW";

  return undefined;
}

function inferCurrency(bodyText: string, country?: string): string | undefined {
  const lower = bodyText.toLowerCase();

  if (lower.includes("egp") || lower.includes(" جنيه") || lower.includes("جنيه")) return "EGP";
  if (lower.includes("sar") || lower.includes("riyal") || lower.includes("ر.س") || lower.includes("﷼")) return "SAR";
  if (lower.includes("aed") || lower.includes("dirham") || lower.includes("درهم")) return "AED";
  if (lower.includes("kwd") || lower.includes(" kd") || lower.includes("دينار كويتي")) return "KWD";

  return country ? COUNTRY_CURRENCY[country] : undefined;
}

function detectLanguage(bodyText: string): "ar" | "auto" {
  const sample = bodyText.slice(0, 4000);
  const arabicMatches = sample.match(/[\u0600-\u06FF]/g) ?? [];
  return arabicMatches.length >= 40 ? "ar" : "auto";
}

/**
 * Infer a human-readable business category from the schema type and known properties.
 * Works for any business type, not just restaurants.
 */
function inferBusinessCategory(schema: Record<string, unknown> | null): string | undefined {
  if (!schema) return undefined;

  // servesCuisine for food, serviceType for services, knowsAbout, etc.
  const direct =
    getString(schema.servesCuisine) ||
    getString(schema.serviceType) ||
    getString(schema.knowsAbout) ||
    getString(schema.additionalType);
  if (direct) return direct;

  // Fall back to a humanised @type label
  const rawType = getString(schema["@type"]);
  if (!rawType) return undefined;

  // CamelCase → "Camel Case"
  return rawType
    .replace(/([A-Z])/g, " $1")
    .replace(/\bAnd\b/g, "and")
    .trim();
}

function inferMenuOrCatalogUrl(
  $: ReturnType<typeof load>,
  schema: Record<string, unknown> | null,
  baseUrl: string
): string | undefined {
  // schema.org: hasMenu (food), hasOfferCatalog (general)
  const schemaUrl =
    getUrl(schema?.hasMenu, baseUrl) ||
    getUrl(schema?.menu, baseUrl) ||
    getUrl(schema?.hasOfferCatalog, baseUrl);
  if (schemaUrl) return schemaUrl;

  // Link text patterns covering food, products, and services
  const menuPatterns = [
    "menu", "المنيو", "القائمة",
    "catalog", "catalogue", "كتالوج",
    "products", "منتجات",
    "services", "خدمات",
    "packages", "باقات",
    "pricing", "أسعار",
    "shop", "store",
  ];

  const relPatterns = [
    "/menu", "/menus", "/food-menu",
    "/catalog", "/catalogue",
    "/products", "/services",
    "/packages", "/pricing",
    "/shop", "/store",
  ];

  const anchorHref = $("a[href]")
    .map((_index, element) => ({
      href: $(element).attr("href"),
      text: cleanText($(element).text()).toLowerCase(),
      aria: cleanText($(element).attr("aria-label")).toLowerCase(),
    }))
    .get()
    .find((item) => {
      const href = item.href?.toLowerCase() ?? "";
      return (
        menuPatterns.some((p) => item.text.includes(p) || item.aria.includes(p)) ||
        relPatterns.some((p) => href.includes(p))
      );
    })?.href;

  if (!anchorHref) return undefined;

  try {
    return new URL(anchorHref, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function sanitizeTitle(title: string): string | undefined {
  const cleaned = cleanText(title);
  if (!cleaned) return undefined;

  const parts = cleaned
    .split(/\s[\-|•|·]\s| \| /)
    .map((part) => cleanText(part))
    .filter(Boolean);

  return parts[0] || cleaned;
}

function extractLogoUrl(
  $: ReturnType<typeof load>,
  schema: Record<string, unknown> | null,
  baseUrl: string
): string | undefined {
  const schemaLogo =
    getUrl(schema?.logo, baseUrl) || getUrl(schema?.image, baseUrl);
  if (schemaLogo) return schemaLogo;

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    try { return new URL(ogImage, baseUrl).toString(); } catch { /* skip */ }
  }

  const appleIcon =
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="apple-touch-icon-precomposed"]').attr("href");
  if (appleIcon) {
    try { return new URL(appleIcon, baseUrl).toString(); } catch { /* skip */ }
  }

  const faviconLink =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href");
  if (faviconLink) {
    try { return new URL(faviconLink, baseUrl).toString(); } catch { /* skip */ }
  }

  try {
    return `${new URL(baseUrl).origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function extractTelephone(
  $: ReturnType<typeof load>,
  schema: Record<string, unknown> | null
): string | undefined {
  const schemaTel = getString(schema?.telephone);
  if (schemaTel) return schemaTel;

  const telLink = $('a[href^="tel:"]').first().attr("href");
  if (telLink) {
    return cleanText(telLink.replace(/^tel:/, "")) || undefined;
  }

  return undefined;
}

function extractOpeningHours(schema: Record<string, unknown> | null): string | undefined {
  const hours = schema?.openingHours;
  if (!hours) return undefined;

  if (typeof hours === "string") return cleanText(hours) || undefined;

  if (Array.isArray(hours)) {
    const items = hours
      .map((h) => (typeof h === "string" ? cleanText(h) : null))
      .filter(Boolean);
    return items.length > 0 ? items.join(", ") : undefined;
  }

  return undefined;
}

function extractAddress(schema: Record<string, unknown> | null): string | undefined {
  const address = schema?.address;
  if (!address || typeof address !== "object") return undefined;

  const addr = address as Record<string, unknown>;
  const parts = [
    getString(addr.streetAddress),
    getString(addr.addressLocality),
    getString(addr.addressRegion),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildAgentInstructions(params: {
  name: string | undefined;
  description: string | undefined;
  businessCategory: string | undefined;
  telephone: string | undefined;
  openingHours: string | undefined;
  address: string | undefined;
}): string | undefined {
  if (!params.name && !params.description) return undefined;

  const lines = [
    `You are the WhatsApp assistant for ${params.name || "this business"}.`,
    "Answer only questions relevant to this business — its services, products, pricing, hours, and policies.",
    "Be concise, helpful, and friendly. Always use the information provided as the source of truth.",
  ];

  if (params.description) lines.push(`About: ${params.description}`);
  if (params.businessCategory) lines.push(`Business type: ${params.businessCategory}.`);
  if (params.openingHours) lines.push(`Hours: ${params.openingHours}.`);
  if (params.telephone) lines.push(`Contact phone: ${params.telephone}.`);
  if (params.address) lines.push(`Location: ${params.address}.`);

  return lines.join(" ");
}

function extractPrefill(html: string, finalUrl: string): RestaurantWebsiteCrawlResponse {
  const $ = load(html);
  const schema = findBusinessSchema($);
  const title = sanitizeTitle($("title").first().text());
  const metaDescription = cleanText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content")
  );
  const ogSiteName = cleanText(
    $('meta[property="og:site_name"]').attr("content") ||
      $('meta[name="application-name"]').attr("content")
  );
  const h1 = cleanText($("h1").first().text());
  const bodyText = cleanText($("body").text());

  const schemaName = getString(schema?.name);
  const schemaDescription = getString(schema?.description);
  const businessName = schemaName || ogSiteName || h1 || title || undefined;
  const country = inferCountry({ schema, bodyText, finalUrl });
  const currency = inferCurrency(
    [metaDescription, schemaDescription, bodyText].filter(Boolean).join(" "),
    country
  );
  const menuUrl = inferMenuOrCatalogUrl($, schema, finalUrl);
  const language = detectLanguage(bodyText);
  const logoUrl = extractLogoUrl($, schema, finalUrl);
  const telephone = extractTelephone($, schema);
  const openingHours = extractOpeningHours(schema);
  const businessCategory = inferBusinessCategory(schema);
  const address = extractAddress(schema);

  const prefill: RestaurantWebsitePrefill = {
    websiteUrl: finalUrl,
    restaurantName: businessName,
    displayName: businessName,
    menuUrl,
    country,
    currency,
    language,
    logoUrl,
    telephone,
    openingHours,
    businessCategory,
    address,
    agentInstructions: buildAgentInstructions({
      name: businessName,
      description: schemaDescription || metaDescription || undefined,
      businessCategory,
      telephone,
      openingHours,
      address,
    }),
  };

  const summary = [
    businessName ? `Detected name: ${businessName}` : null,
    businessCategory ? `Business type: ${businessCategory}` : null,
    metaDescription ? `Description: ${metaDescription}` : null,
    menuUrl ? `Found catalog/menu URL: ${menuUrl}` : null,
    telephone ? `Business contact phone: ${telephone}` : null,
    openingHours ? `Hours: ${openingHours}` : null,
    address ? `Location: ${address}` : null,
    country ? `Country: ${country}` : null,
    currency ? `Currency: ${currency}` : null,
    logoUrl ? `Logo detected` : null,
  ].filter((item): item is string => Boolean(item));

  const importedFields = Object.entries(prefill)
    .filter(([key, value]) => key !== "websiteUrl" && Boolean(value))
    .map(([key]) => key);

  return { prefill, summary, importedFields };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(`onboarding-crawl:${user.id}`, RATE_LIMITS.menuCrawl);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as { url?: string };
    const url = cleanText(body.url);

    if (!url) {
      return NextResponse.json({ error: "Website URL is required." }, { status: 400 });
    }

    if (!isSafeUrl(url)) {
      return NextResponse.json({ error: "Invalid or blocked URL." }, { status: 400 });
    }

    const { html, finalUrl } = await fetchHtml(url);
    const result = extractPrefill(html, finalUrl);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to crawl website.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
