# Arquitetura

Aqui fica o desenho técnico do projeto: como o sistema é dividido, onde roda e que metas de qualidade precisa cumprir. Nasce da spec (Conceito, módulos, features, decisões) e cresce por etapas, como o resto da documentação.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `visao.md` | Contexto e restrições, estilo de arquitetura, diagrama de componentes (Mermaid) |
| `servicos/SVxx-nome.md` | Um arquivo por serviço: responsabilidade, módulos que cobre, stack, dados, API, dependências, implantação |
| `dados-e-integracoes.md` | Entidades e dono de cada uma; integrações externas |
| `infraestrutura.md` | Ambientes, hospedagem, implantação (CI/CD) |
| `requisitos-nao-funcionais.md` | Metas mensuráveis (`RNF-01`…) |

## IDs

- `SV01` serviço · `RNF-01` requisito não funcional. Nunca renumere nem reaproveite.
- Módulos são citados por `M01`. Cada módulo deve ser coberto por exatamente um serviço (seção "Módulos que cobre").
- Se o projeto for um sistema só, crie um único serviço (`SV01`) que cobre todos os módulos.

## Etapas do projeto

| Etapa | Fica completa quando há |
|---|---|
| Contexto | `visao.md` com "Contexto e restrições" e "Estilo de arquitetura" |
| Serviços | Ao menos um serviço, com stack (linguagem e framework) em cada um, diagrama Mermaid em "Componentes" e todos os módulos cobertos |
| Dados e integrações | "Dados" e "Integrações" (ou a declaração de que não há) |
| Infraestrutura | "Ambientes", "Hospedagem" e "Implantação" |
| Qualidade | Ao menos um requisito não funcional, com meta e forma de medir |

Etapas de um serviço: **Ideia** (Responsabilidade, Módulos que cobre) → **Definido** (Stack com `Linguagem:` e `Framework:`, Dados próprios) → **Detalhado** (API e contratos, Dependências, Implantação, sem dúvidas em aberto).

## Entrevista de arquitetura

Quando o pedido começar com "Entrevista de arquitetura":

1. Leia a spec (Conceito, módulos, features, decisões) e os arquivos desta pasta. Descubra a primeira pendência.
2. Antes de perguntar, **proponha**: a partir dos módulos e do contexto, sugira um estilo, a divisão em serviços e um diagrama. O usuário confirma ou ajusta.
3. Faça **uma pergunta por vez**, curta e concreta. A stack é escolhida pelo usuário, **serviço a serviço**; sugira opções, nunca imponha.
4. Grave cada resposta no arquivo e na seção certos, com as palavras do usuário. Em "Stack", use linhas `- Linguagem: …`, `- Framework: …`, `- Banco: …`, `- Testes: …`.
5. Crie serviços copiando `docs/_templates/servico.md` para `servicos/SVxx-nome.md` (próximo número livre).
6. Diagramas ficam em blocos ` ```mermaid ` dentro do Markdown, na seção "Componentes" de `visao.md`. Todo serviço deve aparecer nele.
7. Se o usuário não souber, anote em "Dúvidas em aberto" e siga. Decisões que afetam a spec inteira viram entrada em `docs/decisoes.md`.
8. Ao fechar uma etapa, diga qual fechou e pergunte se segue para a próxima.
