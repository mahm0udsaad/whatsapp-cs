import { NextResponse } from "next/server";
import { clearMemberSessionCookie } from "@/lib/member-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearMemberSessionCookie(response);
  return response;
}
