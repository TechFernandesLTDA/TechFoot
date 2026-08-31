# TechFoot

Jogo **singleplayer** de gerenciamento de futebol no browser, inspirado em Elifoot e Brasfoot.
Código original. Sem assets, nomes ou binários licenciados.

Org: [TechFernandesLTDA](https://github.com/TechFernandesLTDA) · MIT

## O que já roda

- Conta com e-mail e senha (Google e telefone ficam para depois)
- Carreira em liga fictícia de 8 clubes
- Motor determinístico (seed) + tabela + narração
- Save na nuvem (SQLite local no MVP)

## Stack

| Peça | Tecnologia |
|---|---|
| Web | React 19 + Vite |
| API | Fastify 5 + Prisma + SQLite |
| Motor | TypeScript puro (`packages/engine`) |

## Dev

```bash
npm install
npm test
npm run db:push
npm run dev:api
npm run dev:web
```

Web: http://localhost:5173 · API: http://localhost:3333

## Modelos usados na especificação

- `deepseek/deepseek-v4-flash` — motor
- `qwen/qwen3.8-flash` / `qwen/qwen3.7-flash` — API (3.8 em 429)
- `minimax/minimax-m2.5` — UX e mundo (clubes reais descartados)
- `openai/gpt-5.6-luna` — árvore e MVP

## Legal

Não é clone. Não redistribui Elifoot/Brasfoot. Mundo 100% fictício.
