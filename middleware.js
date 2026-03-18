import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Only the Clerk-specific auth pages need to be routed through Clerk.
// All other pages (faculty, student, admin, settings) use their own
// custom localStorage-based session guards (AuthGuard component).
// Clerk must NOT interfere with these routes.
const isClerkAuthRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware((auth, req) => {
  // Let Clerk handle only its own sign-in/sign-up pages.
  // Everything else passes through freely — custom AuthGuard handles protection.
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
