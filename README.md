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
- **Arquivo da carreira**: cada temporada encerrada guarda divisão, posição, pontos e prêmio no próprio save
- **Meus jogos**: o calendário abre no recorte do clube; o turno inteiro continua disponível
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

O escritório mostra o objetivo da divisão atual e, depois do fim da temporada, o resultado arquivado. Em Competições, a lista "Temporadas encerradas" começa vazia e passa a guardar até vinte temporadas no JSON do save. Em Jogos, o padrão é "Meus jogos".

A simulação trata vitória, empate e derrota pelo lado do seu clube, inclusive fora de casa. Jogador lesionado ou suspenso fica fora daquela rodada. Venda manda o atleta ao mercado de agentes livres.

## Apoio e monetização

O jogo inteiro é gratuito. O encaixe conservador é doação voluntária, sem pay-to-win, anúncio, aposta ou prêmio em dinheiro.

- A chave Pix pública do projeto é `futebadosparcas@outlook.com`. Dá para copiar na tela Apoio. Copiar não confirma pagamento.
- QR Code e BR Code só são gerados quando `PIX_MERCHANT_NAME` e `PIX_MERCHANT_CITY` existem no ambiente, com dados reais do recebedor. O sistema não inventa nome nem cidade.
- Uma intenção registrada fica `unverified`. O botão do navegador não muda esse estado.
- `POST /support/webhooks/payment` só marca `verified` com `PAYMENT_WEBHOOK_SECRET` e assinatura HMAC SHA-256 do corpo cru no header `x-techfoot-signature`. Sem o segredo, a rota responde 503. Mesmo verificado, nada do jogo é liberado: não há produto premium nesta versão.
- Não há checkout, preço, usuário ou receita fictícios.

## Privacidade e segurança

- A conta guarda nome, e-mail e senha com scrypt. Senha nova: 8 a 128 caracteres. Quem já tinha senha mais curta continua conseguindo entrar.
- O cadastro pede aceite dos termos e declaração de 18 anos ou mais. As páginas são `/privacidade` e `/termos`.
- A sessão é um cookie `tf` httpOnly com `Max-Age` de 7 dias, o mesmo prazo do token. Logout e troca de senha aumentam `sessionVersion` e invalidam o token antigo.
- Dá para exportar um JSON em `GET /me/export` e apagar a conta com `DELETE /me`, confirmando a senha. Saves e intenções de apoio saem junto.
- O save é o JSON da carreira no SQLite local. Não há analytics, anúncio nem venda de dados.
- O apoio não pede CPF, a chave Pix de quem doa nem cartão.
- O service worker não guarda respostas de `/api`. O registro dele está em `/register-sw.js`, para a CSP não depender de script inline. O navegador chama a API por essa origem, e o nginx tira o prefixo.
- Em produção, defina `SESSION_SECRET` exclusivo (24 caracteres ou mais) e `WEB_ORIGIN` da origem pública. O valor de exemplo faz a API recusar o arranque. O cookie fica `Secure`.
- `TRUST_PROXY=true` confia em dois saltos de rede privada (nginx e Traefik). Um `X-Forwarded-For` inventado à esquerda não troca o limite de taxa.
- As fontes são as do sistema. A CSP é `default-src 'self'` e não chama o Google Fonts.
- A política e os termos citam R L Fernandes LTDA / TECHFERNANDES. O e-mail `futebadosparcas@outlook.com` está marcado como contato a confirmar. CNPJ e endereço ficam em branco até o Renan preencher.

## Docker

`compose.yaml` na raiz é só o ensaio local, com portas em `127.0.0.1`. O servidor usa [deploy/README.md](deploy/README.md) e `deploy/compose.prod.yaml`: sem porta publicada, Traefik na rede `tf-edge`, API só na rede interna, SQLite em `/srv/techfernandes/techfoot/data`.

```bash
docker compose config --quiet
docker compose -f deploy/compose.prod.yaml config --quiet
```

`GET /health` público responde só `{ok, db}`. O detalhe de pagamento fica em `GET /health/detail` e some em produção. O cookie `tf` é `Secure` atrás do proxy, e o Fastify só aceita `X-Forwarded-Proto` vindo de um salto privado. O segredo de exemplo não sobe.

## O que já está pronto no código

- Conta, carreira, simulação, arquivo de temporada e calendário do clube
- Testes do motor, da API e do fluxo no browser
- `GET /health` com checagem do banco
- Recusa de segredo de desenvolvimento quando `NODE_ENV=production`
- Cópia da chave Pix e lista do que ainda falta para um recebimento verificável
- Webhook que, mesmo com assinatura válida, não libera recurso
- `Dockerfile` e `compose.yaml` para um arranque local reproduzível

## O que você precisa fazer para ir ao ar e receber apoio

1. Seguir [deploy/README.md](deploy/README.md) no host que já existe: build `linux/arm64`, diretório com dono uid 10001, env em `/srv/techfernandes/techfoot/techfoot.env`, Traefik em `tf-edge`. Este repositório não faz o deploy.
2. Gerar um `SESSION_SECRET` exclusivo, definir `WEB_ORIGIN` e `NODE_ENV=production`.
3. Decidir o banco: manter o SQLite com backup do volume, ou migrar para um banco com cópia própria. O arquivo não está numa nuvem pública.
4. Conferir no banco, fora do jogo, se a chave `futebadosparcas@outlook.com` recebe Pix. O aplicativo não vê o extrato.
5. Se quiser QR Code, preencher `PIX_MERCHANT_NAME` e `PIX_MERCHANT_CITY` com o nome e a cidade reais do recebedor. Os dois juntos. O jogo não inventa esses campos.
6. Se um dia quiser pagamento verificado, contratar um provedor real e ligar o webhook. Nesta versão a verificação continua sem liberar recurso.
7. Revisar o uso comercial dos nomes reais dos clubes antes de distribuir.
8. Abrir ficha de loja só se a distribuição for por Play, App Store ou similar. Não há ficha nesta árvore.

Não há preço, usuário, receita nem confirmação de Pix inventados. Copiar a chave não é pagamento recebido.

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
