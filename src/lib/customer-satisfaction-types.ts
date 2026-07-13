export type SatisfactionSentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "mixed";

export type SatisfactionRiskLevel = "low" | "medium" | "high";

export interface SatisfactionEvidence {
  source_type: "message" | "order" | "nehgz_event" | "metric";
  source_id: string;
  description: string;
}

export interface SatisfactionMetrics {
  customer_messages: number;
  business_messages: number;
  received_media: number;
  median_response_minutes: number | null;
  last_customer_message_unanswered: boolean;
  pending_escalations: number;
  pending_reservations: number;
  sla_breaches: number;
  nehgz_bookings: number;
  nehgz_cancellations: number;
  nehgz_completions: number;
  payment_updates: number;
}

export interface CustomerSatisfactionAnalysis {
  id: string;
  restaurant_id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  score: number;
  sentiment: SatisfactionSentiment;
  risk_level: SatisfactionRiskLevel;
  confidence: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  unanswered_questions: string[];
  recommended_actions: string[];
  evidence: SatisfactionEvidence[];
  metrics: SatisfactionMetrics;
  analysis_mode: "fresh" | "reanalysis";
  source_message_count: number;
  new_message_count: number;
  latest_message_at: string | null;
  whatsapp_status: string;
  nehgz_status: string;
  input_hash: string;
  model: string;
  prompt_version: string;
  created_by_user_id: string | null;
  created_at: string;
}

export interface SatisfactionAnalysisResponse {
  analysis: CustomerSatisfactionAnalysis;
  cached: boolean;
  has_new_messages: boolean;
  new_messages_since_analysis: number;
}
