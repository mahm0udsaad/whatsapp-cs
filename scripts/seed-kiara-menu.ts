/**
 * Seed Kiara's menu_items from the Rekaz dashboard fixtures.
 *
 * Source: fixtures/rekaz/kiara/products_v2.json (79 services) +
 *         fixtures/rekaz/kiara/product_categories.json (13 categories with
 *         nested product references).
 *
 * Target: public.menu_items rows for the Kiara restaurant_id.
 *
 * Mapping (Rekaz product → menu_items column):
 *   id                              → (not stored; Supabase generates a new uuid)
 *   name / localizedName.ar         → name_ar (NOT NULL)
 *   description                     → description_ar (HTML stripped)
 *   amount                          → price (NOT NULL)
 *   discountedAmount > 0            → discounted_price
 *   currency                        → 'SAR' (Kiara is Saudi)
 *   <category from product_categories.json> → category (NOT NULL)
 *   typeString                      → subcategory (e.g. "Reservation", "Subscription", "Gift", "Merchandise")
 *   images[0]                       → image_url
 *   true                            → is_available (Rekaz exposes no inactive flag in this dump)
 *   index                           → sort_order
 *
 * Behavior: WIPES every existing menu_items row for Kiara, then inserts.
 *
 * Usage:
 *   npm run seed:kiara-menu
 *   npm run seed:kiara-menu -- --dry-run
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const KIARA_RESTAURANT_ID = "2ba8f6c8-aff9-4147-8f13-cdcb732de698";
const REPO_ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(REPO_ROOT, "fixtures/rekaz/kiara/products_v2.json");
const CATEGORIES_PATH = path.join(REPO_ROOT, "fixtures/rekaz/kiara/product_categories.json");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RekazProduct {
  id: string;
  name?: string;
  localizedName?: { OtherLanguages?: { ar?: string; en?: string } };
  description?: string;
  shortDescription?: string;
  amount?: number;
  discountedAmount?: number | null;
  duration?: number;
  images?: string[];
  featuredImage?: string;
  typeString?: string;
}

interface RekazCategory {
  id: string;
  name?: string;
  localizedName?: { OtherLanguages?: { ar?: string; en?: string } };
  isVisible?: boolean;
  order?: number;
  products?: Array<{ id: string }>;
}

interface MenuItemRow {
  restaurant_id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  price: number;
  discounted_price: number | null;
  currency: string;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  crawled_at: string;
}

/**
 * Strip HTML tags + collapse whitespace from a Rekaz description.
 * Rekaz stores descriptions as `<p>...</p>` blocks with inline `<span>`,
 * `<b>`, `<br>`. We want plain Arabic text the AI prompt can read.
 */
function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function pickName(p: RekazProduct): string {
  const ar =
    p.localizedName?.OtherLanguages?.ar?.trim() ||
    (p.name ?? "").trim();
  return ar || "خدمة";
}

function pickEnglish(p: RekazProduct): string | null {
  const en = p.localizedName?.OtherLanguages?.en?.trim();
  return en || null;
}

function buildCategoryMap(categories: RekazCategory[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const cat of categories) {
    const catName =
      cat.localizedName?.OtherLanguages?.ar?.trim() ||
      (cat.name ?? "").trim() ||
      "خدمات أخرى";
    for (const p of cat.products ?? []) {
      // First-write-wins so a product that appears in multiple categories
      // gets pinned to the first (lowest `order`) one.
      if (!m.has(p.id)) m.set(p.id, catName);
    }
  }
  return m;
}

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(PRODUCTS_PATH)) {
    console.error(`Missing fixture: ${PRODUCTS_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(CATEGORIES_PATH)) {
    console.error(`Missing fixture: ${CATEGORIES_PATH}`);
    process.exit(1);
  }

  const productsRaw = loadJson<{ items?: RekazProduct[] } | RekazProduct[]>(
    PRODUCTS_PATH
  );
  const products: RekazProduct[] = Array.isArray(productsRaw)
    ? productsRaw
    : productsRaw.items ?? [];

  const categoriesRaw = loadJson<{ items?: RekazCategory[] } | RekazCategory[]>(
    CATEGORIES_PATH
  );
  const categories: RekazCategory[] = Array.isArray(categoriesRaw)
    ? categoriesRaw
    : categoriesRaw.items ?? [];

  const categoryByProductId = buildCategoryMap(categories);

  const now = new Date().toISOString();

  const rows: MenuItemRow[] = products.map((p, idx) => {
    const nameAr = pickName(p);
    const nameEn = pickEnglish(p);
    const descAr = stripHtml(p.description) ?? stripHtml(p.shortDescription);
    const price = typeof p.amount === "number" ? p.amount : 0;
    // Rekaz returns discountedAmount === amount when there is no actual
    // discount on the product — only persist a discount if it's strictly less.
    const discounted =
      typeof p.discountedAmount === "number" &&
      p.discountedAmount > 0 &&
      p.discountedAmount < price
        ? p.discountedAmount
        : null;
    const image = p.images?.[0] || p.featuredImage || null;
    return {
      restaurant_id: KIARA_RESTAURANT_ID,
      name_ar: nameAr,
      name_en: nameEn,
      description_ar: descAr,
      description_en: null,
      price,
      discounted_price: discounted,
      currency: "SAR",
      category: categoryByProductId.get(p.id) ?? "خدمات أخرى",
      subcategory: p.typeString ?? null,
      image_url: image,
      is_available: true,
      sort_order: idx,
      crawled_at: now,
    };
  });

  console.log(`📋 Mapped ${rows.length} products → menu_items rows`);
  const grouped = rows.reduce<Record<string, number>>((m, r) => {
    m[r.category] = (m[r.category] ?? 0) + 1;
    return m;
  }, {});
  console.log("📊 Category breakdown:");
  for (const [cat, n] of Object.entries(grouped).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${n.toString().padStart(3)}× ${cat}`);
  }

  if (dryRun) {
    console.log("\n🔎 DRY RUN — no DB writes. Sample row:");
    console.log(JSON.stringify(rows[0], null, 2));
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log("\n🗑️  Wiping existing menu_items for Kiara…");
  const { error: delErr } = await supabase
    .from("menu_items")
    .delete()
    .eq("restaurant_id", KIARA_RESTAURANT_ID);
  if (delErr) {
    console.error(`Delete failed: ${delErr.message}`);
    process.exit(1);
  }

  console.log(`💾 Inserting ${rows.length} rows…`);
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("menu_items").insert(slice);
    if (error) {
      console.error(`Insert batch ${i / BATCH + 1} failed: ${error.message}`);
      process.exit(1);
    }
    process.stdout.write(
      `\r  Inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`
    );
  }
  process.stdout.write("\n");
  console.log("✅ Done");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
