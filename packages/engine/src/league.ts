import type { CupFixture, Fixture, FormMark, Standing } from "./types.ts";
import { mulberry32 } from "./random.ts";

export type RankedMatch = { homeId: string; awayId: string; homeGoals: number; awayGoals: number };
export type TableZone = "libertadores" | "libertadores-pre" | "sul-americana" | "promotion" | "relegation" | "mid";

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
    yellows: 0,
    reds: 0,
    form: [],
  }));
}

function remember(row: Standing, mark: FormMark): void {
  row.form = [...(row.form ?? []), mark].slice(-5);
}

export function applyResult(
  table: Standing[],
  homeId: string,
  awayId: string,
  hg: number,
  ag: number,
  cards?: { home?: { yellow: number; red: number }; away?: { yellow: number; red: number } },
): Standing[] {
  const next = table.map((row) => ({ ...row, form: [...(row.form ?? [])], yellows: row.yellows ?? 0, reds: row.reds ?? 0 }));
  const home = next.find((row) => row.clubId === homeId);
  const away = next.find((row) => row.clubId === awayId);
  if (!home || !away) return next;
  home.played += 1;
  away.played += 1;
  home.gf += hg;
  home.ga += ag;
  away.gf += ag;
  away.ga += hg;
  home.yellows += cards?.home?.yellow ?? 0;
  home.reds += cards?.home?.red ?? 0;
  away.yellows += cards?.away?.yellow ?? 0;
  away.reds += cards?.away?.red ?? 0;
  if (hg > ag) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
    remember(home, "W");
    remember(away, "L");
  } else if (ag > hg) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
    remember(home, "L");
    remember(away, "W");
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
    remember(home, "D");
    remember(away, "D");
  }
  return next;
}

function primaryKey(row: Standing): string {
  return [row.points, row.won, row.gf - row.ga, row.gf].join(":");
}

function drawKey(clubId: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < clubId.length; index += 1) hash = Math.imul(hash ^ clubId.charCodeAt(index), 0x5bd1e995);
  return hash >>> 0;
}

function breakTiedGroup(group: Standing[], matches: RankedMatch[], seed: number): Standing[] {
  const ids = new Set(group.map((row) => row.clubId));
  const mini = new Map(group.map((row) => [row.clubId, { points: 0, won: 0, gd: 0, gf: 0 }]));
  for (const match of matches) {
    if (!ids.has(match.homeId) || !ids.has(match.awayId) || match.homeId === match.awayId) continue;
    const home = mini.get(match.homeId)!;
    const away = mini.get(match.awayId)!;
    home.gf += match.homeGoals;
    home.gd += match.homeGoals - match.awayGoals;
    away.gf += match.awayGoals;
    away.gd += match.awayGoals - match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.points += 3;
      home.won += 1;
    } else if (match.awayGoals > match.homeGoals) {
      away.points += 3;
      away.won += 1;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }
  return [...group].sort((a, b) => {
    const left = mini.get(a.clubId)!;
    const right = mini.get(b.clubId)!;
    if (right.points !== left.points) return right.points - left.points;
    if (right.won !== left.won) return right.won - left.won;
    if (right.gd !== left.gd) return right.gd - left.gd;
    if (right.gf !== left.gf) return right.gf - left.gf;
    if ((a.reds ?? 0) !== (b.reds ?? 0)) return (a.reds ?? 0) - (b.reds ?? 0);
    if ((a.yellows ?? 0) !== (b.yellows ?? 0)) return (a.yellows ?? 0) - (b.yellows ?? 0);
    return drawKey(a.clubId, seed) - drawKey(b.clubId, seed);
  });
}

export function sortTable(table: Standing[], matches: RankedMatch[] = [], seed = 1): Standing[] {
  const ordered = [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.won !== a.won) return b.won - a.won;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    if (gd !== 0) return gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.clubId.localeCompare(b.clubId);
  });
  const ranked: Standing[] = [];
  let cursor = 0;
  while (cursor < ordered.length) {
    let end = cursor + 1;
    while (end < ordered.length && primaryKey(ordered[end]) === primaryKey(ordered[cursor])) end += 1;
    const group = ordered.slice(cursor, end);
    ranked.push(...(group.length === 1 ? group : breakTiedGroup(group, matches, seed)));
    cursor = end;
  }
  return ranked;
}

export function pointsRate(points: number, played: number): number {
  if (played <= 0) return 0;
  return Math.round((points / (played * 3)) * 1000) / 10;
}

export function tableZone(division: 1 | 2 | 3, position: number): TableZone {
  if (division === 1) {
    if (position >= 1 && position <= 4) return "libertadores";
    if (position >= 5 && position <= 6) return "libertadores-pre";
    if (position >= 7 && position <= 12) return "sul-americana";
    if (position >= 17 && position <= 20) return "relegation";
    return "mid";
  }
  if (position >= 1 && position <= 4) return "promotion";
  if (division === 2 && position >= 17 && position <= 20) return "relegation";
  return "mid";
}

export function leagueRoundDate(season: number, round: number): string {
  const opening = new Date(Date.UTC(season, 3, 1));
  const saturdayOffset = (6 - opening.getUTCDay() + 7) % 7;
  opening.setUTCDate(1 + saturdayOffset);
  opening.setUTCDate(opening.getUTCDate() + (round - 1) * 7);
  return opening.toISOString().slice(0, 10);
}

export function cupMidweekDate(season: number, afterLeagueRound: number): string {
  const saturday = new Date(`${leagueRoundDate(season, afterLeagueRound)}T00:00:00.000Z`);
  saturday.setUTCDate(saturday.getUTCDate() + 4);
  return saturday.toISOString().slice(0, 10);
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
    const fixed = arr[0];
    const rotating = arr.slice(1);
    const moved = rotating.pop();
    if (moved) rotating.unshift(moved);
    arr.splice(0, arr.length, fixed, ...rotating);
  }
  return out;
}

