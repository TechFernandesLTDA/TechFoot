# TechFoot

Jogo **singleplayer** de gerenciamento de futebol no browser, inspirado em Elifoot e Brasfoot.
Código original — sem assets, nomes ou binários licenciados.

Org: [TechFernandesLTDA](https://github.com/TechFernandesLTDA) · MIT

## O que tem hoje

- Conta com e-mail e senha (Google e telefone ficam para depois)
- **60 clubes brasileiros** das séries A, B e C de 2026, com nomes reais e jogadores fictícios
- **27 catálogos estaduais** com formato configurável e classificação para a Copa do Brasil
- Seleção inicial compacta com busca por nome/cidade/estado, filtro por série e navegação alfabética
- **Motor determinístico** (seed): partida minuto a minuto, mando de campo, duelo, cartões, lesões, evolução de força
- Jogadores com idade, XP de 0 a 100, posições preferidas, condição, moral e oito skills influentes
- Plano de jogo com titulares, até cinco reservas, formação, capitão e substituições programadas
- **Tática** (ofensivo / equilibrado / defensivo) e **moral** do clube afetando o desempenho
- **Copa** mata-mola com pênaltis, intercalada na temporada
- **Fim de temporada**: campeão, prêmios, acesso e rebaixamento, novo calendário
- **Economia**: bilheteria, folha salarial, prêmios, compra/venda e renovação de jogadores
- **Administração**: preço de ingresso, sócios, patrocínio, transmissão, produtos, estádio, manutenção, base, scouting e empréstimos
- Uma carreira ativa fica vinculada ao clube escolhido; não existe troca de time durante o save
- **Inbox** com notificações (lesão, suspensão, contrato, mercado)
- **Artilharia**, classificação e narração com nomes dos jogadores
- Save na conta (SQLite local no MVP; não é uma nuvem pública)
- PWA com cache só de arquivos estáticos; conta, saves e simulação exigem a API
- i18n PT-BR/EN, idioma lembrado no navegador, validação zod e rate limit na API
- Apoio voluntário por Pix: a chave pode ser copiada; QR/BR Code só existe se nome e cidade reais do recebedor estiverem configurados
- Checkout premium ausente até haver provedor com verificação no servidor. Doação não libera recurso nem confirma pagamento no clique

## Stack

| Peça | Tecnologia |
|---|---|
| Web | React 19 + Vite + PWA |
| API | Fastify 5 + Prisma + SQLite + zod |
| Motor | TypeScript puro (`packages/engine`) |
| Testes | node:test (engine) + Playwright (E2E) |
| CI | GitHub Actions |

## Dev

Requisitos: Node.js 20 ou mais recente.

```bash
cp apps/api/.env.example apps/api/.env
npm install
npm test
npm run typecheck
npm run build
npm run db:push
npm run dev:api   # :3333
npm run dev:web   # :5173
npm run e2e       # E2E (requer api + web rodando)
```

Web: http://localhost:5173 · API: http://localhost:3333 · saúde: http://localhost:3333/health

`npm install` gera o client do Prisma. Sem `apps/api/.env` e sem `npm run db:push`, a API não abre conta nem save. O jogo não substitui isso por uma carreira falsa.

## Primeira versão jogável

O loop é: criar conta, assumir um clube, montar o onze, simular a rodada e ler relatório, tabela, caixa e mensagens. Uma carreira ativa fica vinculada ao clube. No celular, o arquivo salvo aparece acima da lista de clubes e o menu Mais alcança copa, mercado, financeiro, tabela, competições, administração, jogo e apoio.

A simulação trata vitória, empate e derrota pelo lado do seu clube, inclusive fora de casa. Jogador lesionado ou suspenso fica fora daquela rodada. Venda manda o atleta ao mercado de agentes livres.

## Apoio e monetização

O jogo inteiro é gratuito. O encaixe conservador é doação voluntária, sem pay-to-win, anúncio, aposta ou prêmio em dinheiro.

- A chave Pix pública do projeto é `futebadosparcas@outlook.com`. Dá para copiar na tela Apoio. Copiar não confirma pagamento.
- QR Code e BR Code só são gerados quando `PIX_MERCHANT_NAME` e `PIX_MERCHANT_CITY` existem no ambiente, com dados reais do recebedor. O sistema não inventa nome nem cidade.
- Uma intenção registrada fica `unverified`. O botão do navegador não muda esse estado.
- `POST /support/webhooks/payment` só marca `verified` com `PAYMENT_WEBHOOK_SECRET` e assinatura HMAC SHA-256 do corpo cru no header `x-techfoot-signature`. Sem o segredo, a rota responde 503. Mesmo verificado, nada do jogo é liberado: não há produto premium nesta versão.
- Não há checkout, preço, usuário ou receita fictícios.

## Privacidade e segurança

- A conta guarda nome, e-mail e senha com scrypt. A sessão é um cookie `tf` httpOnly por 7 dias.
- O save é o JSON da carreira no SQLite local. Não há analytics, anúncio nem venda de dados.
- O apoio não pede CPF, a chave Pix de quem doa nem cartão.
- O service worker não guarda respostas de `/auth`, `/me`, `/saves`, `/support`, `/health`, `/world` ou `/competitions`.
- Em produção, defina `SESSION_SECRET` longo e `WEB_ORIGIN` restrito. O valor de exemplo não serve para um servidor público.
- As fontes vêm do Google Fonts quando a rede permite. Sem isso, o navegador usa a fonte genérica.

## O que ainda impede publicação

- Não há host, domínio, HTTPS nem banco fora deste SQLite.
- Não há provedor de pagamento real. O webhook é só o gancho; não está ligado a PSP, banco ou loja.
- BR Code continua desligado até o recebedor informar nome e cidade verdadeiros.
- Não há ficha de loja (Play, App Store, itch ou similar) nem processo de distribuição.
- Nomes de clubes são reais e os atletas são fictícios. Revise direitos e calendário antes de qualquer uso comercial.
- Não rode deploy a partir desta árvore sem revisar segredo, CORS, backup do SQLite e o aviso legal acima.

## Estrutura

```
apps/web        React + Vite (UI)
apps/api        Fastify + Prisma (auth, saves, simulação)
apps/e2e        Playwright
packages/engine Motor puro (simulação, liga, copa, economia)
packages/shared Tipos compartilhados
data/world      Mundo brasileiro (clubes reais, jogadores fictícios, divisões e estaduais)
```

O usuário inicia uma carreira como técnico e administrador de um único clube. O clube não pode ser trocado durante a carreira; caixa, orçamento, estádio, contratos e receitas são responsabilidades do manager. O arquivo fica na conta deste servidor, não numa nuvem pública separada.

## Roadmap

Em andamento — ver [Issues](https://github.com/TechFernandesLTDA/TechFoot/issues) (épicos de Gameplay, Motor, Temporadas, Economia, Plataforma e Produto).

## Legal

Não é clone. Não redistribui Elifoot/Brasfoot. O dataset público usa nomes de clubes apenas, sem escudos, uniformes, fotos, patrocinadores ou nomes de jogadores reais. Calendários e dados oficiais devem ser revisados antes de qualquer distribuição comercial.

Para regenerar o dataset base:

```bash
node scripts/generate-brazil-world.mjs
```
