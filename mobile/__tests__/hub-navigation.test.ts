import { HUB_HOME, loginDestination, whatsappHome } from "../lib/navigation";
import type { TeamMemberRow } from "../lib/supabase";

const member = (role: "admin" | "agent") => ({ id: "member-1", role }) as TeamMemberRow;

describe("Hub navigation", () => {
  it("defaults to Hub independently of the old workspace preference", () => {
    expect(loginDestination()).toBe("/(hub)");
    expect(HUB_HOME).toBe("/(hub)/(tabs)/dashboard");
  });
  it("retains attendance and booking links after authentication", () => {
    expect(loginDestination("/hr/history")).toBe("/hr/history");
    expect(loginDestination("/hr/presence/42")).toBe("/hr/presence/42");
    expect(loginDestination("/bookings/booking-123")).toBe("/bookings/booking-123");
  });
  it("retains only the invitation code query parameter", () => {
    expect(loginDestination("/hr/activate?code=K7QM-4XHT&redirect=https://example.com")).toBe("/hr/activate?code=K7QM-4XHT");
    expect(loginDestination("/hr/history?code=K7QM4XHT")).toBe("/hr/history");
  });
  it.each(["https://example.com", "//example.com/hr", "/hr/../../profile", "/(gateway)/select", "/hrfoo", "/hr/%2f%2fexample.com"])("rejects an untrusted return destination: %s", (destination) => {
    expect(loginDestination(destination)).toBe("/(hub)");
  });
  it("opens WhatsApp at the role-specific screen", () => {
    expect(whatsappHome(member("admin"))).toBe("/(app)/overview");
    expect(whatsappHome(member("agent"))).toBe("/(app)/inbox");
  });
});
