import { useEffect, useState } from "react";
import { api } from "../api";
import type { Decision, DevPack, Issue, Overview, Progress, Screen } from "../types";
import { btn, btnClaude, btnGhost, input } from "../ui";
import { Sheet } from "./DocView";
import { archPrompt } from "./GuideCard";
import { IconClose } from "./Icons";

type Common = {
  /** Muda a cada alteração no projeto, para recarregar. */
  refreshKey: string;
  busy: boolean;
  claudeEnabled: boolean;
  onOpen: (path: string) => void;
  onAsk: (prompt: string, file?: string | null) => void;
};

function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(
      (d) => alive && (setData(d), setError(null)),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error };
}

const Title = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="mb-6">
    <h1 className="text-[26px] font-semibold leading-tight text-ink">{children}</h1>
    {sub && <p className="mt-1 text-[13.5px] text-ink-2">{sub}</p>}
  </div>
);

const STAGE_TONE: Record<string, string> = {
  Ideia: "bg-wash text-ink-2",
  Entendida: "bg-wash text-ink-2",
  Detalhada: "bg-accent-soft text-accent",
  "Pronta para dev": "bg-claude-soft text-claude",
  "Em desenvolvimento": "bg-mark-soft text-mark-ink",
  Concluída: "bg-add-soft text-add",
  Cancelada: "bg-wash text-ink-3",
};

export const StageChip = ({ stage }: { stage: string }) => (
  <span className={`inline-flex h-[20px] items-center rounded-full px-2 text-[11px] font-medium ${STAGE_TONE[stage] ?? "bg-wash text-ink-2"}`}>{stage}</span>
);

function Bar({ p }: { p: Progress | null }) {
  if (!p) return <span className="text-xs text-ink-3">não criado</span>;
  return (
    <div className="flex items-center gap-2" title={p.steps.join(" → ")}>
      <div className="flex gap-0.5" aria-hidden="true">
        {p.steps.map((s, i) => (
          <span key={s} className={`h-1.5 w-6 rounded-full ${i < p.reached ? "bg-accent" : i === p.reached ? "bg-accent/35" : "bg-line"}`} />
        ))}
      </div>
      <span className="text-xs text-ink-2">{p.current ? `${p.current}` : "completo"}</span>
    </div>
  );
}

/* ------------------------------------------------------------ Visão geral */

