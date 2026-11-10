import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextCommitment } from "@techfoot/engine";
import { createCareer, loadWorld, simulateRound } from "../src/career.ts";

describe("shared commitment", () => {
  it("simulateRound returns the fixture nextCommitment already named", () => {
    const world = loadWorld();
    const career = createCareer(world.clubs[0].id, 2026, 3);
    const league = nextCommitment(career);
    assert.equal(league.kind, "league");
    const played = simulateRound(structuredClone(career));
    assert.equal(played.userMatch?.homeId, league.fixture?.homeId);
    assert.equal(played.userMatch?.awayId, league.fixture?.awayId);

    const cupCareer = createCareer(world.clubs[0].id, 2026, 3);
    cupCareer.round = 3;
    const rival = cupCareer.clubs.find((club) => club.id !== cupCareer.clubId)!;
    const phase = cupCareer.cup[cupCareer.cupRound];
    phase[0] = { ...phase[0], homeId: cupCareer.clubId, awayId: rival.id, played: false, winnerId: undefined };
    const cup = nextCommitment(cupCareer);
    assert.equal(cup.kind, "cup");
    assert.equal(cup.phase, "cupMidweek");
    const cupResult = simulateRound(structuredClone(cupCareer));
    assert.equal(cupResult.userMatch?.homeId, cup.fixture?.homeId);
    assert.equal(cupResult.userMatch?.awayId, cup.fixture?.awayId);
  });
});
