import type { Guide } from "../types";
import { btnClaude } from "../ui";

type Props = {
  path: string;
  guide: Guide;
  busy: boolean;
  claudeEnabled: boolean;
  onContinue: (prompt: string) => void;
};

/** O pedido que abre (ou retoma) a entrevista da etapa atual. */
export function interviewPrompt(path: string, guide: Guide): string {
  const falta = guide.missing.map((m) => m.label).join("; ");
  return (
    `Entrevista guiada: etapa "${guide.current}" de ${path}.\n` +
    `Falta: ${falta}.\n` +
    `Siga a seção "Entrevista guiada" do CLAUDE.md: uma pergunta por vez, gravando cada resposta no arquivo.`
  );
}

function Steps({ guide }: { guide: Guide }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label="Etapas">
      {guide.steps.map((name, i) => {
        const done = i < guide.reached;
        const now = i === guide.reached;
        return (
          <li key={name} className="flex items-center gap-1" aria-current={now ? "step" : undefined}>
            {i > 0 && <span className={`mx-1 h-px w-4 ${done ? "bg-accent/50" : "bg-line"}`} aria-hidden="true" />}
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                done ? "bg-accent text-accent-ink" : now ? "border-[1.5px] border-accent text-accent" : "border border-line-strong text-ink-3"
              }`}
              aria-hidden="true"
            >
              {done ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.25l2.25 2.25 4.75-5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-xs ${now ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function GuideCard({ path, guide, busy, claudeEnabled, onContinue }: Props) {
  const finished = guide.current === null;
  const review = guide.missing.length === 1 && guide.missing[0].id === "revisao";
  return (
    <div className="mx-auto max-w-[780px] px-2 pb-3 xl:px-4" data-testid="guide-card">
      <section className="space-y-3 rounded-2xl border border-line/70 bg-panel px-5 py-4 shadow-[var(--shadow-panel)]">
        <Steps guide={guide} />
        {finished ? (
          <p className="text-[13px] text-ink-2">
            {guide.status ? (
              <>
                Situação: <span className="font-medium text-ink">{guide.status}</span>
              </>
            ) : (
              "Todas as etapas estão completas."
            )}
          </p>
        ) : (
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Próximo passo · {guide.current}</div>
              <ul className="space-y-0.5 text-[13.5px] leading-snug text-ink">
                {guide.missing.map((m) => (
                  <li key={m.id} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
                    {m.label}
                  </li>
                ))}
              </ul>
            </div>
            <button
              className={`${btnClaude} shrink-0`}
              disabled={busy || !claudeEnabled}
              title={!claudeEnabled ? "Defina ANTHROPIC_API_KEY no .env" : "O Claude faz uma pergunta por vez e grava as respostas no arquivo"}
              onClick={() => onContinue(interviewPrompt(path, guide))}
            >
              {review ? "Revisar com o Claude" : "Continuar com o Claude"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
