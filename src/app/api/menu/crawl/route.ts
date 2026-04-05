import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { MenuItem, MenuCrawlRequest, MenuCrawlResponse } from "@/lib/types";

/**
 * Fetch and parse HTML from URL
 */
async function fetchAndParseUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Failed to fetch URL:", error);
    throw error;
  }
}

/**
 * Extract menu items from HTML using various selectors
 */
function extractMenuItems(
  html: string,
  restaurantId: string
): { items: MenuItem[]; knowledgeBase: string[] } {
  const $ = load(html);
  const items: MenuItem[] = [];
  const knowledgeBaseEntries: string[] = [];

  // Try different selector patterns commonly used for menu items
  const selectors = [
    // Common class names for menu items
    ".menu-item",
    ".menu-product",
    ".product-item",
    ".food-item",
    ".dish",
    ".item",
    "[data-menu-item]",
    "[data-product]",
    ".menu__item",
    ".menu-card",
    ".product-card",
  ];

  const foundSelectors = selectors.filter((sel) => $(sel).length > 0);

  if (foundSelectors.length === 0) {
    console.warn("No menu items found with standard selectors, trying tables");
    // Fallback: try to parse tables
    return extractFromTables($, restaurantId);
  }

  foundSelectors.forEach((selector) => {
    $(selector).each((_index, element) => {
      const item = parseMenuItemElement($, element, restaurantId);
      if (item) {
        items.push(item);
        knowledgeBaseEntries.push(
          `${item.name}${item.description ? " - " + item.description : ""} (${item.price} ${item.currency})`
        );
      }
    });
  });

  return { items, knowledgeBase: knowledgeBaseEntries };
}

/**
 * Parse individual menu item element
 */
function parseMenuItemElement(
  $: ReturnType<typeof load>,
  element: any,
  restaurantId: string
): MenuItem | null {
  const $el = $(element);

  // Try to extract name
  let nameText: string =
    $el.find(".name").text() ||
    $el.find(".title").text() ||
    $el.find("h3").text() ||
    $el.find("h4").text() ||
    $el.text().split(/\n/)[0] ||
    "";

  let name = nameText.trim().substring(0, 200);

  if (!name) {
    return null;
  }

  // Try to extract price
  const priceText =
    $el.find(".price").text() ||
    $el.find("[class*='price']").text() ||
    $el.find("[class*='cost']").text() ||
    $el.text();

  // Extract numbers from price text (handles various formats)
  const priceMatch = priceText.match(/[\d.,]+/);
  const price = priceMatch ? parseFloat(priceMatch[0].replace(",", ".")) : 0;

  if (price <= 0) {
    return null;
  }

  // Try to extract description
  let descText: string =
    $el.find(".description").text() ||
    $el.find(".desc").text() ||
    $el.find("p").text() ||
    "";

  const description = descText.trim().substring(0, 500);

  // Try to extract category
  let catText: string =
    ($el.data("category") as string | undefined) ||
    $el.find("[class*='category']").text() ||
    "General";

  const category = (catText as string).trim() || "General";

  // Try to extract image
  const imageUrl =
    $el.find("img").attr("src") ||
    $el.find("[class*='image']").attr("src") ||
    undefined;

  // Determine currency (default to SAR for Saudi Arabia)
  const currencyMatch = priceText.match(/(?:SR|SAR|﷼|ر\.س|RS|AED|$|€|£)/i);
  const currency = currencyMatch
    ? currencyMatch[0].toUpperCase()
    : "SAR";

  const menuItem: MenuItem = {
    id: `${restaurantId}-${Date.now()}-${Math.random()}`,
    restaurant_id: restaurantId,
    name,
    description: description || undefined,
    price,
    currency,
    category,
    image_url: imageUrl,
    available: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return menuItem;
}

/**
 * Fallback: Extract menu items from HTML tables
 */
function extractFromTables(
  $: ReturnType<typeof load>,
  restaurantId: string
): { items: MenuItem[]; knowledgeBase: string[] } {
  const items: MenuItem[] = [];
  const knowledgeBaseEntries: string[] = [];

  $("table").each((_tableIndex, table) => {
    const $table = $(table);

    $table.find("tr").each((_rowIndex, row) => {
      const $row = $(row);
      const cells = $row.find("td");

      if (cells.length >= 2) {
        const name = $(cells[0]).text().trim().substring(0, 200);
        const priceText = $(cells[cells.length - 1]).text().trim();
        const priceMatch = priceText.match(/[\d.,]+/);
        const price = priceMatch
          ? parseFloat(priceMatch[0].replace(",", "."))
          : 0;

        if (name && price > 0) {
          const menuItem: MenuItem = {
            id: `${restaurantId}-${Date.now()}-${Math.random()}`,
            restaurant_id: restaurantId,
            name,
            price,
            currency: "SAR",
            category: "General",
            available: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          items.push(menuItem);
          knowledgeBaseEntries.push(
            `${menuItem.name} - ${menuItem.price} ${menuItem.currency}`
          );
        }
      }
    });
  });

  return { items, knowledgeBase: knowledgeBaseEntries };
}

/**
 * Save menu items to database
 */
async function saveMenuItems(items: MenuItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const { error } = await adminSupabaseClient
    .from("menu_items")
    .insert(items);

  if (error) {
    console.error("Failed to save menu items:", error);
    throw error;
  }

  return items.length;
}

/**
 * Create knowledge base entries from menu items
 */
async function createKnowledgeBaseEntries(
  restaurantId: string,
  entries: string[]
): Promise<number> {
  if (entries.length === 0) {
    return 0;
  }

  const kbEntries = entries.map((content) => ({
    restaurant_id: restaurantId,
    content,
    source: "menu_crawler",
    category: "menu",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await adminSupabaseClient
    .from("knowledge_base")
    .insert(kbEntries);

  if (error) {
    console.error("Failed to create knowledge base entries:", error);
    throw error;
  }

  return entries.length;
}

/**
 * Main API endpoint
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: MenuCrawlRequest = await request.json();
    const { restaurant_id, url } = body;

    if (!restaurant_id || !url) {
      return NextResponse.json(
        { error: "Missing restaurant_id or url" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    console.log("Starting menu crawl", { restaurant_id, url });

    // Verify restaurant exists
    const { data: restaurant, error: restaurantError } = await adminSupabaseClient
      .from("restaurants")
      .select("id")
      .eq("id", restaurant_id)
      .single();

    if (restaurantError || !restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // Fetch and parse HTML
    const html = await fetchAndParseUrl(url);

    // Extract menu items
    const { items, knowledgeBase } = extractMenuItems(html, restaurant_id);

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: "No menu items found",
          items_extracted: 0,
          items: [],
          knowledge_base_entries: 0,
        },
        { status: 400 }
      );
    }

    // Save items to database
    const savedCount = await saveMenuItems(items);

    // Create knowledge base entries
    const kbCount = await createKnowledgeBaseEntries(restaurant_id, knowledgeBase);

    console.log("Menu crawl completed", {
      restaurant_id,
      items_extracted: savedCount,
      knowledge_base_entries: kbCount,
    });

    const response: MenuCrawlResponse = {
      items_extracted: savedCount,
      items: items.slice(0, 20), // Return first 20 items as sample
      knowledge_base_entries: kbCount,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Menu crawl error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: errorMessage,
        items_extracted: 0,
        items: [],
        knowledge_base_entries: 0,
      },
      { status: 500 }
    );
  }
}
