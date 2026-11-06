import { useCallback, useEffect, useRef, useState } from "react";

/** Largura de um painel, lembrada entre sessões. */
export function usePaneWidth(key: string, initial: number, min: number, max: number) {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max]);
  const [width, setWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(`spec-studio.${key}`));
      return v ? Math.min(max, Math.max(min, v)) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`spec-studio.${key}`, String(width));
    } catch {
      /* só vale nesta sessão */
    }
  }, [key, width]);
  return { width, set: (n: number) => setWidth(clamp(n)), reset: () => setWidth(initial), min, max };
}

type Props = {
  pane: ReturnType<typeof usePaneWidth>;
  /** "right": o painel fica à esquerda da alça (arrastar para a direita aumenta). "left": o painel fica à direita. */
  grows: "right" | "left";
  label: string;
  testId?: string;
};

/** Alça fina entre dois painéis: arrastar, setas do teclado ou duplo clique para voltar ao padrão. */
export function Resizer({ pane, grows, label, testId }: Props) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  const sign = grows === "right" ? 1 : -1;

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => pane.set(start.current.w + sign * (e.clientX - start.current.x));
    const up = () => setDragging(false);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, pane, sign]);

  return (
    // largura de layout 0 e margem -12px: a alça ocupa exatamente o vão de 12px entre os painéis
    <div className="relative z-10 -ml-3 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={pane.width}
        aria-valuemin={pane.min}
        aria-valuemax={pane.max}
        tabIndex={0}
        data-testid={testId}
        title="Arraste para ajustar a largura (duplo clique restaura)"
        className="group absolute inset-y-0 left-0 flex w-3 cursor-col-resize justify-center outline-none"
        onPointerDown={(e) => {
          e.preventDefault();
          start.current = { x: e.clientX, w: pane.width };
          setDragging(true);
        }}
        onDoubleClick={pane.reset}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 48 : 16;
          if (e.key === "ArrowLeft") pane.set(pane.width - sign * step);
          else if (e.key === "ArrowRight") pane.set(pane.width + sign * step);
          else if (e.key === "Home") pane.reset();
          else return;
          e.preventDefault();
        }}
      >
        <span className={`my-3 w-0.5 rounded-full transition-colors ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-line-strong group-focus-visible:bg-accent"}`} aria-hidden="true" />
      </div>
    </div>
  );
}
