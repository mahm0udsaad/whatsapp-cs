import { describe, it, expect } from "vitest";
import { classifyEscalation } from "@/lib/escalation-classifier";

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

  it("prioritizes AI-punt over sensitive when both match", () => {
    const r = classifyEscalation({
      customerMessage: "عندي مشكلة في الحجز",
      aiReply: "سأتحقق من ذلك مع فريقنا.",
      ragChunkCount: 2,
    });
    // punt pattern fires first
    expect(r.reason).toBe("knowledge_gap");
  });
});
