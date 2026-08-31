# TechFoot

Jogo **singleplayer** de gerenciamento de futebol no browser, inspirado em Elifoot e Brasfoot.
Código original — sem assets, nomes ou binários licenciados.

Org: [TechFernandesLTDA](https://github.com/TechFernandesLTDA) · MIT

## O que tem hoje

- Conta com e-mail e senha (Google e telefone ficam para depois)
- 2 divisões (Série A/B) com **16 clubes fictícios** e 256 jogadores
- **Motor determinístico** (seed): partida minuto a minuto, mando de campo, duelo, cartões, lesões, evolução de força
- **Tática** (ofensivo / equilibrado / defensivo) e **moral** do clube afetando o desempenho
- **Copa** mata-mola com pênaltis, intercalada na temporada
- **Fim de temporada**: campeão, prêmios, acesso e rebaixamento, novo calendário
- **Economia**: bilheteria, folha salarial, prêmios, compra/venda e renovação de jogadores
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
data/world      Mundo fictício (clubes/jogadores/divisões)
```

## Roadmap

Em andamento — ver [Issues](https://github.com/TechFernandesLTDA/TechFoot/issues) (ébidos de Gameplay, Motor, Temporadas, Economia, Plataforma, Produto).

## Legal

Não é clone. Não redistribui Elifoot/Brasfoot. Mundo 100% fictício.
