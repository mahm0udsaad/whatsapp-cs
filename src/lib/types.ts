export type SetupStatus =
  | "draft"
  | "provisioning"
  | "pending_whatsapp"
  | "active"
  | "failed";

export type ProvisioningStatus =
  | "draft"
  | "pending_number_assignment"
  | "pending_embedded_signup"
  | "pending_sender_registration"
  | "pending_knowledge_sync"
  | "active"
  | "failed";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Restaurant {
  id: string;
  owner_id: string;
  name: string;
  name_ar: string | null;
  logo_url: string | null;
  country: string;
  currency: string;
  timezone: string;
  twilio_phone_number: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  digital_menu_url: string | null;
  website_url?: string | null;
  primary_whatsapp_number_id?: string | null;
  provisioning_status?: ProvisioningStatus;
  is_active: boolean;
  setup_status?: SetupStatus;
  onboarding_completed_at?: string | null;
  activation_started_at?: string | null;
  activated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AiAgent {
  id: string;
  restaurant_id: string;
  name: string;
  avatar_url: string | null;
  personality: string;
  system_instructions: string;
  chat_mode: "text_input" | "hybrid" | "human_handoff" | null;
  language_preference: "ar" | "en" | "auto";
  off_topic_response: string;
  max_context_messages?: number;
  temperature?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  restaurant_id: string;
  title: string | null;
  content: string;
  embedding?: number[] | null;
  source_type: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  price: number;
  discounted_price: number | null;
  currency: string;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  is_available: boolean;
  sort_order: number | null;
  crawled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  customer_name?: string | null;
  status: "active" | "archived" | "closed";
  started_at: string;
  last_message_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  metadata?: Record<string, unknown> | null;
  twilio_message_sid?: string | null;
  twilio_status?: "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered" | null;
  external_error_code?: string | null;
  external_message_sid?: string | null;
  delivery_status?: string | null;
  channel?: string;
  error_message?: string | null;
  created_at: string;
}

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateApprovalStatus = "draft" | "submitted" | "pending" | "approved" | "rejected" | "paused" | "disabled";
export type TemplateHeaderType = "none" | "text" | "image";

export interface MarketingTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  template_sid: string | null;
  twilio_content_sid: string | null;
  content_type: string | null;
  body_template: string | null;
  header_image_url: string | null;
  header_type: TemplateHeaderType;
  header_text: string | null;
  footer_text: string | null;
  buttons: Record<string, unknown>[] | null;
  variables: string[] | null;
  language: string;
  category: TemplateCategory;
  approval_status: TemplateApprovalStatus;
  rejection_reason: string | null;
  ai_generated: boolean;
  image_asset_url: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  restaurant_id: string;
  template_id: string | null;
  name: string;
  scheduled_at?: string | null;
  sending_started_at?: string | null;
  sending_completed_at?: string | null;
  audience_file_url?: string | null;
  audience_json?: Record<string, unknown>[] | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  error_message?: string | null;
  status: "draft" | "scheduled" | "processing" | "sending" | "completed" | "partially_completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  phone_number: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  twilio_message_sid?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  error_message?: string | null;
}

