import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attackPower,
  defaultStarters,
  sectorPower,
  simulateMatch,
  startersOf,
} from "../src/index.ts";
import type { Club, Player, Position } from "../src/types.ts";

function player(id: string, position: Position, strength: number, nationality = "BRA"): Player {
  return {
    id,
    name: id,
    nationality,
    position,
    strength,
    salary: 1000,
    contractGames: 20,
    behavior: 3,
    injuredGames: 0,
    yellows: 0,
    reds: 0,
  };
}

function squad(prefix: string, strength: number, nationality = "BRA"): Player[] {
  const positions: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  return positions.map((position, i) => player(`${prefix}${i}`, position, strength, nationality));
}

function club(id: string, players: Player[]): Club {
  return {
    id,
    name: id,
    city: "Curitiba",
    country: "BRA",
    colors: ["#0d3b2e", "#f4ead5"],
    stadiumName: "Campo",
    stadiumCapacity: 10000,
    cash: 1_000_000,
    morale: 70,
    players,
  };
}

describe("engine", () => {
  it("same seed yields same result", () => {
    const home = club("h", squad("h", 35));
    const away = club("a", squad("a", 28));
    const homeIds = defaultStarters(home.players);
    const awayIds = defaultStarters(away.players);
    const a = simulateMatch({ club: home, starterIds: homeIds }, { club: away, starterIds: awayIds }, 42);
    const b = simulateMatch({ club: home, starterIds: homeIds }, { club: away, starterIds: awayIds }, 42);
    assert.equal(a.homeGoals, b.homeGoals);
    assert.equal(a.awayGoals, b.awayGoals);
    assert.deepEqual(a.events, b.events);
  });

  it("stronger side scores more over many seeds", () => {
    const home = club("h", squad("h", 48));
    const away = club("a", squad("a", 12));
    const homeIds = defaultStarters(home.players);
    const awayIds = defaultStarters(away.players);
    let hg = 0;
    let ag = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateMatch({ club: home, starterIds: homeIds }, { club: away, starterIds: awayIds }, seed);
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

  it("local nationality increases sector power", () => {
    const locals = [player("a", "DF", 20, "BRA"), player("b", "DF", 20, "BRA")];
    const mixed = [player("c", "DF", 20, "BRA"), player("d", "DF", 20, "ARG")];
    assert.ok(sectorPower(locals, "BRA", "DF") > sectorPower(mixed, "BRA", "DF"));
  });

  it("midfielders contribute to attack at half weight", () => {
    const fw = [player("f", "FW", 20, "BRA")];
    const fwMf = [player("f", "FW", 20, "BRA"), player("m", "MF", 20, "BRA")];
    assert.ok(attackPower(fwMf, "BRA") > attackPower(fw, "BRA"));
  });
});
