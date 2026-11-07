# Arquitetura

Aqui fica o desenho técnico do projeto: como o sistema é dividido, onde roda e que metas de qualidade precisa cumprir. Nasce da spec (Conceito, módulos, features, decisões) e cresce por etapas, como o resto da documentação.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `visao.md` | Contexto e restrições, estilo de arquitetura, diagrama de contexto e diagrama de componentes (Mermaid) |
| `servicos/SVxx-nome.md` | Um arquivo por serviço: responsabilidade, módulos que cobre, stack, dados, API, dependências, implantação |
| `modelo-de-dados.md` | Entidades (dono, campos, tipos), relações e diagrama ER em Mermaid |
| `dados-e-integracoes.md` | Integrações externas |
| `infraestrutura.md` | Ambientes, hospedagem, implantação (CI/CD), serviços por ambiente |
| `execucao.md` | Cenários: os fluxos principais passo a passo entre usuário, serviços e sistemas externos |
| `conceitos-transversais.md` | Segurança e acesso, registro e tratamento de erros (e o que mais valer para todos os serviços) |
| `requisitos-nao-funcionais.md` | Metas mensuráveis (`RNF-01`…) |
| `estrategia-de-testes.md` | Tipos de teste e ferramentas, dados de teste, cobertura mínima, como cada RNF é verificado |
| `riscos-e-divida.md` | Riscos técnicos e dívida conhecida |

## IDs

- `SV01` serviço · `RNF-01` requisito não funcional. Nunca renumere nem reaproveite.
- Módulos são citados por `M01`. Cada módulo deve ser coberto por exatamente um serviço (seção "Módulos que cobre").
- Se o projeto for um sistema só, crie um único serviço (`SV01`) que cobre todos os módulos.

## Etapas do projeto

| Etapa | Fica completa quando há |
|---|---|
| Contexto | `visao.md` com "Contexto e restrições", "Estilo de arquitetura" e diagrama Mermaid em "Contexto do sistema" |
| Serviços | Ao menos um serviço, com stack (linguagem e framework) em cada um, diagrama Mermaid em "Componentes" e todos os módulos cobertos |
| Dados e integrações | Em `modelo-de-dados.md`: entidades (cada uma com `- Dono: SVxx` e tabela de campos com tipo), relações e diagrama `erDiagram`; em `dados-e-integracoes.md`: "Integrações" (ou a declaração de que não há) |
| Infraestrutura | "Ambientes", "Hospedagem", "Implantação" e "Serviços por ambiente" (tabela serviço × ambiente) |
| Comportamento | Ao menos um cenário em `execucao.md` e as seções "Segurança e acesso" e "Registro e tratamento de erros" em `conceitos-transversais.md` |
| Qualidade | Ao menos um requisito não funcional (meta e forma de medir) e a estratégia de testes: tipos com ferramenta, dados de teste, cobertura mínima e um teste para cada RNF |
| Riscos | "Riscos" em `riscos-e-divida.md` (ou a declaração de que não há) |

Para quem conhece o arc42: Contexto ≈ seções 1 a 4, Serviços ≈ 5, Comportamento ≈ 6 e 8, Infraestrutura ≈ 7, decisões ≈ 9 (`docs/decisoes.md`), Qualidade ≈ 10, Riscos ≈ 11, glossário ≈ 12 (no Conceito).

Etapas de um serviço: **Ideia** (Responsabilidade, Módulos que cobre) → **Definido** (Stack com `Linguagem:` e `Framework:`, Dados próprios) → **Detalhado** (API e contratos em tabelas, Dependências, Implantação, sem dúvidas em aberto).

## Contratos de API

Em cada serviço, a seção "API e contratos" usa tabelas. Os agentes de código e de teste leem as mesmas linhas, por isso nada fica em prosa solta.

```
### Endpoints
| ID | Método | Caminho | Descrição | Quem acessa | Erros |
|---|---|---|---|---|---|
| EP-SV01-01 | POST | /ordens | Abre uma ordem de serviço | Gestor | 403 sem permissão; 422 veículo inexistente |

### Eventos
| ID | Evento | Quando é publicado | Campos | Consumido por |
|---|---|---|---|---|
| EV-SV01-01 | OrdemAberta | Ao abrir uma ordem | ordemId, veiculoId | SV02 |
```

IDs `EP-SVxx-nn` e `EV-SVxx-nn`, nunca renumerados. "Quem acessa" usa perfis do Conceito (ou "serviço"/"sistema" para chamadas internas). Todo endpoint lista os erros possíveis. Se o serviço não expõe nada, escreva "Não expõe API".

## Modelo de dados

Em `modelo-de-dados.md`, uma entidade por bloco:

```
### Ordem de serviço
- Dono: SV01
- Descrição: pedido de manutenção de um veículo

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| id | uuid | sim | gerado pelo sistema |
| status | texto | sim | aberta, em andamento, concluída (RN-01.2) |
```

Cada entidade tem um único serviço dono. "Relações" é uma tabela `De | Para | Cardinalidade | Descrição` com nomes de entidades que existem. "Diagrama" é um bloco ` ```mermaid ` com `erDiagram`.

## Estratégia de testes

Em `estrategia-de-testes.md`: "Tipos de teste" (tabela `Tipo | Ferramenta | O que cobre | Quando roda`, escolhida pela stack de cada serviço), "Dados de teste", "Cobertura mínima" e "Requisitos não funcionais" (tabela `RNF | Teste` com um teste para cada RNF). Os critérios de aceite das features têm IDs `CA-…` (ver `CLAUDE.md`) e cada teste cita o ID no nome.

## Entrevista de arquitetura

Quando o pedido começar com "Entrevista de arquitetura":

1. Leia a spec (Conceito, módulos, features, decisões) e os arquivos desta pasta. Descubra a primeira pendência.
2. Antes de perguntar, **proponha**: a partir dos módulos e do contexto, sugira um estilo, a divisão em serviços e um diagrama. O usuário confirma ou ajusta.
3. Faça **uma pergunta por vez**, curta e concreta. A stack é escolhida pelo usuário, **serviço a serviço**; sugira opções, nunca imponha.
4. Grave cada resposta no arquivo e na seção certos, com as palavras do usuário. Em "Stack", use linhas `- Linguagem: …`, `- Framework: …`, `- Banco: …`, `- Testes: …`.
5. Crie serviços copiando `docs/_templates/servico.md` para `servicos/SVxx-nome.md` (próximo número livre).
6. Diagramas ficam em blocos ` ```mermaid ` dentro do Markdown, na seção "Componentes" de `visao.md`. Todo serviço deve aparecer nele.
7. Cenários: um por fluxo importante (`### Nome do fluxo`), com os passos e, quando ajudar, um diagrama Mermaid de sequência. Cite os serviços por ID.
8. Se o usuário não souber, anote em "Dúvidas em aberto" e siga. Decisões que afetam a spec inteira viram entrada em `docs/decisoes.md`.
9. Ao fechar uma etapa, diga qual fechou e pergunte se segue para a próxima.
