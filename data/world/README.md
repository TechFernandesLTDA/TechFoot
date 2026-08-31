# Mundo Brasileiro

`liga-br.json` é um snapshot de referência para a temporada 2026.

- 60 clubes: 20 da Série A, 20 da Série B e 20 da Série C
- 960 jogadores fictícios gerados localmente
- 27 catálogos estaduais com formato configurável
- Sem escudos, fotos, uniformes, patrocinadores ou nomes de atletas reais

As listas de clubes e formatos foram conferidas em 30 de agosto de 2026 usando as páginas públicas das competições. Elas podem mudar por decisões, calendários e atualizações das federações. O arquivo não deve ser tratado como banco oficial da CBF.

Fontes de referência:

- https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_Série_A
- https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_Série_B
- https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_Série_C
- https://en.wikipedia.org/wiki/2026_Copa_do_Brasil

Regenerar o snapshot:

```bash
node scripts/generate-brazil-world.mjs
```
