/**
 * Server-side client for the isolated `wa-export` service (whatsapp-web.js chat
 * history exporter) running on the VPS at 127.0.0.1:2786, exposed via nginx.
 *
 * This service is completely separate from the shared `openwa-api` container
 * that holds the 5 production sessions — it never touches them.
 *
 * The bearer token never leaves the server: only Next API routes call these.
 */

const BASE = process.env.WA_EXPORT_URL;
const TOKEN = process.env.WA_EXPORT_TOKEN;

export function isWaExportConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}

function baseUrl(): string {
  if (!BASE || !TOKEN) {
    throw new Error("wa-export not configured: set WA_EXPORT_URL and WA_EXPORT_TOKEN");
  }
  return BASE.replace(/\/+$/, "");
}

export async function waExportFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${TOKEN}`,
    },
    cache: "no-store",
  });
}

export interface ExportSummary {
  id: string;
  status:
    | "pending_qr"
    | "scanning"
    | "connected"
    | "syncing"
    | "ready"
    | "error"
    | "disconnected";
  error: string | null;
  clientName: string | null;
  number: string | null;
  pushname: string | null;
  progress: {
    totalChats: number;
    chats: number;
    messages: number;
    mediaFiles: number;
    bytes: number;
  };
  hasArchive: boolean;
}

export async function startExport(clientName: string): Promise<ExportSummary> {
  const res = await waExportFetch("/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientName }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`wa-export start failed (${res.status}): ${body}`);
  }
  return (await res.json()) as ExportSummary;
}

export async function getExportQr(
  id: string
): Promise<{ status: string; qr: string | null; qrDataUrl: string | null }> {
  const res = await waExportFetch(`/exports/${id}/qr`);
  if (!res.ok) throw new Error(`wa-export qr failed (${res.status})`);
  return (await res.json()) as {
    status: string;
    qr: string | null;
    qrDataUrl: string | null;
  };
}

export async function getExportStatus(id: string): Promise<ExportSummary> {
  const res = await waExportFetch(`/exports/${id}`);
  if (!res.ok) throw new Error(`wa-export status failed (${res.status})`);
  return (await res.json()) as ExportSummary;
}

export async function disconnectExport(id: string): Promise<void> {
  const res = await waExportFetch(`/exports/${id}/disconnect`, { method: "POST" });
  if (!res.ok) throw new Error(`wa-export disconnect failed (${res.status})`);
}

/**
 * Download the built ZIP archive for a ready export as an in-memory Buffer.
 * Used by the ingest route to unzip + persist chats into our DB before the
 * session is disconnected (which purges the archive on the VPS).
 */
export async function downloadExportZip(id: string): Promise<Buffer> {
  const res = await waExportFetch(`/exports/${id}/download`);
  if (!res.ok) {
    throw new Error(`wa-export download failed (${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
