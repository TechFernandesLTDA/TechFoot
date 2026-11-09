-- Documentação da leva 20261109-v3.
-- O banco de produção foi criado com `prisma db push`, não com migrate deploy.
-- Não rode `prisma migrate deploy` nesse arquivo. O entrypoint continua em
-- `npx prisma db push --skip-generate`, que cria a tabela LiveMatch sem apagar o save.
--
-- Saves antigos: na primeira leitura, contratos ainda na escala curta (1 a 30 jogos)
-- são redistribuídos entre 19 e 114. Um contrato já renovado acima de 30 não muda.
-- A tabela e os jogos já disputados ficam como estão. Rodadas ainda não jogadas
-- de um calendário repetido (o mesmo adversário o campeonato inteiro) são
-- refeitas. Rodadas já jogadas podem continuar mais leves, porque o confronto
-- repetido ocupa vaga e não é reescrito.

CREATE TABLE IF NOT EXISTS "LiveMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saveId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "otherGames" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LiveMatch_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveMatch_saveId_key" ON "LiveMatch"("saveId");
