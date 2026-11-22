import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface RecognitionResult { transcript: string }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<ArrayLike<RecognitionResult> & { isFinal: boolean }> }
interface Recognition { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type RecognitionConstructor = new () => Recognition;

export function VoiceCommandButton({ onSearch }: { onSearch: (query: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const speechWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!RecognitionCtor) return null;

  function run(raw: string) {
    const command = raw.trim();
    const normalized = command.toLocaleLowerCase("tr-TR");
    const routes: Array<[string[], string]> = [
      [["panel", "ana sayfa"], "/panel"], [["işler", "iş listesi"], "/isler"], [["müşteriler", "cari"], "/cari"],
      [["yevmiye", "bordro"], "/yevmiye"], [["ekipman", "makineler"], "/ekipman"], [["randevular", "randevu"], "/randevu"],
      [["giderler", "gider"], "/giderler"], [["banka", "hesap hareketleri"], "/banka"], [["döviz", "kur"], "/doviz"],
    ];
    if (normalized === "yeni iş ekle" || normalized === "iş ekle") {
      window.dispatchEvent(new Event("saha-request-job-form"));
      toast.success("Yeni iş formu açılıyor.");
      return;
    }
    if (normalized.startsWith("müşteri ara ")) {
      onSearch(command.slice("müşteri ara ".length).trim());
      return;
    }
    if (normalized.startsWith("not ekle ")) {
      const note = command.slice("not ekle ".length).trim();
      if (!note) { toast.error("Not metni boş olamaz."); return; }
      try { localStorage.setItem("panel_note", note); window.dispatchEvent(new Event("saha-panel-note")); toast.success("Not panelde kaydedildi."); }
      catch { toast.error("Not bu cihazda saklanamadı."); }
      window.dispatchEvent(new Event("saha-open-panel"));
      return;
    }
    const match = routes.find(([words]) => words.includes(normalized));
    if (match) { window.dispatchEvent(new CustomEvent("saha-navigate", { detail: match[1] })); toast.success(`Açılıyor: ${command}`); return; }
    toast.error("Komutu anlayamadım. Panel, İşler, Cari, Randevu, Banka, ‘müşteri ara …’ veya ‘not ekle …’ deneyin.");
  }

  function toggle() {
    if (!RecognitionCtor) return;
    if (listening) { recognition.current?.stop(); return; }
    try {
      const instance = new RecognitionCtor();
      instance.lang = "tr-TR"; instance.continuous = false; instance.interimResults = false;
      instance.onresult = (event) => { const result = event.results[event.resultIndex]; const text = result?.[0]?.transcript; if (result?.isFinal && text) run(text); };
      instance.onerror = (event) => toast.error(event.error === "not-allowed" ? "Sesli komut için mikrofon izni gerekli." : "Ses tanınamadı. Tekrar deneyin.");
      instance.onend = () => setListening(false);
      recognition.current = instance; instance.start(); setListening(true);
    } catch { setListening(false); toast.error("Sesli komut başlatılamadı."); }
  }

  return <Button variant={listening ? "destructive" : "ghost"} size="icon" aria-label={listening ? "Sesli komutu durdur" : "Sesli komut"} title={listening ? "Dinleniyor…" : "Sesli komut"} className={listening ? "animate-pulse" : ""} onClick={toggle}>{listening ? <Square className="size-4"/> : <Mic className="size-4"/>}</Button>;
}