export function opponentKey(homeId: string, awayId: string): string {
  return homeId < awayId ? `${homeId}|${awayId}` : `${awayId}|${homeId}`;
}

export function scheduleRepeatsOpponents(fixtures: { homeId: string; awayId: string }[], maxMeetings: number): boolean {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    const key = opponentKey(fixture.homeId, fixture.awayId);
    const next = (counts.get(key) ?? 0) + 1;
    if (next > maxMeetings) return true;
    counts.set(key, next);
  }
  return false;
}

export function repairRemainingFixtures(fixtures: Fixture[], clubIds: string[], rounds: number): Fixture[] {
  const meetings = rounds > 19 ? 2 : 1;
  if (fixtures.length > 0 && !scheduleRepeatsOpponents(fixtures, meetings)) return fixtures;
  const fresh = doubleRoundRobin(clubIds).filter((fixture) => fixture.round <= rounds);
  const played = fixtures.filter((fixture) => fixture.played);
  if (played.length === 0) return fresh;
  const used = new Map<string, number>();
  const busy = new Map<number, Set<string>>();
  for (const fixture of played) {
    used.set(opponentKey(fixture.homeId, fixture.awayId), (used.get(opponentKey(fixture.homeId, fixture.awayId)) ?? 0) + 1);
    const slots = busy.get(fixture.round) ?? new Set<string>();
    slots.add(fixture.homeId);
    slots.add(fixture.awayId);
    busy.set(fixture.round, slots);
  }
  const roundNumbers = [...new Set(fresh.map((fixture) => fixture.round))].sort((a, b) => a - b);
  const assigned: Fixture[] = [];
  for (const fixture of fresh) {
    const key = opponentKey(fixture.homeId, fixture.awayId);
    if ((used.get(key) ?? 0) >= meetings) continue;
    const order = [fixture.round, ...roundNumbers.filter((round) => round !== fixture.round)];
    for (const round of order) {
      const slots = busy.get(round) ?? new Set<string>();
      if (slots.has(fixture.homeId) || slots.has(fixture.awayId)) continue;
      slots.add(fixture.homeId);
      slots.add(fixture.awayId);
      busy.set(round, slots);
      used.set(key, (used.get(key) ?? 0) + 1);
      assigned.push({ ...fixture, round, played: false });
      break;
    }
  }
  return [...played, ...assigned].sort((a, b) => a.round - b.round || a.homeId.localeCompare(b.homeId));
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
    round.push({ slot: "1ª fase", tieId: `legacy-${ids[i]}`, leg: 1, singleLeg: true, homeId: ids[i], awayId: ids[i + 1], played: false });
  }
  return [round];
}

export function copaFirstRound(clubs: { id: string; division: 1 | 2 | 3; rep: number }[], seed = 0): { byes: string[]; fixtures: CupFixture[] } {
  const ranked = [...clubs].sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id));
  const serieA = ranked.filter((club) => club.division === 1);
  const byeCount = Math.min(4, serieA.length);
  const byes = serieA.slice(0, byeCount).map((club) => club.id);
  let rest = clubs.map((club) => club.id).filter((id) => !byes.includes(id));
  if (rest.length % 2 === 1) {
    const extra = ranked.find((club) => !byes.includes(club.id));
    if (extra) {
      byes.push(extra.id);
      rest = rest.filter((id) => id !== extra.id);
    }
  }
  const rng = mulberry32(seed + 991);
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [rest[index], rest[swap]] = [rest[swap], rest[index]];
  }
  const fixtures: CupFixture[] = [];
  for (let index = 0; index + 1 < rest.length; index += 2) {
    fixtures.push({
      slot: "1ª fase",
      tieId: `copa-1-${rest[index]}`,
      leg: 1,
      singleLeg: true,
      homeId: rest[index],
      awayId: rest[index + 1],
      played: false,
    });
  }
  return { byes, fixtures };
}

export function aggregateWinner(
  leg1: { homeId: string; awayId: string; homeGoals: number; awayGoals: number },
  leg2: { homeId: string; awayId: string; homeGoals: number; awayGoals: number },
  penalties?: { winner: "home" | "away" },
): { winnerId: string; decidedBy: "aggregate" | "penalties" } {
  const firstHome = leg1.homeGoals + leg2.awayGoals;
  const firstAway = leg1.awayGoals + leg2.homeGoals;
  if (firstHome > firstAway) return { winnerId: leg1.homeId, decidedBy: "aggregate" };
  if (firstAway > firstHome) return { winnerId: leg1.awayId, decidedBy: "aggregate" };
  if (!penalties) return { winnerId: "", decidedBy: "penalties" };
  return { winnerId: penalties.winner === "home" ? leg2.homeId : leg2.awayId, decidedBy: "penalties" };
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

export function outcomeForClub(
  clubId: string,
  result: { homeId: string; awayId: string; homeGoals: number; awayGoals: number },
): "win" | "draw" | "loss" | null {
  const isHome = result.homeId === clubId;
  const isAway = result.awayId === clubId;
  if (!isHome && !isAway) return null;
  const goalsFor = isHome ? result.homeGoals : result.awayGoals;
  const goalsAgainst = isHome ? result.awayGoals : result.homeGoals;
  if (goalsFor > goalsAgainst) return "win";
  if (goalsFor === goalsAgainst) return "draw";
  return "loss";
}

export function prizeFor(position: number): number {
  if (position === 1) return 2_000_000;
  if (position === 2) return 1_200_000;
  if (position === 3) return 800_000;
  if (position === 4) return 500_000;
  return 0;
}
