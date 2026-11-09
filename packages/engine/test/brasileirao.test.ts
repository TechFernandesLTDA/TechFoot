import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWinner, applyResult, copaFirstRound, emptyStandings, pointsRate, sortTable, tableZone } from "../src/index.ts";

function row(clubId: string, points: number, won: number, gf: number, ga: number, yellows = 0, reds = 0) {
  const standing = emptyStandings([clubId])[0];
  standing.points = points;
  standing.won = won;
  standing.gf = gf;
  standing.ga = ga;
  standing.played = won;
  standing.yellows = yellows;
  standing.reds = reds;
  return standing;
}

describe("brasileirão", () => {
  it("gives 3, 1 and 0 points", () => {
    const table = applyResult(emptyStandings(["a", "b"]), "a", "b", 2, 0);
    assert.equal(table.find((item) => item.clubId === "a")?.points, 3);
    const drawn = applyResult(emptyStandings(["a", "b"]), "a", "b", 1, 1);
    assert.equal(drawn[0].points, 1);
    assert.equal(drawn[1].points, 1);
    assert.equal(pointsRate(4, 2), 66.7);
  });

  it("breaks ties by wins, goal difference, goals, head-to-head, cards and a seeded draw", () => {
    const tied = [row("beta", 10, 3, 8, 4), row("alpha", 10, 3, 8, 4)];
    const homeWin = sortTable(tied, [{ homeId: "alpha", awayId: "beta", homeGoals: 1, awayGoals: 0 }], 7);
    assert.deepEqual(homeWin.map((item) => item.clubId), ["alpha", "beta"]);
    const fewerReds = sortTable(
      [row("beta", 10, 3, 8, 4, 2, 0), row("alpha", 10, 3, 8, 4, 4, 1)],
      [{ homeId: "alpha", awayId: "beta", homeGoals: 1, awayGoals: 1 }],
      7,
    );
    assert.deepEqual(fewerReds.map((item) => item.clubId), ["beta", "alpha"]);
    const first = sortTable(tied, [], 3).map((item) => item.clubId);
    const second = sortTable(tied, [], 3).map((item) => item.clubId);
    assert.deepEqual(first, second);
    const moreWins = sortTable([row("low", 10, 4, 5, 5), row("high", 10, 2, 9, 1)], [], 1);
    assert.equal(moreWins[0].clubId, "low");
  });

  it("colours Série A and Série B like the Brazilian table", () => {
    assert.equal(tableZone(1, 1), "libertadores");
    assert.equal(tableZone(1, 4), "libertadores");
    assert.equal(tableZone(1, 5), "libertadores-pre");
    assert.equal(tableZone(1, 6), "libertadores-pre");
    assert.equal(tableZone(1, 7), "sul-americana");
    assert.equal(tableZone(1, 12), "sul-americana");
    assert.equal(tableZone(1, 13), "mid");
    assert.equal(tableZone(1, 17), "relegation");
    assert.equal(tableZone(1, 20), "relegation");
    assert.equal(tableZone(2, 4), "promotion");
    assert.equal(tableZone(2, 5), "mid");
    assert.equal(tableZone(2, 17), "relegation");
    assert.equal(tableZone(3, 1), "promotion");
    assert.equal(tableZone(3, 17), "mid");
  });

  it("ignores away goals and uses penalties only on an aggregate draw", () => {
    const level = aggregateWinner(
      { homeId: "a", awayId: "b", homeGoals: 2, awayGoals: 1 },
      { homeId: "b", awayId: "a", homeGoals: 1, awayGoals: 0 },
      { winner: "home" },
    );
    assert.equal(level.decidedBy, "penalties");
    assert.equal(level.winnerId, "b");
    const clear = aggregateWinner(
      { homeId: "a", awayId: "b", homeGoals: 1, awayGoals: 0 },
      { homeId: "b", awayId: "a", homeGoals: 0, awayGoals: 0 },
    );
    assert.equal(clear.winnerId, "a");
    assert.equal(clear.decidedBy, "aggregate");
  });

  it("gives four Série A byes and a single-leg first round to everyone else", () => {
    const clubs = [
      ...Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, division: 1 as const, rep: 80 - index })),
      ...Array.from({ length: 20 }, (_, index) => ({ id: `b${index}`, division: 2 as const, rep: 50 })),
      ...Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, division: 3 as const, rep: 20 })),
    ];
    const cup = copaFirstRound(clubs, 11);
    assert.deepEqual(cup.byes, ["a0", "a1", "a2", "a3"]);
    assert.equal(cup.fixtures.length, 28);
    assert.ok(cup.fixtures.every((fixture) => fixture.singleLeg && fixture.leg === 1));
    const playing = new Set(cup.fixtures.flatMap((fixture) => [fixture.homeId, fixture.awayId]));
    assert.equal(playing.size, 56);
    for (const bye of cup.byes) assert.equal(playing.has(bye), false);
  });
});
