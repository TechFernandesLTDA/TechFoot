# TechFoot no servidor TECHFERNANDES

Runbook de `techfoot.techfernandes.com.br`. Isto não liga o servidor, não mexe em DNS e não publica 80/443. Quem publica é o Traefik 3.6, já existente, na rede Docker `tf-edge`.

Arquivos:

| Arquivo | Função |
|---|---|
| `compose.prod.yaml` | API e web, sem `ports:` |
| `../Dockerfile` | Imagem multi-stage, alvo `linux/arm64` |
| `nginx.conf` | nginx-unprivileged na 8080; `/api/` vai para a API |
| `techfoot.env.example` | Modelo. O segredo de exemplo é recusado de propósito |
| `session_secret.example` | Mesmo placeholder, se o segredo for um Docker secret |
| `backup-sqlite.sh` | `sqlite3 .backup` para o restic achar um arquivo consistente |

Tags desta leva: `tf-techfoot-api:20261109-v3` e `tf-techfoot-web:20261109-v3`. A próxima leva troca a data e o sufixo nos dois lugares: o `image:` do compose e o `docker build`. Não reutilize a tag de uma imagem que já rodou.

## O que a imagem assume

- Host OCI A1.Flex, `linux/arm64`. As bases pinadas `node:22.23.4-slim` e `nginxinc/nginx-unprivileged:1.27.4-alpine` publicam manifesto arm64. O Prisma pede o engine `linux-arm64-openssl-3.0.x` (OpenSSL 3 do Debian slim).
- A API roda com `node --experimental-strip-types`. O `npm ci --omit=dev` da imagem final não leva Vite, TypeScript, tsx nem Playwright. O CLI do Prisma fica, porque o arranque executa `prisma db push` no SQLite vazio.
- Os dois containers usam `user: "10001:10001"`. A imagem da API cria esse uid/gid. A imagem web parte do nginx-unprivileged (o usuário padrão dela é `nginx`, uid 101) e recria o mesmo uid 10001, com o cache, o log e o HTML nesse dono, para o nginx conseguir escrever temporários sem ser root.
- `NODE_ENV=production`, `WEB_ORIGIN=https://techfoot.techfernandes.com.br`, `TRUST_PROXY=true`. Esse `true` não abre mão do `X-Forwarded-For` inteiro: a API confia só em dois saltos privados (o nginx e, atrás dele, o Traefik). O cookie `tf` sai `Secure` e com `Max-Age` de 7 dias. Sem o salto privado, o Fastify não trata `X-Forwarded-Proto`.
- O navegador fala só com a origem do site. O nginx encaminha `/api/...` para a API e remove o prefixo. A API continua com `/health`, `/auth`, `/saves` e o resto.
- Apoio Pix continua sendo copiar a chave `futebadosparcas@outlook.com`. Sem nome e cidade reais não há BR Code. Checkout continua indisponível. Webhook verificado não libera recurso.

## 1. Build arm64

No servidor (já é arm64) ou numa máquina com buildx e QEMU:

```bash
docker buildx build --platform linux/arm64 \
  -t tf-techfoot-api:20261109-v3 --target api --load .
docker buildx build --platform linux/arm64 \
  -t tf-techfoot-web:20261109-v3 --target web --load .
```

Confira a arquitetura antes de subir:

```bash
docker image inspect tf-techfoot-api:20261109-v3 --format '{{.Architecture}}'
docker image inspect tf-techfoot-web:20261109-v3 --format '{{.Architecture}}'
```

Os dois precisam responder `arm64`. Guarde a tag anterior no disco até o smoke da nova passar.

## 2. Segredo e diretório de dados

O diretório e o env já estão no servidor. Confira antes de subir, não recrie por cima de um banco existente:

```bash
sudo stat -c '%u:%g %a %n' /srv/techfernandes/techfoot/data /srv/techfernandes/techfoot/techfoot.env /srv/techfernandes/techfoot/secrets/session_secret
```

O esperado é:

| Caminho | Dono | Modo |
|---|---|---|
| `/srv/techfernandes/techfoot/data` | 10001:10001 | 0750 |
| `/srv/techfernandes/techfoot/techfoot.env` | root:root | 0600 |
| `/srv/techfernandes/techfoot/secrets/session_secret` | root:root | 0400 |

O compose monta o diretório de dados em `/data`. `DATABASE_URL` dentro do container é `file:/data/techfoot.db`.

`techfoot.env` é a fonte de `NODE_ENV`, `WEB_ORIGIN` e `SESSION_SECRET`. O Compose lê esse arquivo no host com o usuário que invoca o comando. Como o modo é 0600 e o dono é root, o deploy tem que ser `sudo docker compose` (ou root). Um usuário comum recebe "permission denied" e a API sobe sem o segredo.

