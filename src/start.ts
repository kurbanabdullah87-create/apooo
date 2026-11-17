import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Vercel serves both the stable project domain and its generated production
// alias. Browser storage is origin-scoped, so keep auth and OAuth callbacks on
// one canonical origin to make remembered sessions consistent.
const canonicalHostMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const url = new URL(request.url);
  // All browser storage (including Supabase refresh tokens and OAuth PKCE
  // verifiers) is origin-scoped. Normalize both the fixed project alias and
  // generated production aliases before login starts, so OAuth returns to the
  // same origin that stored its verifier/session.
  const isSahaProjectHost = /^sahav2full(?:-[a-z0-9]+)*\.vercel\.app$/i.test(url.hostname);
  if (url.hostname !== "sahav2full.vercel.app" && isSahaProjectHost) {
    url.hostname = "sahav2full.vercel.app";
    return Response.redirect(url, 308);
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [canonicalHostMiddleware, errorMiddleware, csrfMiddleware],
}));
