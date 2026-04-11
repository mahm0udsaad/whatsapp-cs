import type { NextRequest, NextResponse } from "next/server";

export const MEMBER_COOKIE = "rm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32; // 256 bits
const SALT_LEN = 16;

function getSessionSecret(): string {
  const secret = process.env.MEMBER_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing MEMBER_SESSION_SECRET environment variable");
  }
  return secret;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface MemberSessionPayload {
  memberId: string;
  restaurantId: string;
  ownerId: string;
  exp: number; // unix seconds
}

// ---------- Encoding helpers ----------

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlEncodeString(str: string): string {
  return base64urlEncodeBytes(textEncoder.encode(str));
}

function base64urlDecodeToString(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return textDecoder.decode(bytes);
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Password hashing (PBKDF2-SHA256) ----------

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(plain) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    PBKDF2_KEYLEN * 8
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltHex, hashHex] = stored.split("$");
    if (scheme !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
    const iterations = Number.parseInt(iterStr, 10);
    if (!Number.isFinite(iterations)) return false;

    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);

    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(plain) as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations,
        hash: "SHA-256",
      },
      key,
      expected.length * 8
    );
    return timingSafeEqualBytes(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

// ---------- Token signing (HMAC-SHA256) ----------

let cachedHmacKey: CryptoKey | null = null;
async function getHmacKey(): Promise<CryptoKey> {
  if (cachedHmacKey) return cachedHmacKey;
  cachedHmacKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSessionSecret()) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedHmacKey;
}

async function signHmac(payload: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payload) as BufferSource
  );
  return base64urlEncodeBytes(new Uint8Array(sig));
}

export async function signMemberToken(
  payload: Omit<MemberSessionPayload, "exp"> & { exp?: number }
): Promise<string> {
  const exp =
    payload.exp ?? Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const body: MemberSessionPayload = {
    memberId: payload.memberId,
    restaurantId: payload.restaurantId,
    ownerId: payload.ownerId,
    exp,
  };
  const encoded = base64urlEncodeString(JSON.stringify(body));
  const signature = await signHmac(encoded);
  return `${encoded}.${signature}`;
}

export async function verifyMemberToken(
  token: string | undefined | null
): Promise<MemberSessionPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expectedSig = await signHmac(encoded);
  if (
    !timingSafeEqualBytes(
      textEncoder.encode(signature),
      textEncoder.encode(expectedSig)
    )
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64urlDecodeToString(encoded)) as MemberSessionPayload;
    if (
      typeof parsed.memberId !== "string" ||
      typeof parsed.restaurantId !== "string" ||
      typeof parsed.ownerId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------- Cookie helpers ----------

export async function getMemberSessionFromRequest(
  request: NextRequest
): Promise<MemberSessionPayload | null> {
  return verifyMemberToken(request.cookies.get(MEMBER_COOKIE)?.value);
}

export function setMemberSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: MEMBER_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearMemberSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: MEMBER_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
