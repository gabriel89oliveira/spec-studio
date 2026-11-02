# Spec Studio

Aplicação local para escrever e evoluir especificações em Markdown junto com o Claude. Você navega pelos arquivos do projeto, lê o Markdown renderizado, comenta trechos, conversa com o Claude, e ele edita os arquivos. Cada alteração vira um commit no Git, com histórico, diff e desfazer.

Funciona com qualquer pasta que siga o kit de especificação: `CLAUDE.md` na raiz e a documentação em `docs/`.

## Pré-requisitos

- **Node.js 20 ou superior** — confira com `node -v`
- **Git** (no Windows, o Git for Windows) — confira com `git --version`
- **Chave da API da Anthropic**, criada em <https://console.anthropic.com>. Sem ela, a aplicação abre com o Claude desativado e você ainda pode ler, editar e comentar.

## Como rodar

No PowerShell, dentro desta pasta:

```powershell
copy .env.example .env     # depois abra o .env e preencha PROJECT_DIR e ANTHROPIC_API_KEY
npm install
npm run dev
```

Abra <http://localhost:5173> no navegador (Chrome ou Edge recomendados).

Exemplo de `.env` no Windows (sem aspas):

```
PROJECT_DIR=C:\Users\Gabriel\Projetos\driveb-spec
ANTHROPIC_API_KEY=sk-ant-...
USER_NAME=Gabriel
```

Para parar, use Ctrl+C no terminal.

## Testar sem gastar créditos

Com `CLAUDE_MOCK=true` no `.env` (e o servidor reiniciado), um Claude simulado responde no lugar do real, sem chamar a API e sem custo. A chave da API nem precisa estar preenchida. O topo da tela mostra **modo simulado**.

O modo simulado percorre o fluxo inteiro: mostra o progresso ao vivo, registra as ferramentas, altera o arquivo e faz o commit. As alterações são reais, mas sempre marcadas:

- **Comentário ou chat com um arquivo aberto:** acrescenta uma seção "Nota do modo simulado" no fim do arquivo.
- **Comentário que termina com "?":** só responde, sem alterar arquivos.
- **+ Feature / + Módulo:** cria o rascunho a partir de `docs/_templates/`, com o próximo ID livre.

Para desfazer as notas de teste, use o Histórico. Serve para testar a interface e o fluxo, não a qualidade das respostas. Para isso, use `CLAUDE_MODEL=haiku`, que custa bem menos que o Sonnet.

## Testes

```powershell
npm test          # testes automatizados do servidor (critérios de aceite das fases 1 a 5)
npm run typecheck # checagem de tipos do servidor e da interface
```

## Como usar

- **Ler:** clique num arquivo da árvore à esquerda.
- **Comentar:** selecione um trecho do documento e clique em **Comentar**. No painel de comentários, **Enviar para o Claude** pede a ele que faça o que o comentário diz.
- **Chat:** para pedidos maiores (*rascunhe as features do módulo de oficinas*). O arquivo aberto vai junto como contexto.
- **Editar:** **Editar** abre o Markdown cru; Ctrl+S salva.
- **Histórico:** mostra os commits do arquivo, o diff de cada um e permite desfazer.
- **+ Feature / + Módulo:** pedem ao Claude que crie o rascunho a partir de `docs/_templates/`.

Os comentários ficam em `PROJECT_DIR/.spec-studio/comments/` (versionados no Git) e as conversas em `PROJECT_DIR/.spec-studio/sessions/` (fora do Git).

## Escolhas feitas na construção

Pontos que a especificação não definia, ou onde houve um desvio deliberado:

1. **Claude opcional.** Sem `ANTHROPIC_API_KEY`, o servidor inicia com o Claude desativado, em vez de encerrar, para que dê para navegar, editar e comentar antes de ter a chave. `PROJECT_DIR` continua obrigatório.
2. **zod 4**, exigido pelo Agent SDK.
3. **Commits de comentários.** Criar, editar, resolver, reabrir e responder geram um commit `comentários: <arquivo> (...)`. A mudança para "enviado ao Claude" entra no commit do próprio Claude, e a resposta dele gera mais um commit com o hash referenciado.
4. **Trabalho cancelado ou com erro.** Se o Claude já tiver alterado arquivos, essas alterações são commitadas como `claude (interrompido): ...`, para poderem ser desfeitas pelo Histórico.
5. **Edição manual só grava arquivos existentes.** Criar arquivos novos é sempre tarefa do Claude.
6. **Responder um comentário já respondido ou resolvido** volta o status para "aberto".
7. **Destaques dos trechos** usam a CSS Custom Highlight API (Chrome e Edge 105+, Firefox 140+). Num navegador sem suporte, os comentários funcionam sem o destaque.
8. **Ambiente do agente limpo.** O agente não herda variáveis `CLAUDE*` nem credenciais alternativas (`ANTHROPIC_AUTH_TOKEN`) do terminal — por exemplo, se o servidor for iniciado dentro do terminal do Claude Code. Assim a chave do `.env` é a usada e cada conversa tem sua própria sessão. `CLAUDE_CODE_GIT_BASH_PATH` e `CLAUDE_CONFIG_DIR` são mantidas.
9. **Memória automática do agente desativada** (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`), porque ela gravaria fora da pasta do projeto, o que a guarda de caminhos bloqueia.
10. **Sem `package-lock.json` na entrega.** As versões das dependências diretas estão fixadas; o `npm install` no Windows gera o lock com os binários nativos certos para a sua máquina.
11. **Git sem identidade configurada** usa `USER_NAME` e `spec-studio@localhost` nos commits.
12. **Evento `job.started`** também traz `commentId` e `sessionId`.
13. **Aviso de arquivo atualizado** mostra o diff entre o que estava na tela e a versão nova, calculado no navegador.
14. **Desfazer com conflito** (alterações posteriores nas mesmas linhas) é abortado com uma explicação, e nada muda.
15. **Servidor compilado com `tsc` e executado com Node puro** (`node --watch`), em vez de `tsx`. No Windows, o `tsx` travava ao carregar o Agent SDK. O Agent SDK também é carregado sob demanda, logo depois que o servidor sobe, para nunca atrasar a inicialização.

## Se algo não funcionar

- A cada inicialização, o servidor grava os passos em `server/startup.log`. A última linha diz onde parou.
- Se a configuração estiver errada, o servidor continua no ar só para mostrar o motivo na tela. Corrija o `.env` e reinicie com Ctrl+C e `npm run dev`.
- "A porta 3001 já está em uso": troque `PORT` no `.env` (ex.: `PORT=3101`) e reinicie.

## Limitações conhecidas

- Sem internet, o Agent SDK tenta reconectar por alguns minutos antes de desistir. Use **Cancelar**.
- Um trabalho do Claude por vez; durante ele, o editor fica somente leitura.
