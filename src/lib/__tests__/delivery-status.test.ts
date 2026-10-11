import { describe, expect, it } from "vitest";
import {
  isDeliveryFailure,
  shouldApplyDeliveryStatus,
} from "@/lib/delivery-status";

describe("shouldApplyDeliveryStatus", () => {
  it("moves forward through the normal lifecycle", () => {
    expect(shouldApplyDeliveryStatus("queued", "sent")).toBe(true);
    expect(shouldApplyDeliveryStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyDeliveryStatus("delivered", "read")).toBe(true);
    expect(shouldApplyDeliveryStatus(null, "queued")).toBe(true);
  });

  it("ignores out-of-order callbacks that would move backwards", () => {
    expect(shouldApplyDeliveryStatus("read", "delivered")).toBe(false);
    expect(shouldApplyDeliveryStatus("delivered", "sent")).toBe(false);
    expect(shouldApplyDeliveryStatus("sent", "sent")).toBe(false);
  });

  it("lets a failure override any in-flight state", () => {
    expect(shouldApplyDeliveryStatus("queued", "failed")).toBe(true);
    expect(shouldApplyDeliveryStatus("sent", "undelivered")).toBe(true);
  });

  it("never lets a late 'sent' overwrite a failure", () => {
    expect(shouldApplyDeliveryStatus("undelivered", "sent")).toBe(false);
    expect(shouldApplyDeliveryStatus("failed", "delivered")).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(shouldApplyDeliveryStatus("sent", "bogus")).toBe(false);
  });
});

describe("isDeliveryFailure", () => {
  it("treats undelivered like failed", () => {
    expect(isDeliveryFailure("undelivered")).toBe(true);
    expect(isDeliveryFailure("failed")).toBe(true);
    expect(isDeliveryFailure("sent")).toBe(false);
    expect(isDeliveryFailure(null)).toBe(false);
  });
});
