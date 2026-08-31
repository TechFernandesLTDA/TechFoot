import type { CupFixture, Fixture, Standing } from "./types.ts";
import { mulberry32 } from "./random.ts";

export function emptyStandings(clubIds: string[]): Standing[] {
  return clubIds.map((clubId) => ({
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    points: 0,
  }));
}

export function applyResult(table: Standing[], homeId: string, awayId: string, hg: number, ag: number): Standing[] {
  const next = table.map((row) => ({ ...row }));
  const home = next.find((r) => r.clubId === homeId);
  const away = next.find((r) => r.clubId === awayId);
  if (!home || !away) return next;
  home.played += 1;
  away.played += 1;
  home.gf += hg;
  home.ga += ag;
  away.gf += ag;
  away.ga += hg;
  if (hg > ag) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (ag > hg) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }
  return next;
}

export function sortTable(table: Standing[]): Standing[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.clubId.localeCompare(b.clubId);
  });
}

function singleRoundRobin(teamIds: string[]): { round: number; pairs: [string, string][] }[] {
  const ids = [...teamIds];
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = ids.slice();
  const out: { round: number; pairs: [string, string][] }[] = [];
  for (let r = 0; r < rounds; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push([a, b]);
    }
    out.push({ round: r + 1, pairs });
    const anchor = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop() as string;
    arr[0] = anchor;
    arr[1] = last;
    for (let i = 1; i < rest.length + 1; i++) arr[i] = rest[i - 1];
    void anchor;
  }
  return out;
}

export function doubleRoundRobin(clubIds: string[]): Fixture[] {
  const ids = clubIds.length % 2 === 1 ? [...clubIds, "BYE"] : [...clubIds];
  const firstLeg = singleRoundRobin(ids);
  const fixtures: Fixture[] = [];
  const maxRound = firstLeg.length;
  for (const { round, pairs } of firstLeg) {
    for (const [a, b] of pairs) {
      const swap = round % 2 === 1;
      fixtures.push({
        round,
        homeId: swap ? a : b,
        awayId: swap ? b : a,
        played: false,
      });
    }
  }
  // segundo turno: mesmas rodadas, mandos invertidos
  for (const { round, pairs } of firstLeg) {
    for (const [a, b] of pairs) {
      const swap = round % 2 === 0;
      fixtures.push({
        round: maxRound + round,
        homeId: swap ? a : b,
        awayId: swap ? b : a,
        played: false,
      });
    }
  }
  return fixtures.filter((f) => f.homeId !== "BYE" && f.awayId !== "BYE");
}

export function cupBracket(teamIds: string[], seed = 0): CupFixture[][] {
  const rng = mulberry32(seed + 991);
  const ids = [...teamIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const round: CupFixture[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    round.push({ slot: "R16", homeId: ids[i], awayId: ids[i + 1], played: false });
  }
  return [round];
}

export function resolveCup(
  cupFixtures: CupFixture[][],
  roundIndex: number,
  resolveMatch: (fixture: CupFixture) => { winnerId: string; homeGoals?: number; awayGoals?: number; penalties?: { home: number; away: number } },
): CupFixture[][] {
  const updated = cupFixtures[roundIndex].map((f) => {
    if (f.played) return f;
    const r = resolveMatch(f);
    return { ...f, played: true, winnerId: r.winnerId, homeGoals: r.homeGoals, awayGoals: r.awayGoals, penalties: r.penalties };
  });
  const result = [...cupFixtures];
  result[roundIndex] = updated;
  return result;
}

export function nextCupSlot(phaseGameCount: number): string {
  if (phaseGameCount >= 30) return "2ª fase";
  if (phaseGameCount >= 15) return "3ª fase";
  if (phaseGameCount === 8) return "4ª fase";
  if (phaseGameCount === 4) return "5ª fase";
  if (phaseGameCount === 2) return "Final";
  return "F";
}

export function resolvePenalties(
  homeGk: number,
  awayGk: number,
  seed: number,
): { home: number; away: number; winner: "home" | "away" } {
  const rng = mulberry32(seed + 777);
  const save = (gk: number) => rng() < Math.min(0.35, gk / 900);
  let home = 0;
  let away = 0;
  for (let k = 0; k < 5; k++) {
    if (!save(awayGk)) home++;
    if (!save(homeGk)) away++;
  }
  let sudden = 0;
  while (home === away) {
    sudden++;
    if (!save(awayGk)) home++;
    if (!save(homeGk)) away++;
    if (sudden >= 10) break;
  }
  const winner = home >= away ? "home" : "away";
  return { home, away, winner };
}

export function prizeFor(position: number): number {
  if (position === 1) return 2_000_000;
  if (position === 2) return 1_200_000;
  if (position === 3) return 800_000;
  if (position === 4) return 500_000;
  return 0;
}
