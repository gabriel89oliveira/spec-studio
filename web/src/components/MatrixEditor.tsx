import { useEffect, useState } from "react";
import { api } from "../api";
import { conceptProfiles, isFixed, readMatrix, writeMatrix, type MatrixTable } from "../matrix";
import { btn, btnPrimary, input } from "../ui";
import { Sheet } from "./DocView";
import { IconClose } from "./Icons";

type Props = {
  content: string;
  disabled: boolean;
  onSave: (content: string) => Promise<boolean>;
};

const CELL = ["", "S", "N", "C"];
const cellTone: Record<string, string> = { S: "bg-add-soft text-add", N: "bg-wash text-ink-3", C: "bg-mark-soft text-mark-ink" };

/** Tabela de permissões editável: perfis nas colunas, ações nas linhas, S/N/C nas células. */
export function MatrixEditor({ content, disabled, onSave }: Props) {
  const [t, setT] = useState<MatrixTable>(() => readMatrix(content));
  const [dirty, setDirty] = useState(false);
  const [mods, setMods] = useState<string[]>([]);
  const [conceito, setConceito] = useState<string[]>([]);
  const [newProfile, setNewProfile] = useState("");

  useEffect(() => {
    if (!dirty) setT(readMatrix(content));
  }, [content, dirty]);
  useEffect(() => {
    api.overview().then((o) => setMods(o.modules.map((m) => m.id)), () => {});
    api.file("docs/CONCEITO.md").then((d) => setConceito(conceptProfiles(d.content)), () => {});
  }, []);

  const change = (fn: (x: MatrixTable) => MatrixTable) => {
    setT((cur) => fn(structuredClone(cur)));
    setDirty(true);
  };
  const profIdx = t.header.map((h, i) => (isFixed(h) ? -1 : i)).filter((i) => i >= 0);
  const colOf = (name: string) => t.header.findIndex((h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === name);

  const addProfile = (name: string) =>
    change((x) => {
      const n = name.trim();
      if (!n || x.header.some((h) => h.toLowerCase() === n.toLowerCase())) return x;
      const at = colOf("condicao") >= 0 ? x.header.findIndex((h) => /^condi/i.test(h)) : x.header.length;
      x.header.splice(at, 0, n);
      x.rows.forEach((r) => r.splice(at, 0, ""));
      return x;
    });
  const missingFromConcept = conceito.filter((p) => !t.header.some((h) => h.toLowerCase() === p.toLowerCase()));

  const save = async () => {
    if (await onSave(writeMatrix(content, t))) setDirty(false);
  };

  return (
    <Sheet wide>
      <div data-testid="matrix-editor" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight text-ink">Matriz de permissões</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">
              <b className="font-semibold">S</b> pode · <b className="font-semibold">N</b> não pode · <b className="font-semibold">C</b> pode, com condição (explique na coluna Condição).
            </p>
          </div>
          <div className="flex gap-2">
            {dirty && (
              <button className={btn} disabled={disabled} onClick={() => (setT(readMatrix(content)), setDirty(false))}>
                Descartar
              </button>
            )}
            <button className={btnPrimary} disabled={disabled || !dirty} onClick={save}>
              Salvar matriz
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line/70">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-wash/60 text-left text-xs text-ink-2">
                {t.header.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-2 font-semibold">
                    <span className="flex items-center gap-1">
                      {h}
                      {!isFixed(h) && (
                        <button
                          className="rounded p-0.5 text-ink-3 hover:bg-line/60 hover:text-danger"
                          title={`Remover o perfil ${h}`}
                          aria-label={`Remover o perfil ${h}`}
                          onClick={() => change((x) => (x.header.splice(i, 1), x.rows.forEach((r) => r.splice(i, 1)), x))}
                        >
                          <IconClose className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-line/60" data-testid="matrix-row">
                  {t.header.map((h, ci) => (
                    <td key={ci} className="px-1.5 py-1.5">
                      {profIdx.includes(ci) ? (
                        <select
                          className={`h-[26px] w-[52px] rounded-md border border-line px-1 text-center text-xs font-semibold ${cellTone[r[ci]] ?? "bg-sheet text-ink-3"}`}
                          value={r[ci]}
                          aria-label={`${r[0] || "Ação"} — ${h}`}
                          onChange={(e) => change((x) => ((x.rows[ri][ci] = e.target.value), x))}
                        >
                          {CELL.map((c) => (
                            <option key={c} value={c}>
                              {c || "—"}
                            </option>
                          ))}
                        </select>
                      ) : /^m[oó]dulo$/i.test(h) && mods.length > 0 ? (
                        <select className={`${input} !h-[28px] !w-[78px] !px-1.5 !py-0 !text-xs`} value={r[ci]} aria-label={`Módulo de ${r[0] || "ação"}`} onChange={(e) => change((x) => ((x.rows[ri][ci] = e.target.value), x))}>
                          <option value="" />
                          {mods.map((m) => <option key={m}>{m}</option>)}
                          {r[ci] && !mods.includes(r[ci]) && <option>{r[ci]}</option>}
                        </select>
                      ) : (
                        <input
                          className={`${input} !h-[28px] !px-2 !py-0 !text-[13px]`}
                          value={r[ci]}
                          aria-label={`${h} da linha ${ri + 1}`}
                          placeholder={ci === 0 ? "Ex.: Criar ordem de serviço" : ""}
                          onChange={(e) => change((x) => ((x.rows[ri][ci] = e.target.value), x))}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-1">
                    <button className="rounded p-1 text-ink-3 hover:bg-wash hover:text-danger" aria-label={`Remover a linha ${ri + 1}`} onClick={() => change((x) => (x.rows.splice(ri, 1), x))}>
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {t.rows.length === 0 && (
                <tr>
                  <td colSpan={t.header.length + 1} className="px-3 py-5 text-center text-xs text-ink-3">
                    Nenhuma ação ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => change((x) => (x.rows.push(x.header.map(() => "")), x))}>
            + Ação
          </button>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <input
            className={`${input} !h-[30px] !w-[170px] !py-0 !text-xs`}
            placeholder="Novo perfil"
            value={newProfile}
            onChange={(e) => setNewProfile(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (addProfile(newProfile), setNewProfile(""));
            }}
          />
          <button className={btn} disabled={!newProfile.trim()} onClick={() => (addProfile(newProfile), setNewProfile(""))}>
            + Perfil
          </button>
          {missingFromConcept.length > 0 && (
            <button className={btn} onClick={() => missingFromConcept.forEach(addProfile)} title={missingFromConcept.join(", ")}>
              Trazer {missingFromConcept.length === 1 ? "o perfil" : `os ${missingFromConcept.length} perfis`} do Conceito
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
