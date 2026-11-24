import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function InstallButton() {
  const [event, setEvent] = useState<InstallEvent>();
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const listener = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    const installedListener = () => { setInstalled(true); setEvent(undefined); };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(standalone);
    window.addEventListener("appinstalled", installedListener);
    return () => { window.removeEventListener("beforeinstallprompt", listener); window.removeEventListener("appinstalled", installedListener); };
  }, []);
  if (installed) return <p className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 text-sm font-medium text-emerald-300">✓ Yevmiye & Finans bu cihazda yüklü</p>;
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="h-12 w-full rounded-xl"
        onClick={async () => {
          if (event) {
            try {
              await event.prompt();
              const choice = await event.userChoice;
              if (choice.outcome === "accepted") setInstalled(true);
              else setHelp(true);
            } catch {
              setHelp(true);
            } finally {
              setEvent(undefined);
            }
          } else setHelp(!help);
        }}
      >
        <Download />
        Yevmiye & Finans’ı telefona uygulama olarak ekle
      </Button>
      {help && (
        <p className="rounded-xl border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
          Android: Chrome menüsü → <strong>Uygulamayı yükle</strong>. iPhone/iPad: Safari’de Paylaş → <strong>Ana Ekrana Ekle</strong> → Ekle. Sonra Yevmiye & Finans simgesine dokun; uygulama tarayıcı çerçevesi olmadan açılır.
        </p>
      )}
    </div>
  );
}