O arquivo em `secrets/session_secret` fica no host. O processo da API é uid 10001 e não consegue abrir um arquivo root 0400, mesmo com bind mount. Não use esse arquivo como volume. Se `SESSION_SECRET` não vier do env, o entrypoint ainda aceita `SESSION_SECRET_FILE` apontando para um caminho que o próprio processo consegue ler. Com o env de produção preenchido, essa variável não é necessária.

Se um dia for preciso repor o env, copie `deploy/techfoot.env.example`, troque o placeholder e aplique `chown root:root` e `chmod 600`. O texto `SUBSTITUA-POR-UM-SEGREDO-EXCLUSIVO` faz a API encerrar antes de escutar. Não commite a cópia.

`PIX_MERCHANT_NAME` e `PIX_MERCHANT_CITY` só entram juntos, com o nome e a cidade reais do recebedor. `PAYMENT_WEBHOOK_SECRET` só entra quando houver um provedor de verdade. Nenhum dos dois libera recurso nesta versão.

## 3. Primeiro deploy

O DNS de `techfoot.techfernandes.com.br` já aponta para este servidor. A rede `tf-edge` já existe por causa do Traefik. Ela precisa ser attachable para um container Compose entrar numa rede overlay. Não crie outra rede com o mesmo nome e não publique porta.

O compose que o servidor usa está em `/srv/techfernandes/techfoot/compose.prod.yaml`. O código de cada leva é baixado à parte; o arquivo em `/srv` não acompanha o git sozinho. Copie o compose desta leva para lá antes de subir.

```bash
sudo docker network inspect tf-edge --format '{{.Name}} {{.Driver}} {{.Attachable}}'
sudo cp deploy/compose.prod.yaml /srv/techfernandes/techfoot/compose.prod.yaml
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml up -d
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml ps
```

O arquivo da raiz `compose.yaml` é a receita local com porta em `127.0.0.1`. Não use esse arquivo no servidor.

## Leva 20261109-v2

Faça o backup do SQLite antes. No arranque, `prisma db push` acrescenta `sessionVersion INTEGER NOT NULL DEFAULT 0` na tabela `User`. As linhas que já existem ficam em 0. Não rode `prisma migrate deploy` neste banco: ele nasceu com `db push` e não tem baseline de `_prisma_migrations`. O SQL em `apps/api/prisma/migrations/20261109120000_session_version/migration.sql` documenta o mesmo `ALTER`.

Tokens antigos, sem o campo `sv`, contam como versão 0 e seguem válidos até um logout ou uma troca de senha. Essas duas ações somam 1 e o cookie anterior deixa de passar.

`GET /api/health` passa a responder só `{"ok":true,"db":"up"}` (ou 503 com `ok` e `db`). Não espere `payments` nesse JSON. O detalhe fica de fora em produção.

Senha nova: mínimo 8, máximo 128. Senha já gravada com menos de 8 ainda entra.

O nginx manda HSTS, CSP (`default-src 'self'`), `nosniff`, referrer e Permissions-Policy com `always`. O registro do service worker saiu do HTML inline. Fonte externa não é mais carregada.

`/robots.txt` e `/sitemap.xml` são arquivos estáticos do nginx. A política e os termos estão em `/privacidade` e `/termos`. O contato `futebadosparcas@outlook.com` está marcado como placeholder. CNPJ e endereço continuam por preencher.

Imagens: `tf-techfoot-api:20261109-v2` e `tf-techfoot-web:20261109-v2`, build arm64 no host. Não faça push para um registry daqui.

## Leva 20261109-v3

Faça o backup do SQLite antes. O arranque continua com `npx prisma db push --skip-generate`. Não rode `prisma migrate deploy`: o banco de produção nasceu com `db push`. O arquivo `apps/api/prisma/migrations/20261109143000_live_match/migration.sql` só documenta o `CREATE TABLE LiveMatch`. O `db push` cria essa tabela e o índice único em `saveId`. Saves antigos não ganham linha até o primeiro "Ir para o jogo".

Calendário de um save já em andamento: resultados já jogados ficam como estão. Rodadas ainda não jogadas são refeitas no turno/returno. Se o calendário antigo repetia o mesmo adversário, algumas rodadas futuras podem sair com menos jogos, porque o par já usou as duas partidas. A tabela é reconstruída a partir dos resultados gravados (pontos, cartões e forma). Não apague o save para "consertar" a tabela.

Contratos: na primeira carga depois desta leva, elenco com `contractGames` entre 1 e 30 é espalhado de 19 a 114 jogos, uma vez (`contractsReady`). Contrato zerado continua saindo. Aviso no inbox em 6 e em 3 jogos. Todo clube completa o elenco com base até 16. A forma física da rodada passa a cair para quem jogou e a subir para o elenco inteiro.

