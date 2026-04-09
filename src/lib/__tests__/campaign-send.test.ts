import { describe, it, expect } from "vitest";

/**
 * These tests validate the core logic patterns used in the campaign send route
 * (`src/app/api/marketing/campaigns/[id]/send/route.ts`) without requiring
 * Supabase, auth, or network dependencies.
 */

// ---------------------------------------------------------------------------
// Status determination logic (mirrors line 185 of the send route)
// ---------------------------------------------------------------------------

function determineFinalStatus(
  failedCount: number,
  totalRecipients: number
): "completed" | "partially_completed" | "failed" {
  return failedCount === totalRecipients
    ? "failed"
    : failedCount > 0
      ? "partially_completed"
      : "completed";
}

describe("campaign final status", () => {
  it("returns 'completed' when no failures", () => {
    expect(determineFinalStatus(0, 10)).toBe("completed");
  });

  it("returns 'completed' when no failures and single recipient", () => {
    expect(determineFinalStatus(0, 1)).toBe("completed");
  });

  it("returns 'failed' when all recipients fail", () => {
    expect(determineFinalStatus(5, 5)).toBe("failed");
  });

  it("returns 'failed' when single recipient fails", () => {
    expect(determineFinalStatus(1, 1)).toBe("failed");
  });

  it("returns 'partially_completed' when some but not all fail", () => {
    expect(determineFinalStatus(3, 10)).toBe("partially_completed");
  });

  it("returns 'partially_completed' when only one fails out of many", () => {
    expect(determineFinalStatus(1, 100)).toBe("partially_completed");
  });
});

// ---------------------------------------------------------------------------
// Batch chunking logic (mirrors the for-loop at line 119 of the send route)
// ---------------------------------------------------------------------------

function chunkArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

describe("batch processing", () => {
  it("processes items in batches of correct size", () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const batches = chunkArray(items, 50);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(50);
    expect(batches[2]).toHaveLength(50);
  });

  it("processes all items even when not evenly divisible", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const batches = chunkArray(items, 50);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(50);
    expect(batches[2]).toHaveLength(20);

    // Verify all items are present
    const flattened = batches.flat();
    expect(flattened).toHaveLength(120);
    expect(flattened).toEqual(items);
  });

  it("handles a single batch when items fewer than batch size", () => {
    const items = [1, 2, 3];
    const batches = chunkArray(items, 50);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([1, 2, 3]);
  });

  it("handles an empty array", () => {
    const batches = chunkArray([], 50);
    expect(batches).toHaveLength(0);
  });

  it("handles batch size of 1", () => {
    const items = [10, 20, 30];
    const batches = chunkArray(items, 1);

    expect(batches).toHaveLength(3);
    expect(batches.every((b) => b.length === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: simulate a full batch send with mixed success/failure
// ---------------------------------------------------------------------------

describe("batch send simulation", () => {
  it("correctly tracks sent and failed counts across batches", async () => {
    const BATCH_SIZE = 50;
    const recipients = Array.from({ length: 120 }, (_, i) => ({
      id: `r${i}`,
      phone: `+1555000${String(i).padStart(4, "0")}`,
    }));

    // Simulate: every 3rd recipient fails
    const sendMessage = async (_phone: string, index: number) => {
      if (index % 3 === 0) throw new Error("Send failed");
      return `SM${index}`;
    };

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (recipient, batchIndex) => {
        try {
          await sendMessage(recipient.phone, i + batchIndex);
          sentCount++;
        } catch {
          failedCount++;
        }
      });
      await Promise.all(promises);
    }

    expect(sentCount + failedCount).toBe(120);
    expect(failedCount).toBe(40); // indices 0,3,6,...,117 => 40 items
    expect(sentCount).toBe(80);

    const status = determineFinalStatus(failedCount, recipients.length);
    expect(status).toBe("partially_completed");
  });

  it("reports 'completed' when all sends succeed", async () => {
    const recipients = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
    let sentCount = 0;
    let failedCount = 0;

    for (const _r of recipients) {
      sentCount++;
    }

    const status = determineFinalStatus(failedCount, recipients.length);
    expect(status).toBe("completed");
    expect(sentCount).toBe(10);
  });

  it("reports 'failed' when all sends fail", async () => {
    const recipients = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` }));
    let failedCount = 0;

    for (const _r of recipients) {
      failedCount++;
    }

    const status = determineFinalStatus(failedCount, recipients.length);
    expect(status).toBe("failed");
    expect(failedCount).toBe(5);
  });
});
