import type { Fixture, Standing } from "./types.ts";

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

export function roundRobin(clubIds: string[]): Fixture[] {
  const ids = [...clubIds];
  if (ids.length % 2 === 1) ids.push("bye");
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];
  const rot = ids.slice(1);
  for (let r = 0; r < rounds; r++) {
    const roundTeams = [ids[0], ...rot];
    for (let i = 0; i < half; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a === "bye" || b === "bye") continue;
      const homeFirst = r % 2 === 0;
      fixtures.push({
        round: r + 1,
        homeId: homeFirst ? a : b,
        awayId: homeFirst ? b : a,
        played: false,
      });
    }
    rot.unshift(rot.pop() as string);
  }
  return fixtures;
}
