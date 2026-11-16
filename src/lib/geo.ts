import type { Payload } from "@/lib/work";

export interface Coords { lat: number; lng: number }

export function distanceMeters(a: Coords, b: Coords) {
  const rad = (degree: number) => degree * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getPosition(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Konum desteklenmiyor"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      (e) => reject(new Error(e.code === 1 ? "Konum izni verilmedi" : "Konum alınamadı")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function coordsOf(p: Payload): Coords | null {
  if (p.lat == null || p.lng == null || p.lat === "" || p.lng === "") return null;
  const lat = Number(p.lat), lng = Number(p.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export const googleRoute = (c: Coords) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
export const yandexRoute = (c: Coords) => `https://yandex.com.tr/maps/?rtext=~${c.lat},${c.lng}&rtt=auto`;
