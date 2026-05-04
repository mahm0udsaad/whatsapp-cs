import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getMemberSessionFromRequest } from "@/lib/member-auth";

// Routes that bounce logged-in users back to the dashboard
// (so they don't see the login/signup screens again).
const authEntryRoutes = ["/login", "/signup", "/auth/callback"];

// Marketing & legal pages under the (public) route group.
// Reachable for everyone — logged-in OR not — because Google Play's reviewer
// reads /privacy and /delete-account, and a logged-in manager who clicks
// "Privacy" in the footer should actually see the policy, not the dashboard.
const publicMarketingRoutes = [
  "/privacy",
  "/terms",
  "/support",
  "/delete-account",
];

const publicRoutes = [...authEntryRoutes, ...publicMarketingRoutes];
const publicPrefixes = [
  "/api/webhooks/",
  "/api/internal/",
  "/api/auth/member-login",
  "/api/auth/member-logout",
  // Mobile API uses Bearer-token auth on every route, which the middleware's
  // cookie-only Supabase client cannot validate. The route handlers themselves
  // call `createServerSupabaseClient` (which does read Bearer) and reject
  // unauthenticated calls with 401, so we let them pass the middleware instead
  // of 302-redirecting mobile requests to /login (which caused apiFetch to
  // receive the login page HTML as a 200 response).
  "/api/mobile/",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const memberSession = user ? null : await getMemberSessionFromRequest(request);
  const isAuthenticated = Boolean(user) || Boolean(memberSession);

  const { pathname } = request.nextUrl;

  // Logged-in users on /login, /signup, or /auth/callback — bounce to the
  // dashboard. Marketing & legal pages stay reachable for everyone.
  if (isAuthenticated && authEntryRoutes.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const isPublicPrefix = publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (
    !isAuthenticated &&
    !publicRoutes.includes(pathname) &&
    pathname !== "/" &&
    !isPublicPrefix
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
