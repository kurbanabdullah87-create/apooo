import { useRef, useState, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 96;

export function SwipeRow({ children, onDelete, onComplete, className }: { children: ReactNode; onDelete: () => void; onComplete?: () => void; className?: string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);
  const [dx, setDx] = useState(0);

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      <div className={`absolute inset-0 flex items-center px-5 text-white ${onComplete ? "justify-between bg-gradient-to-r from-emerald-600 via-emerald-600 to-destructive" : "justify-end bg-destructive"}`}>
        {onComplete ? <span className="flex items-center gap-2 text-xs font-semibold"><Check className="size-5"/>Tamamlandı</span> : <span/>}
        <span className="flex items-center gap-2 text-xs font-semibold">Arşivle <Trash2 className="size-5"/></span>
      </div>
      <div
        className="relative bg-card transition-transform duration-150"
        style={{ transform: `translateX(${dx}px)`, transitionDuration: start.current ? "0ms" : undefined }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
          horizontal.current = false;
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const mx = e.touches[0]!.clientX - start.current.x;
          const my = e.touches[0]!.clientY - start.current.y;
          if (!horizontal.current && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horizontal.current = true;
          if (horizontal.current) setDx(Math.max(-140, Math.min(onComplete ? 140 : 0, mx)));
        }}
        onTouchEnd={() => {
          start.current = null;
          if (dx < -THRESHOLD) onDelete();
          else if (dx > THRESHOLD && onComplete) onComplete();
          setDx(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
