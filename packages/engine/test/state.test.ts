import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommand, beginShootout, contractStatus, cupSlotAfter, displayMinute, endFirstHalf, enterStoppage, finishMatch, initMatch,
  lineupStatus, livePhase, nextCommitment, nextCupSlot, playerAvailability, resumeSecondHalf, statusForPhase, stepMinute, userSideOf,
  type Club, type Player, type Position,
} from "../src/index.ts";

function player(id: string, position: Position): Player {
  return {
    id, name: id, nationality: "BRA", position, preferredPositions: [position], age: 24, xp: 0,
    skills: { pace: 50, finishing: 50, passing: 50, marking: 50, tackling: 50, handling: 50, stamina: 50, leadership: 50 },
    fitness: 90, morale: 70, strength: 30, salary: 1000, contractGames: 20,
    behavior: 3, injuredGames: 0, yellows: 0, reds: 0, goals: 0, matches: 0, suspendedGames: 0,
  };
}

function club(id: string): Club {
  const positions: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  return {
    id, name: id, city: "Cidade", state: "PR", country: "BRA", colors: ["#111", "#eee"],
    stadiumName: "Campo", stadiumCapacity: 1000, cash: 1, morale: 70, division: 1, tactic: "balanced", rep: 50,
    players: [...positions.map((position, index) => player(`${id}-${index}`, position)), player(`${id}-b`, "MF")],
  };
}

function side(c: Club) {
  return { club: c, starterIds: c.players.slice(0, 11).map((item) => item.id), tactic: c.tactic };
}

describe("career commitment", () => {
  const base = {
    clubId: "me",
    season: 2026,
    round: 1,
    cupRound: 0,
    cupFinalPlayed: false,
    fixtures: [{ round: 1, homeId: "me", awayId: "them", played: false }],
    cup: [[{ slot: "1ª fase", leg: 1 as const, singleLeg: true, homeId: "me", awayId: "them", played: false }]],
    history: [],
  };

  it("keeps the opening league match ahead of a cup that is not due", () => {
    const commitment = nextCommitment(base);
    assert.equal(commitment.kind, "league");
    assert.equal(commitment.phase, "inSeason");
    assert.equal(commitment.fixture?.homeId, "me");
    assert.equal(commitment.fixture?.awayId, "them");
  });

  it("points league and cup callers at the midweek cup once the anchor has passed", () => {
    const commitment = nextCommitment({ ...base, round: 3 });
    assert.equal(commitment.kind, "cup");
    assert.equal(commitment.phase, "cupMidweek");
    assert.equal(commitment.label.includes("1ª fase"), true);
    assert.equal(commitment.fixture?.homeId, "me");
  });

  it("names the cup that remains after the league calendar", () => {
    const commitment = nextCommitment({ ...base, round: 3, fixtures: [{ round: 1, homeId: "me", awayId: "them", played: true }] });
    assert.equal(commitment.phase, "awaitingCupAfterLeague");
    assert.equal(commitment.kind, "cup");
  });

  it("treats a fresh calendar after a stored season as preseason", () => {
    const commitment = nextCommitment({ ...base, history: [{ season: 2025 }] });
    assert.equal(commitment.kind, "preseason");
    assert.equal(commitment.phase, "preseason");
    assert.equal(commitment.fixture?.round, 1);
  });

  it("closes the season when nothing is left to play", () => {
    const commitment = nextCommitment({
      ...base,
      fixtures: [{ round: 1, homeId: "me", awayId: "them", played: true }],
      cup: [[{ slot: "Final", leg: 1 as const, singleLeg: true, homeId: "me", awayId: "them", played: true }]],
      cupFinalPlayed: true,
    });
    assert.equal(commitment.kind, "seasonReview");
  });

  it("uses one cup vocabulary", () => {
    assert.equal(cupSlotAfter("1ª fase"), "Oitavas");
    assert.equal(cupSlotAfter("Oitavas"), "Quartas");
    assert.equal(cupSlotAfter("Quartas"), "Semi");
    assert.equal(cupSlotAfter("Semi"), "Final");
    assert.equal(cupSlotAfter("2ª fase"), "Oitavas");
    assert.equal(nextCupSlot(30), "Oitavas");
    assert.equal(nextCupSlot(2), "Final");
    assert.equal(nextCupSlot(8).includes("fase"), false);
  });
});

