import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outcomeForClub } from "@techfoot/engine";
import { buyPlayer, createCareer, loadWorld, sellPlayer, simulateRound } from "../src/career.ts";

describe("career rules", () => {
  it("sells a player into the free-agent pool and allows buying them back", () => {
    const world = loadWorld();
    const career = createCareer(world.clubs[0].id, 2026, 7);
    const squad = career.clubs.find((club) => club.id === career.clubId)!;
    const reserve = squad.players.find((player) => !career.starterIds.includes(player.id));
    assert.ok(reserve);
    const before = career.finances;
    const sold = sellPlayer(career, reserve!.id);
    assert.equal(sold.clubs.find((club) => club.id === career.clubId)!.players.some((player) => player.id === reserve!.id), false);
    assert.ok(sold.freeAgents.some((player) => player.id === reserve!.id));
    assert.equal(sold.market.find((entry) => entry.playerId === reserve!.id)?.clubId, null);
    const bought = buyPlayer(sold, reserve!.id);
    assert.ok(bought.clubs.find((club) => club.id === career.clubId)!.players.some((player) => player.id === reserve!.id));
    assert.ok(bought.finances > before);
  });

  it("scores an away match from the manager's club, not from the home side", () => {
    const world = loadWorld();
    const probe = createCareer(world.clubs[0].id, 2026, 1);
    const awayId = probe.fixtures.find((fixture) => fixture.round === 1)!.awayId;
    let checked = false;
    for (let seed = 1; seed <= 30 && !checked; seed += 1) {
      const career = createCareer(awayId, 2026, seed);
      const starterId = career.starterIds[1];
      const before = career.clubs.find((club) => club.id === awayId)!.players.find((player) => player.id === starterId)!.morale;
      const { career: next, userMatch } = simulateRound(career);
      assert.ok(userMatch);
      assert.equal(userMatch!.awayId, awayId);
      const outcome = outcomeForClub(awayId, userMatch!);
      if (outcome === "draw" || before <= 3 || before >= 97) continue;
      const after = next.clubs.find((club) => club.id === awayId)!.players.find((player) => player.id === starterId)!.morale;
      assert.equal(after - before, outcome === "win" ? 3 : -3);
      checked = true;
    }
    assert.equal(checked, true);
  });

  it("makes a player already injured miss the round instead of healing them first", () => {
    const world = loadWorld();
    const career = createCareer(world.clubs[3].id, 2026, 4);
    const injuredId = career.starterIds[4];
    const player = career.clubs.find((club) => club.id === career.clubId)!.players.find((item) => item.id === injuredId)!;
    player.injuredGames = 1;
    const kept = career.starterIds.filter((id) => id !== injuredId);
    const { career: next } = simulateRound(career);
    assert.equal(next.starterIds.includes(injuredId), false);
    assert.equal(next.starterIds.length, 11);
    for (const id of kept) assert.equal(next.starterIds.includes(id), true);
    assert.equal(next.clubs.find((club) => club.id === career.clubId)!.players.find((item) => item.id === injuredId)!.injuredGames, 0);
  });
});
