# Spec Studio para Windows (aplicativo)

O mesmo servidor e a mesma interface de sempre, empacotados com o Electron:
o usuário baixa um instalador, abre o Spec Studio e ele se atualiza sozinho.

```
desktop/
  src/main.ts       processo principal: sobe o servidor dentro do app, abre a janela, seletor de pasta nativo,
                    chave cifrada (safeStorage/DPAPI), aviso se faltar o Git, atualização automática
  scripts/stage.mjs monta desktop/stage (servidor compilado + interface + kit + package.json de produção)
  package.json      configuração do electron-builder (instalador NSIS, publicação no GitHub)
```

`server/`, `web/` e `kit/` não mudam de lugar: o app só os empacota.

## Rodar em desenvolvimento

```
npm install            # na raiz
cd desktop && npm install
npm run stage && cd stage && npm install --omit=dev && cd ..
npx electron stage     # abre o app a partir da pasta montada
```

## Gerar o instalador localmente (no Windows)

```
cd desktop
npm install
npm run dist           # cria desktop/release/Spec Studio Setup <versão>.exe
```

O instalador precisa ser gerado no Windows: é o `npm install` de lá que traz o executável do Claude para Windows
(`@anthropic-ai/claude-agent-sdk-win32-x64`), que fica desempacotado do `app.asar`.

## Publicar uma versão (atualização automática)

1. O repositório precisa ser **público**: o `electron-updater` baixa as versões sem credencial.
   As releases são criadas no próprio `spec-studio` (`build.publish` em `desktop/package.json`).
2. Em *Settings → Actions → General → Workflow permissions*, marque **Read and write permissions**
   (o fluxo usa o `GITHUB_TOKEN` automático; não é preciso criar token nem segredo).
3. Publique: `git tag v0.2.0 && git push origin v0.2.0`. O fluxo `.github/workflows/release.yml` roda os testes,
   gera o instalador e cria a release.
4. Quem já tem o app instalado vê "Nova versão pronta — Reiniciar e atualizar" em até 4 horas (ou na hora de abrir o app).

## Assinatura de código (recomendado)

Sem certificado, o Windows SmartScreen avisa "editor desconhecido" na primeira instalação.
Com um certificado de assinatura de código, guarde o `.pfx` em base64 como segredo `CSC_LINK` e a senha como `CSC_KEY_PASSWORD`:
o fluxo já usa esses nomes. Atualizações automáticas funcionam sem assinatura, mas a experiência é pior.

## Proxy

Em redes com proxy, abra ⚙ Configurações → **Conexão**: *Manual* (endereço e porta) ou *Script automático* (o mesmo endereço
do script que o Windows usa em Rede e Internet › Proxy). Usuário e senha são opcionais; a senha fica cifrada pelo Windows.
**Testar conexão** chega ao destino do Claude com o que estiver preenchido. O proxy vale para o Claude e para as atualizações do app.
Se a rede inspeciona o tráfego com certificado próprio, o teste avisa; pode ser preciso instalar o certificado da empresa no Windows.

## Onde ficam os dados

`%APPDATA%\Spec Studio\data` guarda `settings.json` (chaves cifradas com o Windows) e `state.json` (projetos recentes);
`%APPDATA%\Spec Studio\app.log` registra a inicialização. Os projetos ficam onde o usuário escolher.

## Requisitos na máquina do usuário

- Git para Windows (o app avisa e oferece o link se não encontrar).
- Uma chave da API Anthropic ou token de um LLM gateway, informados em ⚙ Configurações.

## Ainda não verificado

O app foi testado em Linux (xvfb) com Claude simulado. Em Windows ainda é preciso conferir (inclusive o proxy com script automático e com senha): instalação, assinatura,
o executável do Claude desempacotado, o seletor de pasta e a atualização automática ponta a ponta.
