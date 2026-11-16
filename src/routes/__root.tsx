import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Compass, House } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { initializeOffline } from "@/lib/pwa";

function NotFoundComponent() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_55%)]" />
      <div className="relative w-full max-w-xl rounded-[2rem] border bg-card/90 p-7 text-center shadow-2xl shadow-black/20 sm:p-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Compass className="size-7" /></span>
        <p className="mt-6 font-display text-7xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">Bu sayfayı bulamadık</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Adres değişmiş veya bağlantı hatalı olabilir. Ana sayfaya dönebilir ya da uygulamaya giriş yapabilirsin.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"><House className="size-4" />Ana sayfa</Link>
          <Link to="/auth" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold transition hover:bg-secondary"><ArrowLeft className="size-4" />Giriş yap</Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Sayfa yüklenemedi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bir sorun oluştu. Tekrar deneyin.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tekrar dene
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Saha — İş ve saha operasyon yönetimi" },
      { name: "description", content: "İş, cari hesap, tahsilat, gider, randevu ve çalışma kayıtlarını tek uygulamada yönetin." },
      { name: "theme-color", content: "#000000" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    try {
      document.documentElement.dataset.fieldMode = localStorage.getItem("saha-field-mode") === "sunlight" ? "sunlight" : "standard";
    } catch { /* Device storage can be disabled. */ }
    void initializeOffline();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" theme="dark" richColors />
    </QueryClientProvider>
  );
}
