import {
  deliveryErrorCode,
  deliveryFailureReason,
  isDeliveryFailure,
} from "../lib/delivery-errors";

describe("delivery-errors", () => {
  it("treats undelivered like failed", () => {
    expect(isDeliveryFailure("undelivered")).toBe(true);
    expect(isDeliveryFailure("failed")).toBe(true);
    expect(isDeliveryFailure("sent")).toBe(false);
    expect(isDeliveryFailure(null)).toBe(false);
  });

  it("extracts the Twilio code from the stored error message", () => {
    expect(deliveryErrorCode("Twilio error code: 63049")).toBe("63049");
    expect(deliveryErrorCode(null)).toBeNull();
    expect(deliveryErrorCode("no code here")).toBeNull();
  });

  it("returns no reason for healthy messages", () => {
    expect(deliveryFailureReason("delivered", null)).toBeNull();
    expect(deliveryFailureReason("sent", "Twilio error code: 63049")).toBeNull();
  });

  it("explains known Meta refusals", () => {
    expect(
      deliveryFailureReason("undelivered", "Twilio error code: 63049")
    ).toContain("التسويقية");
    expect(
      deliveryFailureReason("undelivered", "Twilio error code: 63016")
    ).toContain("قالباً");
  });

  it("falls back to the raw code, then to a generic message", () => {
    expect(deliveryFailureReason("failed", "Twilio error code: 30008")).toContain(
      "30008"
    );
    expect(deliveryFailureReason("failed", null)).toBe("لم تُسلَّم الرسالة.");
  });
});