export function OverviewScreen(p: Common) {
  const { data, error } = useLoad(api.overview, p.refreshKey);
  if (error) return <Sheet><p className="text-sm text-danger">{error}</p></Sheet>;
  if (!data) return <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>;
  const o: Overview = data;
  const stat = (n: number, label: string, tone = "text-ink") => (
    <div className="rounded-xl border border-line/70 px-4 py-3">
      <div className={`text-[24px] font-semibold tabular-nums leading-none ${tone}`}>{n}</div>
      <div className="mt-1.5 text-xs text-ink-2">{label}</div>
    </div>
  );
  return (
    <Sheet wide>
      <div data-testid="overview">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Title sub="Onde o projeto está e o que fazer a seguir.">{o.name}</Title>
          <button
            className={btnClaude}
            disabled={p.busy || !p.claudeEnabled}
            title="O Claude lê tudo e aponta o que ninguém disse mas provavelmente importa. Não altera nenhum arquivo."
            onClick={() => p.onAsk('Revisão de lacunas.\nSiga a seção "Revisão de lacunas" do CLAUDE.md: leia todo o projeto, aponte o que está faltando e não altere nenhum arquivo.', "docs/CONCEITO.md")}
          >
            O que estou esquecendo?
          </button>
        </div>

        {o.concept && o.concept.current !== null && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-claude/30 bg-claude-soft px-5 py-4" data-testid="start-here">
            <div>
              <div className="text-[15px] font-semibold text-ink">O Conceito ainda está incompleto</div>
              <p className="mt-0.5 text-[13.5px] text-ink-2">O Claude conduz uma entrevista: você conta a ideia, ele pergunta o que falta, monta o Conceito e sugere os módulos.</p>
            </div>
            <button
              className={btnClaude}
              disabled={p.busy || !p.claudeEnabled}
              onClick={() => p.onAsk('Abertura do projeto: docs/CONCEITO.md.\nSiga a seção "Abertura do projeto" do CLAUDE.md: conduza o Conceito inteiro, uma pergunta por vez, gravando cada resposta.', "docs/CONCEITO.md")}
            >
              Começar a entrevista de abertura
            </button>
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {stat(o.counts.modules, "módulos")}
          {stat(o.counts.features, "features")}
          {stat(o.counts.decisionsOpen, "decisões abertas", o.counts.decisionsOpen ? "text-mark-ink" : "text-ink")}
          {stat(o.counts.doubts, "dúvidas em aberto", o.counts.doubts ? "text-mark-ink" : "text-ink")}
          {stat(o.counts.issues, "problemas", o.counts.errors ? "text-danger" : "text-ink")}
        </div>

        <section className="mb-8" data-testid="arch-section">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Arquitetura</h2>
            <button
              className={btnClaude}
              disabled={p.busy || !p.claudeEnabled}
              title="O Claude propõe o desenho a partir da spec e pergunta uma coisa por vez. Cria os arquivos de docs/arquitetura se ainda não existirem."
              onClick={() => p.onAsk(archPrompt(o.architecture.guide, o.architecture.warnings), "docs/arquitetura/visao.md")}
            >
              {o.architecture.started ? "Continuar a entrevista de arquitetura" : "Entrevista de arquitetura"}
            </button>
          </div>
          {o.architecture.started ? (
            <div className="space-y-3 rounded-xl border border-line/70 px-4 py-3">
              <Bar p={o.architecture.guide} />
              {o.architecture.services.length > 0 && (
                <ul className="divide-y divide-line/60 text-[13.5px]">
                  {o.architecture.services.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
                      <button className="text-left text-ink hover:underline" onClick={() => p.onOpen(s.path)}>
                        <span className="font-mono text-xs text-ink-3">{s.id}</span> {s.name}
                        {s.modules.length > 0 && <span className="ml-2 text-xs text-ink-3">cobre {s.modules.join(", ")}</span>}
                      </button>
                      <Bar p={s.guide} />
                    </li>
                  ))}
                </ul>
              )}
              {o.architecture.uncovered.length > 0 && <p className="text-xs text-mark-ink">Sem serviço: {o.architecture.uncovered.join(", ")}</p>}
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-2">Ainda não iniciada. Você pode começar a qualquer momento.</p>
          )}
          {o.architecture.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-mark-ink" data-testid="arch-warnings">
              {o.architecture.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Próximos passos</h2>
          {o.next.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">Nada pendente. O projeto está em dia.</p>
          ) : (
            <ul className="divide-y divide-line/60 rounded-xl border border-line/70">
              {o.next.map((n, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="text-ink">{n.text}</span>
                  {n.path && (
                    <button className={btnGhost} onClick={() => p.onOpen(n.path!)}>
                      Abrir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Base do projeto</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {([["Conceito", "docs/CONCEITO.md", o.concept], ["Matriz de permissões", "docs/permissoes.md", o.matrix]] as const).map(([label, path, g]) => (
              <button key={path} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3 text-left hover:border-line-strong" onClick={() => p.onOpen(path)}>
                <span className="text-[13.5px] font-medium text-ink">{label}</span>
                <Bar p={g} />
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Módulos e features</h2>
            <div className="flex flex-wrap gap-1.5">
              {o.stages.map((s) => (
                <span key={s.stage} className="flex items-center gap-1">
                  <StageChip stage={s.stage} />
                  <span className="text-xs tabular-nums text-ink-2">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
          {o.modules.length === 0 && o.orphans.length === 0 && <p className="text-[13.5px] text-ink-2">Ainda não há módulos nem features.</p>}
          <div className="space-y-3">
            {o.modules.map((m) => (
              <div key={m.id} className="rounded-xl border border-line/70">
                <button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left" onClick={() => p.onOpen(m.path)}>
                  <span className="text-[13.5px] font-medium text-ink">
                    {m.id} · {m.name}
                  </span>
                  <Bar p={m.guide} />
                </button>
                {m.features.length > 0 && (
                  <ul className="divide-y divide-line/60 border-t border-line/60">
                    {m.features.map((f) => (
                      <FeatureRow key={f.id} f={f} onOpen={p.onOpen} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {o.orphans.length > 0 && (
              <div className="rounded-xl border border-line/70">
                <div className="px-4 py-2.5 text-[13.5px] font-medium text-ink">Sem módulo</div>
                <ul className="divide-y divide-line/60 border-t border-line/60">
                  {o.orphans.map((f) => (
                    <FeatureRow key={f.id} f={f} onOpen={p.onOpen} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function FeatureRow({ f, onOpen }: { f: Overview["orphans"][number]; onOpen: (p: string) => void }) {
  return (
    <li>
      <button className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-wash" onClick={() => onOpen(f.path)}>
        <span className="min-w-0 truncate text-[13px] text-ink">
          {f.id} · {f.name}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {f.doubts > 0 && <span className="text-xs text-mark-ink">{f.doubts} {f.doubts === 1 ? "dúvida" : "dúvidas"}</span>}
          <StageChip stage={f.stage} />
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------ Problemas */

export function IssuesScreen(p: Common) {
  const { data, error } = useLoad(api.issues, p.refreshKey);
  if (error) return <Sheet><p className="text-sm text-danger">{error}</p></Sheet>;
  if (!data) return <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>;
  const issues: Issue[] = data;
  return (
    <Sheet wide>
      <div data-testid="issues">
        <Title sub="Pontos em que os documentos se contradizem ou estão incompletos.">Problemas do projeto</Title>
        {issues.length === 0 ? (
          <p className="rounded-xl border border-line/70 px-4 py-6 text-center text-[13.5px] text-ink-2">Nenhum problema encontrado. Conceito, módulos, features e permissões estão consistentes.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((i) => (
              <li key={i.id} className="flex items-start gap-3 rounded-xl border border-line/70 px-4 py-3" data-testid="issue">
                <span
                  className={`mt-[3px] inline-flex h-[20px] shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${i.severity === "erro" ? "bg-danger-soft text-danger" : "bg-mark-soft text-mark-ink"}`}
                >
                  {i.severity === "erro" ? "Erro" : "Aviso"}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[13.5px] leading-snug text-ink">{i.message}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {i.files.map((f) => (
                      <button key={f} className="rounded-md bg-wash px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:text-ink" onClick={() => p.onOpen(f)}>
                        {f.replace(/^docs\//, "")}
                      </button>
                    ))}
                  </div>
                </div>
                <button className={`${btnClaude} shrink-0`} disabled={p.busy || !p.claudeEnabled} onClick={() => p.onAsk(i.fix, i.files[0])}>
                  Corrigir com o Claude
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ Decisões */

const DEC_TONE: Record<string, string> = { aberta: "bg-mark-soft text-mark-ink", discuss: "bg-accent-soft text-accent", decidida: "bg-add-soft text-add", substitu: "bg-wash text-ink-3" };
const decTone = (s: string) => Object.entries(DEC_TONE).find(([k]) => s.toLowerCase().includes(k))?.[1] ?? "bg-wash text-ink-2";

export function DecisionsScreen(p: Common) {
  const { data, error } = useLoad(api.decisions, p.refreshKey);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  if (error) return <Sheet><p className="text-sm text-danger">{error}</p></Sheet>;
  if (!data) return <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>;
  const list: Decision[] = [...data].sort((a, b) => {
    const open = (d: Decision) => (/aberta|discuss/i.test(d.status) ? 0 : 1);
    return open(a) - open(b) || b.id.localeCompare(a.id);
  });
  const nextId = `D-${String(Math.max(0, ...data.map((d) => Number(d.id.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet wide>
      <div data-testid="decisions">
        <div className="flex items-start justify-between gap-3">
          <Title sub="O que foi decidido e o que ainda falta decidir.">Decisões</Title>
          <button className={btnClaude} disabled={p.busy || !p.claudeEnabled} onClick={() => setAdding((v) => !v)}>
            Nova decisão
          </button>
        </div>
        {adding && (
          <div className="mb-5 space-y-2.5 rounded-xl border border-line bg-sheet p-4 shadow-lift">
            <label className="block space-y-1">
              <span className="text-xs text-ink-2">Qual é a pergunta a decidir?</span>
              <input className={input} value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Ex.: Qual gateway de pagamento usar?" />
            </label>
            <div className="flex justify-end gap-2">
              <button className={btn} onClick={() => setAdding(false)}>
                Cancelar
              </button>
              <button
                className={btnClaude}
                disabled={!q.trim()}
                onClick={() => {
                  p.onAsk(`Registre em docs/decisoes.md a decisão ${nextId} — "${q.trim()}" com status Aberta, no formato da seção "Decisões" do CLAUDE.md. Pergunte-me o contexto, as opções, o que afeta e o prazo, uma pergunta por vez.`, "docs/decisoes.md");
                  setQ("");
                  setAdding(false);
                }}
              >
                Pedir ao Claude
              </button>
            </div>
          </div>
        )}
        {list.length === 0 ? (
          <p className="rounded-xl border border-line/70 px-4 py-6 text-center text-[13.5px] text-ink-2">Nenhuma decisão registrada. Quando surgir uma pergunta que bloqueia o projeto, registre aqui.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((d) => {
              const open = /aberta|discuss/i.test(d.status);
              const late = open && d.deadline && d.deadline < today;
              const isOpen = openId === d.id;
              return (
                <li key={d.id} className="rounded-xl border border-line/70" data-testid="decision">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenId(isOpen ? null : d.id)} aria-expanded={isOpen}>
                    <span className="font-mono text-xs text-ink-3">{d.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{d.title}</span>
                    {d.affects.length > 0 && <span className="hidden text-xs text-ink-3 md:inline">{d.affects.join(", ")}</span>}
                    {late && <span className="text-xs font-medium text-danger">vencida</span>}
                    <span className={`inline-flex h-[20px] shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${decTone(d.status)}`}>{d.status}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-line/60 px-4 py-3 text-[13.5px] leading-snug text-ink-2">
                      {d.context && <p><span className="font-medium text-ink">Contexto.</span> {d.context}</p>}
                      {d.options.length > 0 && (
                        <div>
                          <div className="font-medium text-ink">Opções</div>
                          <ol className="ml-4 list-decimal space-y-0.5">{d.options.map((o, i) => <li key={i}>{o}</li>)}</ol>
                        </div>
                      )}
                      {d.decision && <p><span className="font-medium text-ink">Decisão.</span> {d.decision}{d.decidedOn && ` (${d.decidedOn}${d.decidedBy ? `, ${d.decidedBy}` : ""})`}</p>}
                      {d.deadline && <p><span className="font-medium text-ink">Prazo.</span> {d.deadline}{d.decider && ` · decide: ${d.decider}`}</p>}
                      {d.history.length > 0 && (
                        <div>
                          <div className="font-medium text-ink">Histórico</div>
                          <ul className="ml-4 list-disc space-y-0.5">{d.history.map((h, i) => <li key={i}>{h}</li>)}</ul>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        {open && (
                          <button className={btnClaude} disabled={p.busy || !p.claudeEnabled} onClick={() => p.onAsk(`Vamos decidir ${d.id} — "${d.title}" em docs/decisoes.md. Resuma as opções, ajude-me a escolher e, quando eu decidir, registre a decisão, a data e quem decidiu, mude o status para Decidida e atualize as specs afetadas (${d.affects.join(", ") || "veja o campo Afeta"}). Nunca apague o histórico.`, "docs/decisoes.md")}>
                            Decidir com o Claude
                          </button>
                        )}
                        <button className={btn} onClick={() => p.onOpen("docs/decisoes.md")}>
                          Abrir o arquivo
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

export const SCREEN_LABEL: Record<Screen, string> = { overview: "Visão geral", issues: "Problemas", decisions: "Decisões" };

/* ------------------------------------------------------------ Pacote para dev */

export function DevPackModal({ featureId, onClose }: { featureId: string; onClose: () => void }) {
  const { data, error } = useLoad<DevPack>(() => api.devpack(featureId), featureId);
  const [tab, setTab] = useState<"pack" | "tests">("pack");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const text = data ? (tab === "pack" ? data.markdown : data.testPlan) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem permissão da área de transferência */
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    a.download = `${featureId}-${tab === "pack" ? "pacote" : "testes"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" role="dialog" aria-modal="true" aria-label="Pacote para desenvolvimento" data-testid="devpack">
      <div className="flex max-h-full w-full max-w-[860px] flex-col rounded-2xl border border-line bg-sheet shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
          <div>
            <div className="text-[15px] font-semibold text-ink">{data ? data.title : featureId}</div>
            <div className="text-xs text-ink-3">Cole no Claude Code (ou em outra IA) para implementar a feature.</div>
          </div>
          <button className="rounded-md p-1 text-ink-2 hover:bg-wash" onClick={onClose} aria-label="Fechar">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-5 py-4 text-sm text-danger">{error}</p>}
        {data && (
          <>
            {data.warnings.length > 0 && (
              <ul className="mx-5 mt-3 space-y-0.5 rounded-lg bg-mark-soft px-3 py-2 text-xs text-mark-ink">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}
            <div className="flex items-center justify-between gap-3 px-5 pt-3">
              <div role="tablist" className="flex gap-1">
                {(["pack", "tests"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-7 rounded-lg px-3 text-xs font-medium ${tab === t ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-wash"}`}>
                    {t === "pack" ? "Pacote completo" : "Plano de testes"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button className={btn} onClick={download}>Baixar .md</button>
                <button className={btnClaude} onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
              </div>
            </div>
            <pre className="m-5 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-line/70 bg-wash/40 p-4 font-mono text-[12px] leading-relaxed text-ink" data-testid="devpack-text">{text}</pre>
          </>
        )}
      </div>
    </div>
  );
}
