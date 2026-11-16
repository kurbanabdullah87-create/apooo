import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Camera, Mic, Square, Pen, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import type { WorkRecord, Payload } from "@/lib/work";
import { Input } from "@/components/ui/input";
export function MediaTools({
  record,
  onSave,
  readOnly = false,
}: {
  record: WorkRecord;
  onSave: (p: Payload) => Promise<unknown>;
  readOnly?: boolean;
}) {
  const me = useMe();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sign, setSign] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const field = useRef("before");
  useEffect(() => {
    let alive = true;
    async function load() {
      const result: Record<string, string> = {};
      for (const key of ["before", "after", "audio", "signature", "warranty"]) {
        const path = record.payload[key];
        if (path) {
          const { data } = await supabase.storage
            .from("saha-media")
            .createSignedUrl(String(path), 3600);
          if (data) result[key] = data.signedUrl;
        }
      }
      if (alive) setUrls(result);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [record.payload]);
  useEffect(() => {
    if (sign && canvas.current) {
      const c = canvas.current;
      c.width = c.clientWidth * devicePixelRatio;
      c.height = 180 * devicePixelRatio;
      c.getContext("2d")?.scale(devicePixelRatio, devicePixelRatio);
      pad.current = new SignaturePad(c, { penColor: getComputedStyle(c).color });
    }
    return () => pad.current?.off();
  }, [sign]);
  useEffect(
    () => () => {
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function upload(blob: Blob, key: string) {
    if (!me.data?.profile) return;
    setBusy(true);
    try {
      const path = `${me.data.profile.team_id}/${record.id}/${key}-${crypto.randomUUID()}`;
      const { error } = await supabase.storage
        .from("saha-media")
        .upload(path, blob, { contentType: blob.type });
      if (error) throw error;
      await onSave({ ...record.payload, [key]: path });
      setSign(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Medya kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }
  async function audio() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        void upload(new Blob(chunks, { type: rec.mimeType }), "audio");
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Mikrofon izni verilmedi veya cihaz desteklemiyor.");
    }
  }
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {(record.kind === "equipment" ? ["warranty"] : ["before", "after"]).map((k) => (
            <Button
              key={k}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                field.current = k;
                input.current?.click();
              }}
            >
              <Camera />
              {k === "before" ? "Öncesi" : k === "after" ? "Sonrası" : "Garanti"}
            </Button>
          ))}
          {record.kind === "job" && (
            <>
              <Button variant="outline" size="sm" onClick={() => void audio()} disabled={busy}>
                {recording ? <Square /> : <Mic />}
                {recording ? "Durdur" : "Ses"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSign(!sign)}>
                <Pen />
                İmza
              </Button>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            ref={input}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, field.current);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {sign && (
        <div className="space-y-2">
          <canvas
            ref={canvas}
            className="h-[180px] w-full touch-none rounded-md border bg-secondary text-foreground"
          />
          <Button
            variant="ghost"
            size="icon"
            title="İmzayı temizle"
            onClick={() => pad.current?.clear()}
          >
            <Trash2 />
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!pad.current || pad.current.isEmpty()) return;
              const blob = await (await fetch(pad.current.toDataURL())).blob();
              await upload(blob, "signature");
            }}
          >
            <Save />
            İmzayı kaydet
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(urls)
          .filter(([k]) => k !== "audio")
          .map(([key, url]) => (
            <figure key={key}>
              <img
                className="aspect-video w-full rounded-md object-contain bg-secondary"
                src={url}
                alt={
                  key === "before"
                    ? "Öncesi"
                    : key === "after"
                      ? "Sonrası"
                      : key === "signature"
                        ? "Müşteri imzası"
                        : "Garanti belgesi"
                }
              />
              <figcaption className="text-xs text-muted-foreground">
                {key === "before"
                  ? "Öncesi"
                  : key === "after"
                    ? "Sonrası"
                    : key === "signature"
                      ? "İmza"
                      : "Garanti"}
              </figcaption>
            </figure>
          ))}
      </div>
      {urls["audio"] && <audio controls src={urls["audio"]} className="w-full" />}
    </div>
  );
}

/** Receipt image uploader for finance records. Files remain in the private saha-media bucket. */
export function ReceiptPhotoField({ recordId, value, onChange }: { recordId: string; value?: string | null; onChange: (path: string | null) => void }) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (value) void supabase.storage.from("saha-media").createSignedUrl(value, 3600).then(({ data }) => { if (alive) setSignedUrl(data?.signedUrl ?? ""); });
    else setSignedUrl("");
    return () => { alive = false; };
  }, [value]);
  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Fiş için resim dosyası seçin.");
    if (file.size > 10 * 1024 * 1024) return void toast.error("Fiş fotoğrafı 10 MB'dan küçük olmalı.");
    const teamId = me.data?.profile?.team_id;
    if (!teamId) return void toast.error("Ekip bilgisi alınamadı.");
    const path = `${teamId}/${recordId}/receipt-${crypto.randomUUID()}`;
    setBusy(true);
    try {
      const { error } = await supabase.storage.from("saha-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(path); toast.success("Fiş fotoğrafı güvenli depoya yüklendi.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Fiş yüklenemedi."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-medium">Fiş / fatura fotoğrafı</p><p className="text-xs text-muted-foreground">Özel depoda saklanır, yalnız ekip üyeleri açabilir.</p></div><Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><Camera/>{busy ? "Yükleniyor…" : value ? "Değiştir" : "Fotoğraf ekle"}</Button></div><Input ref={input} className="hidden" type="file" accept="image/*" capture="environment" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}/>{signedUrl && <img src={signedUrl} alt="Yüklenen fiş" className="max-h-56 w-full rounded-lg border object-contain"/>}{value && <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}><Trash2/>Fiş fotoğrafını kaldır</Button>}</div>;
}
