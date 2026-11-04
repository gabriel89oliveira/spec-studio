# Como usar esta documentação

O projeto é especificado do macro ao detalhe, em três níveis:

1. **Conceito** ([`CONCEITO.md`](CONCEITO.md)) — o projeto inteiro em uma página.
2. **Módulos** ([`modulos/`](modulos/)) — uma página por domínio da plataforma.
3. **Features** ([`features/`](features/)) — uma spec curta por entrega, que a IA implementa.

Valem para o projeto todo:

- **Matriz de permissões** ([`permissoes.md`](permissoes.md)) — quem pode fazer o quê e quem vê quais dados.
- **Registro de decisões** ([`decisoes.md`](decisoes.md)) — o que está aberto, o que foi decidido e como evoluiu.

## Estrutura

```
CLAUDE.md                  instruções para o agente de IA
docs/
├── README.md              este guia
├── CONCEITO.md
├── permissoes.md
├── decisoes.md
├── _templates/
│   ├── modulo.md
│   └── feature.md
├── fontes/
│   ├── S01-nome-da-fonte.md
│   └── originais/
├── modulos/
│   └── M01-nome-do-modulo.md
└── features/
    └── F01-nome-curto.md
```

## Fontes de contexto

Transcrições de reunião, documentos do cliente e normas entram pelo botão **Fonte**. O Claude lê o original e propõe decisões, requisitos e dúvidas, cada uma com a origem. Você aceita ou descarta cada proposta, e só depois o Claude as aplica nas specs. Etapas de uma fonte: Importada → Revisada → Aplicada.

## Como trabalhar

Cada módulo e cada feature nasce pequeno e cresce por etapas. Você não precisa saber tudo de uma vez: o Spec Studio mostra a etapa atual e o que falta, e o Claude conduz uma entrevista com uma pergunta por vez, gravando as respostas no arquivo.

| Documento | Etapas |
|---|---|
| Feature | Ideia → Entendida → Detalhada → Pronta para dev (depois: Em desenvolvimento, Concluída, Cancelada) |
| Módulo | Ideia → Mapeado → Detalhado |
| Conceito | Visão → Escopo → Requisitos |
| Matriz de permissões | Perfis → Ações → Preenchida |

1. Comece pelo Conceito: visão, perfis, escopo e o mapa de módulos.
2. Crie os módulos e leve cada um até "Ideia". Só depois aprofunde.
3. Crie as features dentro dos módulos e avance por etapa. Detalhe por completo só as que vão entrar em desenvolvimento.
4. Toda dúvida que dependa do time vira uma decisão com ID em `decisoes.md`.
5. Monte a Matriz de permissões assim que os perfis estiverem definidos.
6. Preencha a seção Comandos do `CLAUDE.md` quando a stack estiver definida.
7. Peça uma feature por vez à IA, só depois de "Pronta para dev". Na feature, o botão **Pacote para desenvolvimento** reúne contexto, regras, permissões, decisões e plano de testes para colar na IA que vai programar.
8. Acompanhe tudo em **Visão geral** e **Problemas** (contradições entre os documentos) no topo da árvore.

Avance primeiro em largura: todos os módulos em "Ideia" antes de detalhar qualquer um a fundo. Quando descer de nível revelar algo que muda o nível de cima (um módulo a dividir, um perfil novo), ajuste o nível superior na hora e, se a mudança for relevante, registre como decisão.

## Regras de ouro

- **Uma feature cabe em poucos dias de trabalho.** Passou de umas 6 histórias, divida em duas.
- **Todo critério de aceite segue Dado/Quando/Então**, com pelo menos um cenário de erro. Eles viram os testes.
- **Fora do escopo é obrigatório.** É o que impede a IA de inventar funcionalidades.
- **Termo de negócio novo vai para o Glossário** e é usado com o mesmo nome no código.
- **Etapa da feature:** Ideia → Entendida → Detalhada → Pronta para dev → Em desenvolvimento → Concluída (ou Cancelada). Feature com dúvida em aberto não passa de Detalhada e não vai para implementação.
- **IDs são estáveis** (M02, F03, US-03.1, RN-03.2, D-014). Nunca renumere; o que for descartado fica como Cancelado ou Substituído.
- **Alguém é dono da documentação** e atualiza o Registro de decisões depois de cada reunião.
- **Projeto pequeno pode pular os módulos** e listar as features direto no Conceito.

## Como pedir trabalho à IA

| Para… | Peça assim |
|---|---|
| Implementar | *Implemente a F03.* |
| Começar uma feature | *Crie a feature "Agendamento" no módulo M02 e comece a entrevista.* |
| Revisar antes do desenvolvimento | *Revise a F07 e liste o que falta para ficar Pronta para dev.* |
| Registrar uma dúvida | *Registre uma decisão em aberto: quem aprova orçamentos acima do limite?* |
| Registrar um resultado | *A D-014 foi decidida pela opção B na reunião de hoje; atualize o registro e as specs afetadas.* |
| Checar consistência | *Verifique se todas as ações citadas nas features existem na matriz e se os termos estão no Glossário.* |