export interface TwilioSubaccount {
  id: string;
  restaurant_id: string;
  account_sid: string | null;
  friendly_name: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppNumber {
  id: string;
  phone_number: string;
  provider?: "twilio";
  source_type?: "pool" | "customer_owned";
  is_primary?: boolean;
  assignment_status?: "available" | "reserved" | "assigned" | "active" | "suspended" | "released";
  onboarding_status?: "unclaimed" | "pending_embedded_signup" | "pending_sender_registration" | "pending_test" | "active" | "failed";
  label?: string | null;
  twilio_phone_sid?: string | null;
  twilio_subaccount_sid?: string | null;
  messaging_service_sid?: string | null;
  twilio_messaging_service_sid?: string | null;
  twilio_whatsapp_sender_sid?: string | null;
  meta_business_account_id?: string | null;
  meta_waba_id?: string | null;
  config?: Record<string, unknown> | null;
  last_error?: string | null;
  status: string;
  is_whatsapp_enabled: boolean;
  restaurant_id?: string | null;
  reserved_at?: string | null;
  assigned_at?: string | null;
  released_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSender {
  id: string;
  restaurant_id: string;
  twilio_subaccount_id?: string | null;
  whatsapp_number_id?: string | null;
  phone_number: string;
  sender_sid?: string | null;
  messaging_service_sid?: string | null;
  waba_id?: string | null;
  display_name?: string | null;
  status: string;
  quality_rating?: string | null;
  is_primary: boolean;
  last_synced_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProvisioningRun {
  id: string;
  owner_id?: string;
  restaurant_id: string | null;
  whatsapp_number_id?: string | null;
  provider?: string;
  phase?: string;
  status: string;
  current_step?: string;
  retry_count?: number;
  last_error?: string | null;
  external_reference?: string | null;
  error_code?: string | null;
  error_detail?: string | null;
  metadata?: Record<string, unknown> | null;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantContext {
  profile: Profile;
  restaurant: Restaurant | null;
  aiAgent: AiAgent | null;
  primarySender: WhatsAppSender | null;
  setupStatus: SetupStatus;
}

export interface TwilioWebhookRequest {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  ProfileName?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  [key: string]: string | undefined;
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered";
  ErrorCode?: string;
  [key: string]: string | undefined;
}

export interface GeminiResponse {
  /** Plain-text fallback / preview of the reply (always populated). */
  content: string;
  /** Structured reply that drives interactive vs plain text send. */
  reply: InteractiveReply;
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

export interface RestaurantWebsitePrefill {
  restaurantName?: string;
  displayName?: string;
  websiteUrl: string;
  menuUrl?: string;
  country?: string;
  currency?: string;
  language?: "ar" | "en" | "auto";
  agentInstructions?: string;
  logoUrl?: string;
  telephone?: string;
  openingHours?: string;
  businessCategory?: string;
  address?: string;
}

export interface RestaurantWebsiteCrawlResponse {
  prefill: RestaurantWebsitePrefill;
  summary: string[];
  importedFields: string[];
}

export interface OnboardingPayload {
  restaurantName: string;
  displayName: string;
  country: string;
  currency: string;
  websiteUrl?: string;
  menuUrl?: string;
  agentName: string;
  personality: string;
  language: "ar" | "en" | "auto";
  agentInstructions: string;
  logoUrl?: string;
  telephone?: string;
  openingHours?: string;
  businessCategory?: string;
  botPhoneNumber: string;
}

// --- Marketing Campaign Types ---

export interface TemplateApprovalPoll {
  id: string;
  template_id: string;
  restaurant_id: string;
  twilio_content_sid: string;
  poll_count: number;
  next_poll_at: string;
  status: "polling" | "completed" | "abandoned";
  created_at: string;
  updated_at: string;
}

export interface TwilioContentTypes {
  "twilio/text"?: { body: string };
  "twilio/quick-reply"?: {
    body: string;
    actions: Array<{ title: string; id: string }>;
  };
  "twilio/list-picker"?: {
    body: string;
    button: string;
    items: Array<{
      item: string;
      description?: string;
      id: string;
    }>;
  };
  "whatsapp/card"?: {
    body: string;
    header_text?: string | null;
    media?: string[];
    footer?: string;
    actions: Array<{
      type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE";
      title: string;
      url?: string;
      phone?: string;
      code?: string;
      id?: string;
    }>;
  };
}

/**
 * Discriminated union returned by the AI for customer-service replies.
 * Drives whether ai-reply-jobs sends a plain text or a Twilio Content API
 * interactive message (quick-reply / list-picker). All variants are sent as
 * session messages — they only work inside the 24h customer-service window
 * and do not require Meta template approval.
 */
export type InteractiveReply =
  | { type: "text"; content: string }
  | {
      type: "quick_reply";
      body: string;
      options: Array<{ id: string; title: string }>;
    }
  | {
      type: "list";
      body: string;
      button: string;
      items: Array<{ id: string; title: string; description?: string }>;
    };

export interface AITemplateBuilderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AITemplateCollectedData {
  campaignType?: string;
  mainMessage?: string;
  includeImage?: boolean;
  imagePrompt?: string;
  buttons?: Array<{ type: string; title: string; url?: string; id?: string }>;
  language?: "ar" | "en";
  variables?: string[];
  footerText?: string;
  category?: TemplateCategory;
}

export interface AITemplateBuilderRequest {
  messages: AITemplateBuilderMessage[];
  collectedData: AITemplateCollectedData;
  restaurantName: string;
}

export interface AITemplateBuilderResponse {
  message: string;
  collectedData: AITemplateCollectedData;
  status: "collecting" | "generating" | "complete";
  template?: {
    name: string;
    body: string;
    headerType: TemplateHeaderType;
    headerText?: string;
    footerText?: string;
    buttons?: Array<{ type: string; title: string; url?: string; id?: string }>;
    variables: string[];
    language: string;
    category: TemplateCategory;
    imagePrompt?: string;
  };
}
