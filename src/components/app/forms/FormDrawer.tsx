import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptic";

export function FormDrawer({
  open,
  onOpenChange,
  title,
  onSubmit,
  busy,
  submitLabel = "Kaydet",
  canSubmit = true,
  submitHint,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  onSubmit: () => void;
  busy?: boolean;
  submitLabel?: string;
  canSubmit?: boolean;
  submitHint?: string;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="flex max-h-[92dvh] flex-col">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <form
          className="min-h-0 space-y-4 overflow-y-auto px-4 pb-36 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          onFocusCapture={(event) => { const target = event.target; if (target instanceof HTMLInputElement && target.type === "number") target.dataset.quickNumber = "true"; }}
        >
          {children}
        </form>
        <div className="absolute inset-x-0 bottom-0 z-20 space-y-2 border-t bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur">
          <div className="grid grid-cols-4 gap-2" aria-label="Hızlı miktar artırma">
            {[["+500 ₺", 500], ["+1.000 ₺", 1000], ["+1 Saat", 1], ["+0,5 Saat", 0.5]].map(([label, amount], index) => <Button key={String(label)} type="button" variant="secondary" className="h-9 px-1 text-[11px]" onClick={(event) => {
              const form = event.currentTarget.closest("[data-vaul-drawer] ")?.querySelector("form");
              const target = form?.querySelector<HTMLInputElement>('input[type="number"]:focus') ?? form?.querySelector<HTMLInputElement>('input[type="number"][data-quick-number="true"]');
              if (!target) return;
              const labelText = target.id ? document.querySelector(`label[for="${CSS.escape(target.id)}"]`)?.textContent?.toLocaleLowerCase("tr-TR") ?? "" : "";
              const isHours = /saat|süre|hours|duration/i.test(`${target.id} ${labelText}`);
              const value = Number(target.value || 0) + Number(amount) * (isHours ? 1 : index < 2 ? 1 : 0);
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              setter?.call(target, String(Math.round(value * 100) / 100)); target.dispatchEvent(new Event("input", { bubbles: true })); target.dispatchEvent(new Event("change", { bubbles: true })); target.focus(); haptic(10);
            }}>{label}</Button>)}
          </div>
          {!canSubmit && submitHint && <p role="alert" className="text-center text-xs text-destructive">{submitHint}</p>}
          <Button type="submit" form={undefined} className="h-12 w-full text-base" disabled={busy || !canSubmit} onClick={() => {
            const drawer = document.querySelector("[data-vaul-drawer] form"); if (drawer instanceof HTMLFormElement) { if (!drawer.reportValidity()) return; drawer.requestSubmit(); }
          }}>
            {busy && <Loader2 className="animate-spin" />}{submitLabel}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
