/**
 * Parse and verify a Facebook `signed_request`, used by the Meta Deauthorize
 * and Data Deletion callbacks. Facebook signs the payload with the app secret
 * (HMAC-SHA256); we reject anything whose signature doesn't match.
 *
 * Format: "<base64url signature>.<base64url JSON payload>"
 * Docs: https://developers.facebook.com/docs/facebook-login/data-deletion-request
 */

import crypto from "crypto";

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function parseSignedRequest(
  signedRequest: string,
  appSecret: string
): SignedRequestPayload | null {
  if (!signedRequest || !signedRequest.includes(".")) return null;
  const [encodedSig, encodedPayload] = signedRequest.split(".", 2);
  if (!encodedSig || !encodedPayload) return null;

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();
  const providedSig = base64UrlDecode(encodedSig);

  // Constant-time compare; lengths must match for timingSafeEqual.
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  try {
    const json = base64UrlDecode(encodedPayload).toString("utf8");
    const payload = JSON.parse(json) as SignedRequestPayload;
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Facebook posts the signed_request as form-encoded `signed_request=...`.
 * Pull it out of either a form body or JSON body.
 */
export async function readSignedRequest(
  request: Request
): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { signed_request?: string };
      return body.signed_request ?? null;
    }
    const form = await request.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