describe("live phase", () => {
  it("shows the board before the added minute and one clock afterwards", () => {
    let state = initMatch(side(club("h")), side(club("a")), 11, { homeAi: false, awayAi: true });
    let guard = 0;
    while ((state.minute < 45 || state.stoppage === 0) && guard < 80) {
      state = stepMinute(state).state;
      guard += 1;
    }
    assert.equal(state.minute, 45);
    assert.ok(state.stoppage > 0);
    assert.equal(state.stoppagePlayed, 0);
    assert.equal(livePhase(state), "firstStoppage");
    assert.equal(displayMinute(state), "45'");
    assert.equal(statusForPhase(livePhase(state)), "live");
    state.stoppage = Math.max(state.stoppage, 3);
    state = stepMinute(state).state;
    assert.equal(state.period, "1T");
    assert.equal(state.stoppagePlayed, 1);
    assert.equal(displayMinute(state), "45+1");
  });

  it("names half-time, the restart and full time", () => {
    const state = initMatch(side(club("h")), side(club("a")), 4);
    state.minute = 45;
    state.stoppagePlayed = 1;
    enterStoppage(state, 1);
    endFirstHalf(state);
    assert.equal(livePhase(state), "halfTime");
    assert.equal(displayMinute(state), "INTERVALO");
    assert.equal(statusForPhase(livePhase(state)), "halftime");
    resumeSecondHalf(state);
    assert.equal(state.period, "2T");
    assert.equal(state.stoppage, 0);
    assert.equal(livePhase(state), "secondHalf");
    finishMatch(state);
    assert.equal(livePhase(state), "fullTime");
    assert.equal(displayMinute(state), "FIM");
    assert.equal(statusForPhase(livePhase(state)), "fulltime");
    assert.equal(statusForPhase(livePhase(state), true), "finished");
  });

  it("keeps a cup shootout visible after the final whistle without leaving the period open", () => {
    const state = initMatch(side(club("h")), side(club("a")), 4, { kind: "cup", decider: true });
    state.score = [1, 1];
    beginShootout(state, { home: 4, away: 5, winner: "away" });
    assert.equal(state.period, "PEN");
    assert.equal(livePhase(state), "penalties");
    finishMatch(state);
    assert.equal(state.period, "FT");
    assert.equal(livePhase(state), "penalties");
    assert.equal(displayMinute(state), "PÊNALTIS");
    assert.equal(statusForPhase(livePhase(state)), "fulltime");
  });

  it("commands the side that is not marked as AI", () => {
    const home = club("h");
    const away = club("a");
    const state = initMatch(
      { ...side(home), benchIds: [home.players.at(-1)!.id] },
      { ...side(away), benchIds: [away.players.at(-1)!.id] },
      8,
      { homeAi: true, awayAi: false },
    );
    assert.equal(userSideOf(state), "away");
    const out = state.away.onPitch.find((id) => state.away.players.find((item) => item.id === id)?.position !== "GK");
    const next = applyCommand(state, { type: "sub", outId: out!, inId: state.away.bench[0] });
    assert.equal(next.away.subsUsed, 1);
    assert.equal(next.home.subsUsed, 0);
    const talked = applyCommand({ ...next, period: "HT" }, { type: "talk", talk: "motivar" });
    assert.equal(talked.away.talk > 0, true);
    assert.equal(talked.home.talk, 0);
    assert.equal(talked.period, "HT");
  });
});

describe("availability and contracts", () => {
  it("derives availability, contract and lineup without stored enums", () => {
    assert.equal(playerAvailability({ injuredGames: 2, suspendedGames: 0 }), "injured");
    assert.equal(playerAvailability({ injuredGames: 0, suspendedGames: 1 }), "suspended");
    assert.equal(playerAvailability({ injuredGames: 0, suspendedGames: 0 }), "available");
    assert.equal(contractStatus(0), "expired");
    assert.equal(contractStatus(6), "expiring");
    assert.equal(contractStatus(7), "ok");
    assert.equal(lineupStatus(["a"], ["a", "b"]), "incomplete");
    assert.equal(lineupStatus(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"], ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]), "saved");
    assert.equal(lineupStatus(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "z"], ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]), "draft");
  });
});
