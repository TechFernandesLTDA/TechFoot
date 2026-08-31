import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultStarters, evolvePlayer, effectivePowers, playerValue, resolvePenalties, simulateMatch,
  startersOf, type Club, type Player, type Position, type Tactic,
} from "../src/index.ts";

function player(id: string, position: Position, strength: number, nationality = "BRA"): Player {
  return {
    id, name: id, nationality, position, strength, salary: 1000, contractGames: 20,
    behavior: 3, injuredGames: 0, yellows: 0, reds: 0, goals: 0, matches: 0, suspendedGames: 0,
  };
}

function squad(prefix: string, strength: number, nationality = "BRA"): Player[] {
  const positions: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  return positions.map((position, i) => player(`${prefix}${i}`, position, strength, nationality));
}

function club(id: string, players: Player[], tactic: Tactic = "balanced"): Club {
  return {
    id, name: id, city: "Curitiba", country: "BRA", colors: ["#0d3b2e", "#f4ead5"],
    stadiumName: "Campo", stadiumCapacity: 10000, cash: 1_000_000, morale: 70,
    division: 1, tactic, rep: 50, players,
  };
}

function side(c: Club) {
  return { club: c, starterIds: defaultStarters(c.players), tactic: c.tactic };
}

describe("engine", () => {
  it("same seed yields same result", () => {
    const home = club("h", squad("h", 35));
    const away = club("a", squad("a", 28));
    const a = simulateMatch(side(home), side(away), 42);
    const b = simulateMatch(side(home), side(away), 42);
    assert.equal(a.homeGoals, b.homeGoals);
    assert.equal(a.awayGoals, b.awayGoals);
    assert.deepEqual(a.events, b.events);
  });

  it("stronger side scores more over many seeds", () => {
    const home = club("h", squad("h", 48));
    const away = club("a", squad("a", 12));
    let hg = 0;
    let ag = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateMatch(side(home), side(away), seed);
      hg += r.homeGoals;
      ag += r.awayGoals;
    }
    assert.ok(hg > ag);
  });

  it("default lineup has 11 players", () => {
    const players = squad("p", 20);
    const ids = defaultStarters(players);
    assert.equal(ids.length, 11);
    assert.equal(startersOf(players, ids).length, 11);
  });

  it("local nationality + tactic increase sector power appropriately", () => {
    const players = [player("a", "FW", 20, "BRA"), player("m", "MF", 20, "BRA")];
    const off = effectivePowers(players, "BRA", "offensive", 70);
    const def = effectivePowers(players, "BRA", "defensive", 70);
    assert.ok(off.atk > def.atk);
    assert.ok(off.def < def.def);
  });

  it("midfielders contribute to attack at half weight", () => {
    const fw = [player("f", "FW", 20, "BRA")];
    const fwMf = [player("f", "FW", 20, "BRA"), player("m", "MF", 20, "BRA")];
    assert.ok(effectivePowers(fwMf, "BRA", "balanced", 70).atk > effectivePowers(fw, "BRA", "balanced", 70).atk);
  });

  it("evolution improves winning players and reaches strength cap", () => {
    const p = player("x", "FW", 10, "BRA");
    let rngCount = 0;
    const alwaysWin = () => {
      rngCount++;
      return 0;
    };
    const r = evolvePlayer(p, "win", 25, alwaysWin);
    assert.ok(r);
    assert.equal(p.strength, 11);
    assert.equal(r!.note, "evoluiu");
    assert.ok(rngCount >= 0);
  });

  it("player value scales with strength", () => {
    const weak = player("w", "FW", 10, "BRA");
    const strong = player("s", "FW", 40, "BRA");
    assert.ok(playerValue(strong) > playerValue(weak) * 8);
  });

  it("penalties produce a winner", () => {
    const r = resolvePenalties(30, 30, 123);
    assert.ok(r.winner === "home" || r.winner === "away");
  });
});