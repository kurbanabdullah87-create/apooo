import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, Coins } from "lucide-react";
import { CurrencyConverter } from "@/components/app/CurrencyConverter";
import { pageHead } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/doviz")({
  head: () => pageHead("Döviz", "Canlı döviz ve altın kurları."),
  component: CurrencyPage,
});

function CurrencyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="rounded-3xl border bg-gradient-to-br from-card via-card to-primary/10 p-5 sm:p-7">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Coins className="size-5" /></div>
        <p className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><ArrowLeftRight className="size-4" /> Finans araçları</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Döviz ve altın</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Döviz çevirici ve kur takibini panelden ayrı bir bölümde görüntüleyin.</p>
      </header>
      <CurrencyConverter />
    </div>
  );
}
