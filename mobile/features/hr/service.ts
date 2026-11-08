import type { HrMe, HrPunch, HrScan, HrToday, HrPresenceCheck, HrVerifiedIdentity, HrHistoryDay } from './types';
/** Adapter boundary: this release uses only the local implementation. */
export interface HrService {
  verify(code: string): Promise<HrVerifiedIdentity>;
  complete(code: string): Promise<HrMe>;
  firstScan(scan: HrScan): Promise<HrMe>;
  approveDemoDevice(): Promise<HrMe>;
  me(): Promise<HrMe>;
  today(): Promise<HrToday>;
  punch(scan: HrScan): Promise<{ punch: HrPunch }>;
  history(from?: string, to?: string): Promise<{ from: string; to: string; punches: HrPunch[]; days: HrHistoryDay[] }>;
  pending(): Promise<{ presence_checks: HrPresenceCheck[]; server_time: string; server_time_ms: number }>;
  confirmPresence(id: number, scan: HrScan): Promise<{ presence_check: HrPresenceCheck }>;
  savePushToken(): Promise<{ saved: true }>;
  logout(): Promise<void>;
}
