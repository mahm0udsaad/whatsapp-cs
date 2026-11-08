import { presenceCheckDestination } from "../lib/hr-notifications";

describe("HR notification destinations", () => {
  it("accepts the documented string or numeric check identifier", () => {
    expect(presenceCheckDestination({ type: "presence_check", presence_check_id: "12" })?.params).toEqual({ id: "12" });
    expect(presenceCheckDestination({ type: "presence_check", presence_check_id: 12 })?.params).toEqual({ id: "12" });
  });
  it.each([undefined, null, "", "../account", "https://example.com", 0, -1, 1.5, {}, []])("ignores malformed identifiers: %p", id => {
    expect(presenceCheckDestination({ type: "presence_check", presence_check_id: id })).toBeNull();
  });
  it("does not intercept other notification types", () => {
    expect(presenceCheckDestination({ type: "new_conversation", presence_check_id: "12" })).toBeNull();
  });
});
