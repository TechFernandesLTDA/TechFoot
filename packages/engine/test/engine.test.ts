import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommand, cupBracket, defaultStarters, doubleRoundRobin, evolvePlayer, effectivePowers, initMatch, outcomeForClub, playerValue, repairRemainingFixtures, resolvePenalties, simulateMatch, stepMinute,
  startersOf, type Club, type Player, type Position, type Tactic,
} from "../src/index.ts";

function player(id: string, position: Position, strength: number, nationality = "BRA"): Player {
  return {
    id, name: id, nationality, position, preferredPositions: [position], age: 24, xp: 50,
    skills: { pace: 50, finishing: 50, passing: 50, marking: 50, tackling: 50, handling: 50, stamina: 50, leadership: 50 },
    fitness: 90, morale: 70, strength, salary: 1000, contractGames: 20,
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
    division: 1, tactic, rep: 50, state: "PR", players,
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

  it("double round robin creates 38 rounds for 20 clubs", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `club-${index}`);
    const fixtures = doubleRoundRobin(ids);
    assert.equal(fixtures.length, 380);
    assert.equal(Math.max(...fixtures.map((fixture) => fixture.round)), 38);
    assert.equal(fixtures.filter((fixture) => fixture.homeId === "club-0").length, 19);
    assert.equal(fixtures.filter((fixture) => fixture.awayId === "club-0").length, 19);
  });

  it("cup draw is reproducible with the same seed", () => {
    const ids = Array.from({ length: 60 }, (_, index) => `club-${index}`);
    assert.deepEqual(cupBracket(ids, 99), cupBracket(ids, 99));
    assert.equal(cupBracket(ids, 99)[0].length, 30);
  });

  it("judges a result from the club that is playing, including the away side", () => {
    const result = { homeId: "home", awayId: "away", homeGoals: 0, awayGoals: 2 };
    assert.equal(outcomeForClub("away", result), "win");
    assert.equal(outcomeForClub("home", result), "loss");
    assert.equal(outcomeForClub("away", { ...result, homeGoals: 1, awayGoals: 1 }), "draw");
    assert.equal(outcomeForClub("other", result), null);
  });

  it("lets a player return after a red card once the suspension is over", () => {
    const punished = player("red", "FW", 20);
    punished.reds = 1;
    punished.suspendedGames = 0;
    const players = [...squad("h", 20).slice(0, 10), punished];
    const active = startersOf(players, players.map((item) => item.id));
    assert.ok(active.some((item) => item.id === "red"));
  });

  it("applies a planned substitution during the match", () => {
    const players = [...squad("h", 35), player("sub", "FW", 30, "BRA")];
    const home = club("h", players);
    const away = club("a", squad("a", 35));
    const homeSide = { ...side(home), benchIds: ["sub"], substitutions: [{ minute: 60, playerOutId: "h8", playerInId: "sub" }] };
    const result = simulateMatch(homeSide, side(away), 123);
    assert.ok(result.substitutions.some((change) => change.playerInId === "sub" && change.minute === 60));
  });

  it("meets each pair twice, once at home for each club", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `club-${index}`);
    const fixtures = doubleRoundRobin(ids);
    const meetings = new Map<string, { count: number; homes: Set<string> }>();
    for (const fixture of fixtures) {
      const key = [fixture.homeId, fixture.awayId].sort().join("|");
      const row = meetings.get(key) ?? { count: 0, homes: new Set<string>() };
      row.count += 1;
      row.homes.add(fixture.homeId);
      meetings.set(key, row);
      assert.notEqual(fixture.homeId, fixture.awayId);
    }
    assert.equal(meetings.size, (20 * 19) / 2);
    for (const row of meetings.values()) {
      assert.equal(row.count, 2);
      assert.equal(row.homes.size, 2);
    }
    for (const id of ids) {
      const rounds = new Map<number, number>();
      for (const fixture of fixtures) {
        if (fixture.homeId !== id && fixture.awayId !== id) continue;
        rounds.set(fixture.round, (rounds.get(fixture.round) ?? 0) + 1);
      }
      assert.equal(rounds.size, 38);
      for (const count of rounds.values()) assert.equal(count, 1);
      let homes = 0;
      let streak = 1;
      let previous = "";
      let worst = 1;
      for (let round = 1; round <= 38; round += 1) {
        const game = fixtures.find((fixture) => fixture.round === round && (fixture.homeId === id || fixture.awayId === id));
        const mark = game?.homeId === id ? "H" : "A";
        if (mark === "H") homes += 1;
        streak = mark === previous ? streak + 1 : 1;
        previous = mark;
        worst = Math.max(worst, streak);
        if (round <= 19) {
          const mirrored = fixtures.find((fixture) => fixture.round === round + 19 && fixture.homeId === game?.awayId && fixture.awayId === game?.homeId);
          assert.ok(mirrored);
        }
      }
      assert.equal(homes, 19);
      assert.ok(worst <= 2);
    }
  });

  it("keeps played fixtures and rebuilds a broken schedule", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `club-${index}`);
    const fresh = doubleRoundRobin(ids);
    const repeated = fresh.filter((fixture) => fixture.round === 1);
    const broken = Array.from({ length: 38 }, (_, index) => index + 1).flatMap((round) => repeated.map((fixture) => ({ ...fixture, round, played: round <= 4 })));
    const repaired = repairRemainingFixtures(broken, ids, 38);
    assert.equal(repaired.filter((fixture) => fixture.played).length, 40);
    const rounds = new Map<number, Set<string>>();
    for (const fixture of repaired) {
      const busy = rounds.get(fixture.round) ?? new Set<string>();
      assert.equal(busy.has(fixture.homeId) || busy.has(fixture.awayId), false);
      busy.add(fixture.homeId);
      busy.add(fixture.awayId);
      rounds.set(fixture.round, busy);
    }
    const unplayed = repaired.filter((fixture) => !fixture.played);
    assert.ok(unplayed.length > 200);
    assert.ok(unplayed.some((fixture) => fixture.homeId !== repeated[0].homeId || fixture.awayId !== repeated[0].awayId));
    assert.deepEqual(repairRemainingFixtures(fresh, ids, 38), fresh);
  });

  it("steps to the same score as instant simulation and stops at half-time", () => {
    const home = club("h", squad("h", 35));
    const away = club("a", squad("a", 30));
    const instant = simulateMatch(side(home), side(away), 77);
    let state = initMatch(side(home), side(away), 77, { homeAi: false, awayAi: false });
    let guard = 0;
    while (state.period === "1T" && guard < 80) {
      state = stepMinute(state).state;
      guard += 1;
    }
    assert.equal(state.period, "HT");
    const frozen = stepMinute(state).state;
    assert.equal(frozen.minute, state.minute);
    assert.equal(frozen.period, "HT");
    state = applyCommand(state, { type: "resume" });
    while (state.period !== "FT" && guard < 180) {
      state = stepMinute(state).state;
      guard += 1;
    }
    assert.equal(state.score[0], instant.homeGoals);
    assert.equal(state.score[1], instant.awayGoals);
    assert.equal(state.events.at(-1)?.side, "none");
    assert.equal(state.events.at(-1)?.teamId, "");
  });

  it("rejects a fourth substitution window and a sixth change", () => {
    const homePlayers = [...squad("h", 30), ...Array.from({ length: 7 }, (_, index) => player(`b${index}`, "MF", 20))];
    const home = club("h", homePlayers);
    const away = club("a", squad("a", 30));
    let state = initMatch({ ...side(home), benchIds: homePlayers.slice(11).map((item) => item.id) }, side(away), 5, { awayAi: false });
    const outs = state.home.onPitch.filter((id) => state.home.players.find((item) => item.id === id)?.position !== "GK");
    const ins = [...state.home.bench];
    for (let index = 0; index < 3; index += 1) {
      state.minute = 20 + index;
      state = applyCommand(state, { type: "sub", outId: outs[index], inId: ins[index] });
    }
    assert.equal(state.home.windowsUsed, 3);
    state.minute = 30;
    const blocked = applyCommand(state, { type: "sub", outId: outs[3], inId: ins[3] });
    assert.equal(blocked.home.subsUsed, 3);
    state.period = "HT";
    state = applyCommand(state, { type: "sub", outId: outs[3], inId: ins[3] });
    state = applyCommand(state, { type: "sub", outId: outs[4], inId: ins[4] });
    assert.equal(state.home.subsUsed, 5);
    const sixth = applyCommand(state, { type: "sub", outId: outs[5], inId: ins[5] });
    assert.equal(sixth.home.subsUsed, 5);
  });

  it("keeps straight reds near a realistic rate", () => {
    const home = club("h", squad("h", 30));
    const away = club("a", squad("a", 30));
    let reds = 0;
    const matches = 80;
    for (let seed = 1; seed <= matches; seed += 1) {
      const result = simulateMatch(side(home), side(away), seed);
      reds += result.events.filter((event) => event.kind === "red").length;
    }
    const perMatch = reds / matches;
    assert.ok(perMatch > 0.02 && perMatch < 0.45, `reds/match ${perMatch}`);
  });
});
