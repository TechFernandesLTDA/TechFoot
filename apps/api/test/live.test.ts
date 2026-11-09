import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createCareer, loadWorld, simulateRound } from "../src/career.ts";
import { prisma } from "../src/db.ts";
import { buildApp } from "../src/server.ts";

let app: FastifyInstance;

async function registerAndSave() {
  const email = `live-${Date.now()}-${Math.random().toString(16).slice(2)}@test.co`;
  const registered = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { name: "Ao vivo", email, password: "secret12", acceptTerms: true, age18: true },
  });
  assert.equal(registered.statusCode, 200);
  const cookie = String(registered.headers["set-cookie"]).split(";")[0];
  const world = await app.inject({ method: "GET", url: "/world" });
  const clubId = world.json().clubs[0].id as string;
  const save = await app.inject({ method: "POST", url: "/saves", headers: { cookie }, payload: { clubId } });
  assert.equal(save.statusCode, 200);
  return { cookie, id: save.json().id as string, career: save.json().career };
}

describe("live match", () => {
  before(async () => {
    delete process.env.TRUST_PROXY;
    app = await buildApp();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("stops at half-time, accepts one sub, finishes once and blocks a second simulation", async () => {
    const { cookie, id } = await registerAndSave();
    const started = await app.inject({ method: "POST", url: `/saves/${id}/matchday`, headers: { cookie } });
    assert.equal(started.statusCode, 200);
    const first = started.json();
    assert.equal(first.live.minute, 0);
    assert.equal(first.live.period, "1T");
    const liveId = first.live.id as string;
    let version = first.live.version as number;
    const jumped = await app.inject({
      method: "POST",
      url: `/live/${liveId}/advance`,
      headers: { cookie },
      payload: { toMinute: 200, version },
    });
    assert.equal(jumped.statusCode, 200);
    assert.equal(jumped.json().live.period, "HT");
    version = jumped.json().live.version;
    const stale = await app.inject({
      method: "POST",
      url: `/live/${liveId}/advance`,
      headers: { cookie },
      payload: { toMinute: 200, version: version - 1 },
    });
    assert.equal(stale.statusCode, 409);
    const blocked = await app.inject({ method: "POST", url: `/saves/${id}/simulate-round`, headers: { cookie } });
    assert.equal(blocked.statusCode, 409);
    const bench = first.live.home.bench[0] as string;
    const out = (first.live.home.onPitch as string[]).find((playerId) => playerId !== first.live.home.players.find((player: { position: string; id: string }) => player.position === "GK")?.id);
    const sub = await app.inject({
      method: "POST",
      url: `/live/${liveId}/command`,
      headers: { cookie },
      payload: { atMinute: jumped.json().live.minute, version, cmd: { type: "sub", outId: out, inId: bench } },
    });
    assert.equal(sub.statusCode, 200);
    assert.equal(sub.json().live.home.subsUsed, 1);
    version = sub.json().live.version;
    const sixthWindow = sub.json().live.home.windowsUsed as number;
    assert.equal(sixthWindow, 0);
    const resumed = await app.inject({ method: "POST", url: `/live/${liveId}/resume`, headers: { cookie }, payload: { version } });
    assert.equal(resumed.statusCode, 200);
    assert.equal(resumed.json().live.period, "2T");
    version = resumed.json().live.version;
    const ended = await app.inject({
      method: "POST",
      url: `/live/${liveId}/advance`,
      headers: { cookie },
      payload: { toMinute: 200, version },
    });
    assert.equal(ended.statusCode, 200);
    assert.equal(ended.json().live.period, "FT");
    version = ended.json().live.version;
    const done = await app.inject({ method: "POST", url: `/live/${liveId}/finish`, headers: { cookie }, payload: { version } });
    assert.equal(done.statusCode, 200);
    assert.equal(done.json().already, false);
    const points = done.json().career.table.find((row: { clubId: string }) => row.clubId === done.json().career.clubId).points as number;
    const again = await app.inject({ method: "POST", url: `/live/${liveId}/finish`, headers: { cookie }, payload: { version } });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().already, true);
    const pointsAgain = again.json().career.table.find((row: { clubId: string }) => row.clubId === again.json().career.clubId).points as number;
    assert.equal(pointsAgain, points);
    assert.equal(again.json().career.round, done.json().career.round);
  });
});

describe("contracts and fixtures on load", () => {
  it("staggers contracts, counts every club down and keeps a squad of 16", () => {
    const world = loadWorld();
    const career = createCareer(world.clubs[0].id, 2026, 9);
    const lengths = career.clubs.flatMap((club) => club.players.map((player) => player.contractGames));
    assert.ok(lengths.every((games) => games >= 19 && games <= 114));
    assert.ok(Math.max(...lengths) - Math.min(...lengths) > 20);
    const rival = career.clubs.find((club) => club.id !== career.clubId)!;
    const sample = rival.players[0];
    sample.contractGames = 40;
    sample.fitness = 40;
    const mine = career.clubs.find((club) => club.id === career.clubId)!;
    const warning = mine.players.find((player) => !career.starterIds.includes(player.id))!;
    warning.contractGames = 7;
    const { career: next } = simulateRound(career);
    const after = next.clubs.find((club) => club.id === rival.id)!.players.find((player) => player.id === sample.id)!;
    assert.equal(after.contractGames, 39);
    assert.ok(after.fitness >= 47);
    assert.ok(next.inbox.some((message) => message.kind === "contract" && message.title.includes("perto")));
    const rebuilt = createCareer(world.clubs[1].id, 2026, 4);
    const squad = rebuilt.clubs.find((club) => club.id === rebuilt.clubId)!;
    squad.players.forEach((player, index) => {
      if (index >= 12) player.contractGames = 1;
    });
    const filled = simulateRound(rebuilt).career.clubs.find((club) => club.id === rebuilt.clubId)!;
    assert.ok(filled.players.length >= 16);
  });
});
