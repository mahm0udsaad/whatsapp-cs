export type HrLocale = 'ar' | 'en';
export type HrTheme = 'light' | 'dark';
export type HrActivationStatus = 'unregistered' | 'pending_first_scan' | 'pending_approval' | 'active' | 'revoked';
export type HrScenario = 'new' | 'active' | 'on_duty' | 'completed' | 'presence' | 'history' | 'pending_first_scan' | 'pending_approval' | 'revoked' | 'offline' | 'qr_expired' | 'qr_invalid' | 'duplicate_punch' | 'attendance_not_tracked' | 'employee_inactive' | 'subscription_inactive' | 'activation_code_expired' | 'activation_code_used' | 'activation_code_invalid' | 'server_error' | 'timeout_after_punch' | 'signature_invalid' | 'rate_limited' | 'empty_history';
export type HrErrorCode = Exclude<HrScenario, 'new' | 'active' | 'on_duty' | 'completed' | 'presence' | 'history' | 'pending_first_scan' | 'pending_approval' | 'empty_history'> | 'validation_failed' | 'device_not_approved' | 'device_revoked' | 'unauthenticated' | 'presence_check_expired' | 'not_found';
export interface HrEmployee { id: number; code: string; name: string; name_ar: string; name_en: string; job_title: string; }
export interface HrCompany { name: string; name_ar: string; name_en: string; timezone: string; locale: HrLocale; }
export interface HrPlace { id: number; name: string; name_ar: string; name_en: string; }
export interface HrDevice { id: number; status: HrActivationStatus; platform: 'demo'; model: string; key_algorithm: 'demo-only'; approved_at: string | null; }
export interface HrSettings { qr_step_seconds: number; punch_cooldown_seconds: number; presence_check_window: number; }
export interface HrScan { qr_payload: string; client_request_id: string; signature: string; auth_method: 'biometric_bound' | 'biometric' | 'device_credential'; }
export interface HrPunch { id: string; type: 'in' | 'out'; work_date: string; minute: number; time: string; punched_at: string; source: 'app'; client_request_id: string; place: HrPlace; }
export interface HrPresenceCheck { id: number; status: 'sent' | 'confirmed' | 'expired'; sent_at: string; expires_at: string; seconds_left: number; confirmed_at: string | null; }
export interface HrToday { work_date: string; status: 'not_in' | 'on_duty' | 'present'; in: string | null; out: string | null; in_minute: number | null; out_minute: number | null; worked_minutes: number; late_minutes: number; next_punch_type: 'in' | 'out'; schedule: { name: string; type: 'fixed'; start: string; end: string; night_shift: boolean }; punches: HrPunch[]; server_time: string; server_time_ms: number; }
/** Demo view model. Historical day policies are not supplied by the current punch-history API. */
export interface HrHistoryDay { work_date: string; status: 'present' | 'on_duty' | 'late' | 'missing' | 'leave' | 'weekend' | 'not_in'; in: string | null; out: string | null; worked_minutes: number; late_minutes: number; night_shift: boolean; punches: HrPunch[]; demo_only: true; }
export interface HrMe { employee: HrEmployee; company: HrCompany; device: HrDevice; activation_status: HrActivationStatus; settings: HrSettings; server_time: string; server_time_ms: number; }
export interface HrDemoState { activationStatus: HrActivationStatus; employee: HrEmployee; company: HrCompany; device: HrDevice; settings: HrSettings; locale: HrLocale; theme: HrTheme; punches: HrPunch[]; presenceChecks: HrPresenceCheck[]; scenario: HrScenario; clockBase: number; clockStartedAt: number; usedCode: boolean; verifiedCode: string | null; replay: Record<string, HrPunch>; timeoutDelivered: boolean; }
export interface HrVerifiedIdentity { employee: HrEmployee; company: HrCompany; expires_at: string; }
