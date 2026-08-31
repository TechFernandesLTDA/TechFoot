import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyResult,
  defaultStarters,
  emptyStandings,
  roundRobin,
  simulateMatch,
  sortTable,
  type Club,
  type Fixture,
  type MatchResult,
  type Standing,
} from "@techfoot/engine";

export type Career = {
  clubId: string;
  round: number;
  starterIds: string[];
  clubs: Club[];
  table: Standing[];
  fixtures: Fixture[];
  inbox: { id: string; title: string; body: string; read: boolean }[];
  seed: number;
};

const worldPath = fileURLToPath(new URL("../../../data/world/liga-br.json", import.meta.url));

export function loadWorld(): { name: string; clubs: Club[] } {
  return JSON.parse(readFileSync(worldPath, "utf8")) as { name: string; clubs: Club[] };
}

export function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function createCareer(clubId: string): Career {
  const world = loadWorld();
  const club = world.clubs.find((c) => c.id === clubId);
  if (!club) throw httpError("Clube inválido", 400);
  const clubs = structuredClone(world.clubs);
  const ids = clubs.map((c) => c.id);
  return {
    clubId,
    round: 1,
    starterIds: defaultStarters(club.players),
    clubs,
    table: emptyStandings(ids),
    fixtures: roundRobin(ids),
    inbox: [
      {
        id: "welcome",
        title: "Bem-vindo ao escritório",
        body: `Você assume o ${club.name}. Escale o time e avance a rodada.`,
        read: false,
      },
    ],
    seed: Date.now() % 1_000_000_000,
  };
}

export function simulateRound(career: Career): { career: Career; userMatch: MatchResult | null } {
  const fixtures = career.fixtures.map((f) => ({ ...f }));
  const roundGames = fixtures.filter((f) => f.round === career.round && !f.played);
  if (roundGames.length === 0) throw httpError("Rodada já simulada", 409);
  let table = career.table.map((r) => ({ ...r }));
  let userMatch: MatchResult | null = null;
  let seed = career.seed;
  const clubs = career.clubs;

  for (const game of roundGames) {
    seed += 1;
    const home = clubs.find((c) => c.id === game.homeId);
    const away = clubs.find((c) => c.id === game.awayId);
    if (!home || !away) continue;
    const homeIds = game.homeId === career.clubId ? career.starterIds : defaultStarters(home.players);
    const awayIds = game.awayId === career.clubId ? career.starterIds : defaultStarters(away.players);
    const result = simulateMatch({ club: home, starterIds: homeIds }, { club: away, starterIds: awayIds }, seed);
    game.played = true;
    game.result = result;
    table = applyResult(table, home.id, away.id, result.homeGoals, result.awayGoals);
    if (game.homeId === career.clubId || game.awayId === career.clubId) userMatch = result;
  }

  const inbox = [
    {
      id: `r${career.round}`,
      title: `Rodada ${career.round} encerrada`,
      body: userMatch
        ? `Placar: ${userMatch.homeGoals} x ${userMatch.awayGoals}`
        : "Rodada concluída.",
      read: false,
    },
    ...career.inbox,
  ];

  return {
    career: {
      ...career,
      fixtures,
      table: sortTable(table),
      round: career.round + 1,
      seed,
      inbox,
    },
    userMatch,
  };
}
