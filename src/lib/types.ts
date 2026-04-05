// Database Types
export interface Restaurant {
  id: string;
  user_id: string;
  name: string;
  whatsapp_number: string;
  whatsapp_business_account_id: string;
  description?: string;
  location?: string;
  cuisine_type?: string;
  created_at: string;
  updated_at: string;
}

export interface AiAgent {
  id: string;
  restaurant_id: string;
  name: string;
  system_prompt: string;
  personality: string;
  language_preference: "ar" | "en" | "auto";
  off_topic_response: string;
  max_context_messages: number;
  temperature: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  restaurant_id: string;
  content: string;
  source?: string;
  category?: string;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category: string;
  image_url?: string;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  customer_name?: string;
  status: "active" | "archived" | "closed";
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: "customer" | "ai";
  content: string;
  language: "ar" | "en";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface MarketingTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  content: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  restaurant_id: string;
  template_id: string;
  name: string;
  status: "draft" | "scheduled" | "active" | "completed" | "cancelled";
  scheduled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  customer_phone: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  error_message?: string;
  created_at: string;
}

// API Request/Response Types
export interface TwilioWebhookRequest {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  [key: string]: string | undefined;
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: "sent" | "delivered" | "read" | "failed" | "undelivered";
  ErrorCode?: string;
  [key: string]: string | undefined;
}

export interface GeminiResponse {
  content: string;
  language: "ar" | "en";
}

export interface MenuCrawlRequest {
  restaurant_id: string;
  url: string;
}

export interface MenuCrawlResponse {
  items_extracted: number;
  items: MenuItem[];
  knowledge_base_entries: number;
}