Copa do Brasil: 1ª fase em jogo único; oitavas em diante são ida e volta, sem gol fora. Empate no agregado vai para pênaltis. A copa tem data de quarta, entre as rodadas, e entra como jogo ao vivo próprio.

Imagens: `tf-techfoot-api:20261109-v3` e `tf-techfoot-web:20261109-v3`. Copie `deploy/compose.prod.yaml` para `/srv/techfernandes/techfoot/compose.prod.yaml` e suba com `sudo docker compose`. O `compose.yaml` da raiz escuta só em loopback e não entra no servidor. Não faça push das imagens para um registry daqui.

A API só entra em `techfoot-internal`. A web entra em `tf-edge` e em `techfoot-internal`. O Traefik precisa do provider Docker (não só do provider Swarm) para ler os labels deste container. O router `techfoot` escuta só o entrypoint `https`, com TLS e o serviço `techfoot` na porta 8080. O router `techfoot-http` escuta o entrypoint `http` e usa o middleware `techfoot-redirect`, definido nestes labels, para responder 301 para `https`. TLS não fica no entrypoint `http`.

## 4. Backup e restore

O banco fica em `/srv/techfernandes/techfoot/data/techfoot.db`. No arranque a API liga WAL (`journal_mode=WAL`), então aparecem também `techfoot.db-wal` e `techfoot.db-shm`. Não copie esses três arquivos à mão com o processo no ar.

O script usa `sqlite3 .backup`, que lê um banco WAL ao vivo e grava uma cópia consistente. O host precisa do binário `sqlite3`. O script não instala pacote.

Sugestão de cron, 02:30 UTC, antes do restic das 03:00. Não foi instalada daqui:

```
30 2 * * * root /srv/techfernandes/techfoot/backup-sqlite.sh >> /var/log/techfoot-backup.log 2>&1
```

Copie `deploy/backup-sqlite.sh` para `/srv/techfernandes/techfoot/backup-sqlite.sh`. Cada execução grava `data/backups/techfoot-AAAAMMDDTHHMMSSZ.db`, confere `integrity_check` e mantém 14 arquivos. O restic deve incluir `/srv/techfernandes/techfoot/data/backups`. O banco ao vivo pode estar no meio de um commit; a cópia do `.backup` é a que presta para restaurar.

Restore:

```bash
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml stop api
sudo rm -f /srv/techfernandes/techfoot/data/techfoot.db-wal \
           /srv/techfernandes/techfoot/data/techfoot.db-shm
sudo sqlite3 /srv/techfernandes/techfoot/data/backups/techfoot-ESCOLHIDO.db \
  ".backup '/srv/techfernandes/techfoot/data/techfoot.db'"
sudo chown 10001:10001 /srv/techfernandes/techfoot/data/techfoot.db
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml start api
```

## 5. Rollback

```bash
# compose.prod.yaml: volte as duas tags para a leva anterior e suba de novo
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml up -d
```

Não apague a imagem antiga antes do `/api/health` da nova responder `db: "up"`. O diretório `/data` fica no host; trocar a tag não apaga o SQLite. Se a leva nova tiver mudado o schema de um jeito incompatível, restaure o backup feito antes do deploy.

## 6. Smoke

De um container na rede `tf-edge` (não há porta no host):

```bash
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml exec web \
  wget -qO- http://127.0.0.1:8080/api/health
sudo docker compose -f /srv/techfernandes/techfoot/compose.prod.yaml exec web \
  wget -qS -O /dev/null http://127.0.0.1:8080/
```

O health precisa trazer `"ok":true` e `"db":"up"`, sem a chave Pix. A raiz precisa responder 200 com o HTML. Por fora:

```bash
curl -fsS https://techfoot.techfernandes.com.br/api/health
curl -fsSI https://techfoot.techfernandes.com.br/
```

Entre no site, crie uma conta e simule uma rodada. O cookie `tf` tem que ir com `Secure` e `HttpOnly`. Copiar a chave Pix não pode mostrar pagamento confirmado nem checkout habilitado.

## Fora deste repositório

- O DNS já resolve para o servidor. Certificado, firewall e a rede `tf-edge` continuam com a infra. O Traefik pede o certificado Let's Encrypt pelo resolver `letsencrypt` quando o container web aparecer na rede.
- Confirmar no banco, fora do jogo, que `futebadosparcas@outlook.com` recebe Pix.
- Nome e cidade reais do recebedor, se quiser QR. Provedor real, se um dia quiser webhook. Esta versão continua sem liberar recurso pago.
- Revisar uso comercial dos nomes dos clubes antes de divulgar o endereço.
