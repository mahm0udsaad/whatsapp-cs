import { describe, it, expect } from "vitest";
import {
  classifyEscalation,
  isBookingRequest,
} from "@/lib/escalation-classifier";

describe("classifyEscalation", () => {
  it("escalates when the AI punts in Arabic", () => {
    const r = classifyEscalation({
      customerMessage: "هل فيه خدمة منزلية؟",
      aiReply: "سأتحقق من ذلك مع فريقنا وسيتواصل معك قريباً 🙏",
      ragChunkCount: 3,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "knowledge_gap" });
  });

  it("escalates when the AI punts in English", () => {
    const r = classifyEscalation({
      customerMessage: "Do you offer home visits?",
      aiReply: "I'll check on that with our team and they will get back to you shortly.",
      ragChunkCount: 5,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "knowledge_gap" });
  });

  it("escalates a sensitive customer message (complaint/refund)", () => {
    const r = classifyEscalation({
      customerMessage: "عندي شكوى من الموعد السابق وأبغى استرجاع الفلوس",
      aiReply: "نحن آسفون لسماع ذلك.",
      ragChunkCount: 2,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "sensitive" });
  });

  it("escalates when the customer asks for a human (Arabic)", () => {
    const r = classifyEscalation({
      customerMessage: "أبغى أكلم موظفة",
      aiReply: "تفضلي، كيف أقدر أساعدك؟",
      ragChunkCount: 1,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "customer_asked_human" });
  });

  it("escalates when the customer asks for a human (English)", () => {
    const r = classifyEscalation({
      customerMessage: "Can I speak to a manager please?",
      aiReply: "Of course, how can I help?",
      ragChunkCount: 1,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "customer_asked_human" });
  });

  it("escalates on empty RAG + non-trivial question (knowledge gap)", () => {
    const r = classifyEscalation({
      customerMessage: "Do you offer bridal packages with video?",
      aiReply: "We have a few packages.",
      ragChunkCount: 0,
    });
    expect(r).toEqual({ shouldEscalate: true, reason: "knowledge_gap" });
  });

  it("does NOT escalate on empty RAG + very short question", () => {
    const r = classifyEscalation({
      customerMessage: "نعم",
      aiReply: "ممتاز!",
      ragChunkCount: 0,
    });
    expect(r).toEqual({ shouldEscalate: false, reason: null });
  });

  it("does NOT escalate normal service question with RAG hits", () => {
    const r = classifyEscalation({
      customerMessage: "كم سعر البديكير؟",
      aiReply: "البديكير الكلاسيكي 80 ريال.",
      ragChunkCount: 4,
    });
    expect(r).toEqual({ shouldEscalate: false, reason: null });
  });

  it("prioritizes sensitive over AI-punt when both match", () => {
    // User intent (complaint) is a stronger signal than AI uncertainty.
    const r = classifyEscalation({
      customerMessage: "عندي مشكلة في الحجز",
      aiReply: "سأتحقق من ذلك مع فريقنا.",
      ragChunkCount: 2,
    });
    expect(r.reason).toBe("sensitive");
  });

  it("prioritizes explicit human-handoff over aiUncertain", () => {
    // Regression: an explicit "I want to talk to the manager" MUST beat
    // aiUncertain=true. Otherwise the owner sees "فجوة معرفية" on what is
    // clearly a handoff request.
    const r = classifyEscalation({
      customerMessage: "عايز اتواصل مع المدير ضروري",
      aiReply: "تفضل، كيف أقدر أساعدك؟",
      ragChunkCount: 2,
      aiUncertain: true,
    });
    expect(r).toEqual({
      shouldEscalate: true,
      reason: "customer_asked_human",
    });
  });

  it("matches Egyptian dialect human-handoff ('عايز اتواصل مع المدير')", () => {
    const r = classifyEscalation({
      customerMessage: "عايز اتواصل مع المدير",
      aiReply: "أهلا بك",
      ragChunkCount: 3,
    });
    expect(r.reason).toBe("customer_asked_human");
  });

  it("matches Egyptian dialect 'عاوز أكلم موظف'", () => {
    const r = classifyEscalation({
      customerMessage: "عاوز أكلم موظف لو سمحت",
      aiReply: "أهلا بك",
      ragChunkCount: 3,
    });
    expect(r.reason).toBe("customer_asked_human");
  });
});

describe("isBookingRequest", () => {
  it("matches classic Gulf booking requests", () => {
    expect(isBookingRequest("ابغى حجز بكره ساعه 10 مساج ساعه")).toBe(true);
    expect(isBookingRequest("ابي حجز اليوم")).toBe(true);
    expect(isBookingRequest("ودي احجز")).toBe(true);
    expect(isBookingRequest("احجز لي الخميس")).toBe(true);
  });

  it("matches English booking requests", () => {
    expect(isBookingRequest("I want to book tomorrow at 10")).toBe(true);
    expect(isBookingRequest("Can I make a reservation?")).toBe(true);
    expect(isBookingRequest("appointment for Friday please")).toBe(true);
  });

  it("matches the 'موعد' alias", () => {
    expect(isBookingRequest("ابغى موعد بكره")).toBe(true);
  });

  it("does NOT match complaints or small talk", () => {
    expect(isBookingRequest("الخدمه جدآ سيئه")).toBe(false);
    expect(isBookingRequest("مرحبا، كيف الحال")).toBe(false);
    expect(isBookingRequest("بكم السعر؟")).toBe(false);
    expect(isBookingRequest("")).toBe(false);
  });

  it("does NOT match a bare time token without a booking verb", () => {
    // Prevents "البوس بكره الساعه 10" from being classified as booking.
    expect(isBookingRequest("بكره الساعه 10")).toBe(false);
  });
});
