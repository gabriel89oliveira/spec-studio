# Instruções para o agente

Este projeto segue desenvolvimento guiado por especificação. A documentação em `docs/` é a fonte da verdade: o código implementa o que está escrito lá, e nada além disso.

## Contexto sempre carregado

@docs/CONCEITO.md

## Mapa da documentação

| Arquivo | Conteúdo | Quando ler |
|---|---|---|
| `docs/CONCEITO.md` | Visão, perfis, escopo, módulos, requisitos gerais, diretrizes técnicas, glossário | Sempre (já carregado acima) |
| `docs/modulos/Mxx-*.md` | Responsabilidade, entidades, ciclo de vida e relações de um módulo | Antes de qualquer tarefa no módulo |
| `docs/features/Fxx-*.md` | Histórias, critérios de aceite, regras, dados | A feature em trabalho |
| `docs/permissoes.md` | Quem pode fazer o quê e quem vê quais dados | Toda tarefa que envolva acesso, perfis ou dados |
| `docs/decisoes.md` | Decisões abertas e tomadas | Antes de implementar e sempre que algo estiver ambíguo |
| `docs/_templates/` | Esqueleto inicial de módulo e de feature | Só ao criar um módulo ou feature novo |

## IDs

- `M01` módulo · `F01` feature · `US-01.1` história · `RN-01.1` regra de negócio · `D-001` decisão.
- IDs nunca são renumerados nem reaproveitados. Para criar um novo, use o próximo número livre.
- Cite os IDs em nomes de testes, mensagens de commit e descrições de PR.

## Documentos nascem pequenos

Uma feature ou um módulo novo começa só com o esqueleto de `docs/_templates/`: título e seções vazias, sem texto de exemplo. Cada seção nova entra no arquivo quando a etapa pede, com o que o usuário respondeu. Nunca preencha com exemplo, "a definir" ou texto inventado: seção sem resposta fica de fora.

### Etapas de uma feature

| Etapa | Fica completa quando o arquivo tem | Seções que entram |
|---|---|---|
| Ideia | Objetivo (1 frase), Quem usa (ao menos um perfil), Módulo | Objetivo, Quem usa |
| Entendida | Histórias de usuário (ao menos uma) e Fora do escopo | Histórias de usuário (`### US-xx.n — título` e "Como **perfil**, quero **ação**, para **benefício**"), Fora do escopo, Dúvidas em aberto |
| Detalhada | Critérios de aceite em todas as histórias, Regras de negócio (ou a declaração de que não há) e nenhuma dúvida em aberto | Critérios de aceite (Dado/Quando/Então, com ao menos um caso de erro), Regras de negócio (`RN-xx.n`), Dados (só campos que as regras citam) |
| Pronta para dev | Revisão final e confirmação do usuário | nada novo: a linha Etapa passa a "Pronta para dev" |

Depois de "Pronta para dev" a linha Etapa segue: Em desenvolvimento, Concluída ou Cancelada. Telas, notificações e integrações só entram se o usuário disser que a feature tem.

### Etapas de um módulo

| Etapa | Fica completa quando o arquivo tem | Seções que entram |
|---|---|---|
| Ideia | Responsabilidade (1 a 2 frases) e Perfis envolvidos | Responsabilidade, Perfis envolvidos |
| Mapeado | Entidades principais e Fora deste módulo | Entidades (nome e o que representa), Fora deste módulo (o que fica em outro módulo, e qual) |
| Detalhado | Ciclo de vida, Relação com outros módulos (ou a declaração de que não há) e nenhuma dúvida em aberto | Ciclo de vida (tabela De, Para, Quem dispara, Condição), Relação com outros módulos, Integrações externas, Dúvidas em aberto |

A lista de features de um módulo não é escrita no arquivo: a plataforma monta a partir do campo Módulo de cada feature.

## Entrevista guiada

Quando o pedido começar com "Entrevista guiada" ou pedir para criar uma feature ou módulo:

