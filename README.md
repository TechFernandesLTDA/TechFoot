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
- Save na nuvem (SQLite local no MVP)
- PWA (offline), i18n PT-BR/EN e validação zod + rate limit na API

## Stack

| Peça | Tecnologia |
|---|---|
| Web | React 19 + Vite + PWA |
| API | Fastify 5 + Prisma + SQLite + zod |
| Motor | TypeScript puro (`packages/engine`) |
| Testes | node:test (engine) + Playwright (E2E) |
| CI | GitHub Actions |

## Dev

```bash
npm install
npm test
npm run db:push
npm run dev:api   # :3333
npm run dev:web   # :5173
npm run e2e       # E2E (requer api + web rodando)
```

Web: http://localhost:5173 · API: http://localhost:3333

## Estrutura

```
apps/web        React + Vite (UI)
apps/api        Fastify + Prisma (auth, saves, simulação)
apps/e2e        Playwright
packages/engine Motor puro (simulação, liga, copa, economia)
packages/shared Tipos compartilhados
data/world      Mundo brasileiro (clubes reais, jogadores fictícios, divisões e estaduais)
```

O usuário inicia uma carreira como técnico e administrador de um único clube. O clube não pode ser trocado durante a carreira; caixa, orçamento, estádio, contratos e receitas são responsabilidades do manager.

## Roadmap

Em andamento — ver [Issues](https://github.com/TechFernandesLTDA/TechFoot/issues) (épicos de Gameplay, Motor, Temporadas, Economia, Plataforma e Produto).

## Legal

Não é clone. Não redistribui Elifoot/Brasfoot. O dataset público usa nomes de clubes apenas, sem escudos, uniformes, fotos, patrocinadores ou nomes de jogadores reais. Calendários e dados oficiais devem ser revisados antes de qualquer distribuição comercial.

Para regenerar o dataset base:

```bash
node scripts/generate-brazil-world.mjs
```