1. Leia o arquivo e descubra o que falta para completar a etapa (as seções da tabela acima).
2. Faça **uma pergunta por vez**, curta e concreta, na ordem da tabela. Nunca liste todas as perguntas de uma vez.
3. Assim que o usuário responder, grave a resposta no arquivo, na seção certa, com as palavras dele (só organize e corrija a forma). Depois faça a próxima pergunta.
4. Se a resposta abrir uma dúvida que dependa do time, registre-a em **Dúvidas em aberto** do arquivo (uma linha) e, se for relevante para o projeto todo, proponha uma entrada em `docs/decisoes.md`.
5. Quando a etapa ficar completa, diga qual etapa fechou, resuma em uma ou duas linhas o que ficou registrado e pergunte se o usuário quer seguir para a próxima. Quando a etapa Ideia de um módulo fechar, acrescente uma linha a ele no mapa de módulos (seção 6 do Conceito), com a responsabilidade que o usuário deu.
6. Se o usuário disser que não sabe, não invente: anote como dúvida em aberto e passe à próxima pergunta.
7. Em "Pronta para dev", confira antes de mudar a linha Etapa: ações citadas existem em `docs/permissoes.md`, termos novos estão no Glossário do Conceito, o módulo lista a relação com as outras features, e há ao menos um caso de erro por história. Liste o que faltar; só marque "Pronta para dev" com a confirmação do usuário.

## Ao implementar uma feature

1. Leia a spec da feature, a página do módulo, as ações citadas na matriz e as decisões referenciadas.
2. Confira a Etapa. Só implemente se for **Pronta para dev**. Em qualquer etapa anterior, não implemente: liste o que falta e pare.
3. Confira as dependências citadas na spec. Se alguma não estiver Concluída, avise antes de começar.
4. Mude a Etapa para **Em desenvolvimento**.
5. Escreva um teste automatizado para cada critério de aceite, com o ID da história no nome (ex.: `US-03.1 rejeita agendamento sem data`). Inclua teste de acesso negado para cada perfil que a matriz não permite.
6. Implemente o necessário para os testes passarem, respeitando regras de negócio, requisitos gerais (seção 7 do Conceito) e diretrizes técnicas (seção 8).
7. Com todos os testes passando, resuma o que foi feito e peça confirmação antes de mudar a Etapa para **Concluída**.

## Nunca

- Implementar algo que não está na spec ou que está em Fora do escopo.
- Inventar regra de negócio, campo, estado, perfil ou permissão para preencher uma lacuna.
- Escrever texto de exemplo, placeholder ou "a definir" nos documentos.
- Alterar critérios de aceite, regras de negócio ou a matriz sem pedido explícito.
- Marcar uma decisão como Decidida, ou apagar e reescrever decisões já tomadas.
- Renumerar IDs.
- Seguir o código existente quando ele divergir da spec: aponte a divergência e pergunte qual vale.

## Quando faltar informação

1. Pare e liste as perguntas de forma objetiva.
2. Para cada pergunta que dependa de decisão do time, proponha uma entrada em `docs/decisoes.md` com status **Aberta**, próximo ID livre, contexto e opções. Adicione-a ao índice.
3. Registre a dúvida em Dúvidas em aberto do documento, referenciando o ID da decisão.
4. Continue apenas com a parte que claramente não depende da dúvida, e diga o que ficou de fora.

## Ao escrever ou revisar specs (quando pedido)

- Escreva a partir do que o usuário disse e do que já está nos docs. O que você supuser entra como pergunta, nunca como regra.
- Termo de negócio novo vai para o Glossário. Perfil ou ação nova vai para a matriz. Entidade nova vai para a página do módulo dono.
- Mudança que afete um nível acima (módulo novo, perfil novo, mudança de escopo) exige atualizar o nível de cima e propor um registro de decisão.
- Decisão tomada pelo usuário: registre o resultado, a data, quem decidiu, uma linha no Histórico, e atualize o índice e as specs afetadas na mesma tarefa.

## Convenções de código

- Use os termos do Glossário nos nomes de classes, tabelas, rotas e variáveis.
- Stack, arquitetura e padrões: seção 8 do `docs/CONCEITO.md`.

## Comandos

- Instalar dependências: `[comando]`
- Rodar localmente: `[comando]`
- Rodar os testes: `[comando]`
- Lint e formatação: `[comando]`
