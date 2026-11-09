import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aggregateWinner, aiTransferPrice, applyResult, copaFirstRound, cupMidweekDate, defaultStarters, doubleRoundRobin, emptyStandings,
  evolvePlayer, leagueAverageStrength, leagueRoundDate, MATCH_PRIZE, mulberry32, outcomeForClub, playerValue, prizeFor,
  repairRemainingFixtures, resolvePenalties, sortTable, tableZone, weeklyWages, simulateMatch,
  type AdminControls, type Club, type CupFixture, type Fixture, type InboxMessage,
  type Formation, type LedgerEntry, type MatchResult, type Player, type Standing, type SubstitutionPlan, type Tactic,
} from "@techfoot/engine";

export type Career = {
  clubId: string;
  division: 1 | 2 | 3;
  season: number;
  round: number;
  tactic: Tactic;
  formation: Formation;
  captainId: string;
  starterIds: string[];
  benchIds: string[];
  substitutions: SubstitutionPlan[];
  clubs: Club[];
  table: Standing[];
  fixtures: Fixture[];
  cup: CupFixture[][];
  cupRound: number;
  cupChampion?: string;
  cupFinalPlayed: boolean;
  finances: number;
  admin: AdminControls;
  ledger: LedgerEntry[];
  market: { playerId: string; clubId: string | null; price: number }[];
  freeAgents: Player[];
  inbox: InboxMessage[];
  news: string[];
  lastRoundEvents: MatchResult | null;
  topScorers: { playerId: string; goals: number }[];
  history: SeasonRecord[];
  userMatches: UserMatchSummary[];
  seed: number;
  contractsReady?: boolean;
  roundOffers?: string[];
  cupPending?: boolean;
  cupByes?: string[];
};

export type SeasonRecord = {
  season: number;
  division: 1 | 2 | 3;
  position: number;
  points: number;
  played: number;
  cupChampionId?: string;
  prize: number;
  championId?: string;
  bestXi?: { name: string; position: string }[];
  qualified?: { clubId: string; zone: string }[];
};

export type UserMatchSummary = {
  season: number;
  round: number;
  kind?: "league" | "cup";
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
};

export type AdminPatch = Partial<Omit<AdminControls, "membershipCount" | "debt">>;
export type MatchPlan = { starterIds: string[]; benchIds?: string[]; formation?: Formation; captainId?: string; substitutions?: SubstitutionPlan[] };

const worldPath = fileURLToPath(new URL("../../../data/world/liga-br.json", import.meta.url));
type WorldFile = { name: string; clubs: Club[]; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[] };
let worldCache: WorldFile | null = null;

function parseWorldFile(raw: string): WorldFile {
  return JSON.parse(raw) as WorldFile;
}

export const MAX_CLUB_DEBT = 20_000_000;

export function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function loadWorld(): WorldFile {
  if (!worldCache) worldCache = parseWorldFile(readFileSync(worldPath, "utf8"));
  return structuredClone(worldCache);
}

function newMessage(career: Career, id: string, kind: string, title: string, body: string): void {
  career.inbox = [{ id, kind, title, body, read: false }, ...career.inbox];
  career.news = [title, ...career.news].slice(0, 30);
}

function clubMap(clubs: Club[]): Map<string, Club> {
  return new Map(clubs.map((c) => [c.id, c]));
}

function isAvailable(player: { injuredGames: number; suspendedGames: number }): boolean {
  return player.injuredGames === 0 && player.suspendedGames === 0;
}

function repairPlan(career: Career): void {
  const club = clubMap(career.clubs).get(career.clubId);
  if (!club) return;
  const squad = new Map(club.players.map((player) => [player.id, player]));
  const kept = career.starterIds.filter((id) => {
    const player = squad.get(id);
    return Boolean(player && isAvailable(player));
  });
  const filler = defaultStarters(club.players).filter((id) => !kept.includes(id));
  const starters = [...kept, ...filler].slice(0, 11);
  career.starterIds = starters.length === 11 ? starters : defaultStarters(club.players);
  career.benchIds = career.benchIds.filter((id) => {
    const player = squad.get(id);
    return Boolean(player && isAvailable(player) && !career.starterIds.includes(id));
  }).slice(0, 5);
  career.captainId = career.starterIds.includes(career.captainId) ? career.captainId : career.starterIds[0] ?? "";
  career.substitutions = career.substitutions.filter((change) => career.starterIds.includes(change.playerOutId) && career.benchIds.includes(change.playerInId));
}

function divisionLabel(division: 1 | 2 | 3): string {
  return division === 1 ? "Série A" : division === 2 ? "Série B" : "Série C";
}

function fixturesForDivision(clubIds: string[], division: 1 | 2 | 3): Fixture[] {
  const fixtures = doubleRoundRobin(clubIds);
  return division === 3 ? fixtures.filter((fixture) => fixture.round <= 19) : fixtures;
}

function staggerContracts(career: Career): void {
  if (career.contractsReady) return;
  let index = 0;
  for (const club of career.clubs) {
    for (const player of club.players) {
      if (player.contractGames > 0 && player.contractGames <= 30) {
        player.contractGames = 19 + ((career.seed + index * 17) % 96);
      }
      index += 1;
    }
  }
  career.contractsReady = true;
}

function repairSchedule(career: Career): void {
  const ids = career.clubs.filter((club) => club.division === career.division).map((club) => club.id);
  const rounds = career.division === 3 ? 19 : 38;
  if (ids.length < 2 || career.fixtures.length === 0) return;
  career.fixtures = repairRemainingFixtures(career.fixtures, ids, rounds);
}

function promoteYouth(career: Career): void {
  const rng = mulberry32(career.seed + career.season * 97 + career.round);
  const positions = ["GK", "DF", "MF", "FW"] as const;
  for (const club of career.clubs) {
    let guard = 0;
    while (club.players.length < 16 && guard < 8) {
      const position = positions[(club.players.length + guard) % positions.length];
      const strength = 8 + Math.floor(rng() * 10);
      club.players.push({
        id: `youth-${club.id}-${career.season}-${career.round}-${guard}`,
        name: `Base ${club.name.split(" ")[0]} ${guard + 1}`,
        nationality: "BRA",
        position,
        preferredPositions: [position],
        age: 17,
        xp: 4,
        skills: { pace: 30, finishing: 28, passing: 30, marking: 28, tackling: 28, handling: 24, stamina: 40, leadership: 20 },
        fitness: 90,
        morale: 70,
        strength,
        salary: 8_000,
        contractGames: 76,
        behavior: 2,
        injuredGames: 0,
        yellows: 0,
        reds: 0,
        goals: 0,
        matches: 0,
        suspendedGames: 0,
      });
      guard += 1;
    }
  }
}

function defaultAdmin(club: Club): AdminControls {
  return {
    ticketPrice: 40,
    membershipFee: 60,
    sponsorTier: 1,
    broadcastTier: 1,
    merchandisePrice: 120,
    stadiumLevel: 1,
    maintenanceBudget: 50_000,
    youthBudget: 150_000,
    scoutingBudget: 100_000,
    debt: 0,
    membershipCount: Math.round(club.morale * 100),
  };
}

export function normalizeCareer(career: Career): Career {
  for (const club of career.clubs) {
    club.state ??= "BR";
    club.division ??= 2;
    club.tactic ??= "balanced";
    club.rep ??= 50;
    for (const player of club.players) {
      const strength = player.strength ?? 25;
      player.preferredPositions ??= [player.position];
      player.age ??= 24;
      player.xp ??= 0;
      player.skills ??= { pace: strength * 2, finishing: strength * 2, passing: strength * 2, marking: strength * 2, tackling: strength * 2, handling: strength * 2, stamina: strength * 2, leadership: strength * 2 };
      player.fitness ??= 90;
      player.morale ??= 70;
      player.goals ??= 0;
      player.matches ??= 0;
      player.suspendedGames ??= 0;
    }
  }
  const club = career.clubs.find((item) => item.id === career.clubId);
  if (club && !career.admin) career.admin = defaultAdmin(club);
  if (club) {
    const starters = career.starterIds?.length ? career.starterIds : defaultStarters(club.players);
    career.starterIds = starters;
    career.formation ??= "4-3-3";
    career.captainId ??= starters[0];
    career.benchIds ??= club.players.map((player) => player.id).filter((id) => !starters.includes(id)).slice(0, 5);
    career.substitutions ??= [];
  }
  career.freeAgents ??= [];
  career.history ??= [];
  career.userMatches ??= [];
  career.roundOffers ??= [];
  staggerContracts(career);
  repairSchedule(career);
  for (const fixture of career.fixtures) fixture.date ??= leagueRoundDate(career.season, fixture.round);
  rebuildStandings(career);
  promoteYouth(career);
  repairPlan(career);
  return career;
}

function cardTally(result: MatchResult, side: "home" | "away"): { yellow: number; red: number } {
  return {
    yellow: result.events.filter((event) => event.kind === "yellow" && event.side === side).length,
    red: result.events.filter((event) => event.kind === "red" && event.side === side).length,
  };
}

function rebuildStandings(career: Career): void {
  const ids = career.clubs.filter((club) => club.division === career.division).map((club) => club.id);
  if (ids.length === 0) return;
  let table = emptyStandings(ids);
  const played = [...career.fixtures].filter((fixture) => fixture.played && fixture.result).sort((a, b) => a.round - b.round);
  for (const fixture of played) {
    const result = fixture.result!;
    table = applyResult(table, fixture.homeId, fixture.awayId, result.homeGoals, result.awayGoals, {
      home: cardTally(result, "home"),
      away: cardTally(result, "away"),
    });
  }
  career.table = sortTable(table, played.map((fixture) => ({
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: fixture.result!.homeGoals,
    awayGoals: fixture.result!.awayGoals,
  })), career.seed);
}

export function createCareer(clubId: string, season = 2026, seed = Date.now() % 1_000_000_000): Career {
  const world = loadWorld();
  const club = world.clubs.find((c) => c.id === clubId);
  if (!club) throw httpError("Clube inválido", 400);
  const clubs = world.clubs;
  const myClub = clubs.find((c) => c.id === clubId)!;
  const divisionClubIds = clubs.filter((c) => c.division === myClub.division).map((c) => c.id);
  const copa = copaFirstRound(clubs.map((club) => ({ id: club.id, division: club.division, rep: club.rep })), seed);
  const starters = defaultStarters(myClub.players);

  const career: Career = {
    clubId,
    division: myClub.division,
    season,
    round: 1,
    tactic: "balanced",
    formation: "4-3-3",
    captainId: starters[0],
    starterIds: starters,
    benchIds: myClub.players.map((player) => player.id).filter((id) => !starters.includes(id)).slice(0, 5),
    substitutions: [],
    clubs,
    table: emptyStandings(divisionClubIds),
    fixtures: fixturesForDivision(divisionClubIds, myClub.division),
    cup: [copa.fixtures.map((fixture) => ({ ...fixture, date: cupMidweekDate(season, 2) }))],
    cupByes: copa.byes,
    cupRound: 0,
    cupFinalPlayed: false,
    finances: myClub.cash,
    admin: defaultAdmin(myClub),
    ledger: [{ label: "Caixa inicial", amount: myClub.cash }],
    market: [],
    freeAgents: [],
    inbox: [],
    news: [],
    lastRoundEvents: null,
    topScorers: [],
    history: [],
    userMatches: [],
    seed,
  };

  newMessage(career, "welcome", "info", "Bem-vindo ao escritório", `Você assume o ${myClub.name}. Monte o time, escolha a tática e avance a rodada. ${divisionLabel(myClub.division)} tem regras próprias de acesso.`);
  refreshMarket(career);
  return normalizeCareer(career);
}

function refreshMarket(career: Career): void {
  const entries = new Map<string, { playerId: string; clubId: string | null; price: number }>();
  for (const club of career.clubs) {
    for (const p of club.players) {
      entries.set(p.id, { playerId: p.id, clubId: club.id, price: playerValue(p) });
    }
  }
  for (const player of career.freeAgents) entries.set(player.id, { playerId: player.id, clubId: null, price: playerValue(player) });
  career.market = [...entries.values()];
}

function sortTopScorers(career: Career): void {
  const map = new Map<string, number>();
  for (const club of career.clubs) for (const p of club.players) map.set(p.id, p.goals);
  career.topScorers = [...map.entries()]
    .filter(([, g]) => g > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([playerId, goals]) => ({ playerId, goals }));
}

function applyCardsAndSuspensions(career: Career, result: MatchResult): void {
  const m = clubMap(career.clubs);
  for (const e of result.events) {
    if (e.kind === "yellow" || e.kind === "red") {
      const club = m.get(e.teamId);
      const p = club?.players.find((x) => x.id === e.playerId);
      if (!p) continue;
      if (e.kind === "yellow") {
        p.yellows += 1;
        if (p.yellows % 3 === 0) p.suspendedGames = Math.max(p.suspendedGames, 1);
      }
      else {
        p.reds += 1;
        p.suspendedGames = 1;
      }
    }
    if (e.kind === "injury" && e.playerId) {
      // injuredGames já setado na simulação; garantir mínimo
      const club = m.get(e.teamId);
      const p = club?.players.find((x) => x.id === e.playerId);
      if (p && p.injuredGames === 0) p.injuredGames = 1 + (e.minute % 3);
    }
  }
}

function goalScorers(career: Career, result: MatchResult): void {
  const map = clubMap(career.clubs);
  for (const e of result.events) {
    if (e.kind === "goal" && e.playerId) {
      const p = map.get(e.teamId)?.players.find((x) => x.id === e.playerId);
      if (p) p.goals += 1;
    }
  }
}

function simulateOne(career: Career, home: Club, away: Club, seed: number): MatchResult {
  return simulateMatchCtx(career, home, away, seed);
}

function simulateMatchCtx(career: Career, home: Club, away: Club, seed: number): MatchResult {
  const starterHome = home.id === career.clubId ? career.starterIds : defaultStarters(home.players);
  const starterAway = away.id === career.clubId ? career.starterIds : defaultStarters(away.players);
  const result = simulateMatch(
    {
      club: home,
      starterIds: starterHome,
      benchIds: home.id === career.clubId ? career.benchIds : undefined,
      captainId: home.id === career.clubId ? career.captainId : undefined,
      substitutions: home.id === career.clubId ? career.substitutions : undefined,
      tactic: home.tactic,
      formation: home.id === career.clubId ? career.formation : "4-3-3",
    },
    {
      club: away,
      starterIds: starterAway,
      tactic: away.tactic,
      formation: away.id === career.clubId ? career.formation : "4-3-3",
    },
    seed,
  );
  applyCardsAndSuspensions(career, result);
  goalScorers(career, result);
  for (const pid of result.injuries) {
    const club = clubMap(career.clubs).get(findClubOf(career, pid));
    const p = club?.players.find((x) => x.id === pid);
    if (p && p.injuredGames === 0) p.injuredGames = 1 + (seed % 3);
  }
  return result;
}

function findClubOf(career: Career, playerId: string): string {
  for (const club of career.clubs) {
    if (club.players.some((p) => p.id === playerId)) return club.id;
  }
  return career.clubId;
}

export function simulateRound(career: Career, prepared?: { homeId: string; awayId: string; result: MatchResult }[]): { career: Career; userMatch: MatchResult | null } {
  for (let spins = 0; cupReady(career) && spins < 12; spins += 1) {
    const phase = career.cup[career.cupRound];
    if (!phase || !userPlays(career, phase)) {
      playCupPhase(career, career.seed + career.cupRound);
      continue;
    }
    const userMatch = playCupPhase(career, career.seed + career.cupRound, prepared?.find((item) => phase.some((fixture) => fixture.homeId === item.homeId && fixture.awayId === item.awayId))?.result);
    if (userMatch) rememberUserMatch(career, userMatch, "cup");
    return { career, userMatch };
  }
  const fixtures = career.fixtures.map((f) => ({ ...f, result: f.result ? structuredClone(f.result) : undefined }));
  const roundGames = fixtures.filter((f) => f.round === career.round && !f.played);
  if (roundGames.length === 0) {
    if (career.fixtures.some((fixture) => !fixture.played)) throw httpError("Rodada já simulada", 409);
    let guard = 0;
    while (guard < 12 && career.cup[career.cupRound] && !career.cupFinalPlayed && !userPlays(career, career.cup[career.cupRound])) {
      playCupPhase(career, career.seed + guard);
      guard += 1;
    }
    if (!career.cupFinalPlayed && career.cup[career.cupRound] && userPlays(career, career.cup[career.cupRound])) {
      const phase = career.cup[career.cupRound];
      const userMatch = playCupPhase(career, career.seed, prepared?.find((item) => phase.some((fixture) => fixture.homeId === item.homeId && fixture.awayId === item.awayId))?.result);
      if (userMatch) rememberUserMatch(career, userMatch, "cup");
      return { career, userMatch };
    }
    if (!career.history.some((record) => record.season === career.season)) endOfSeason(career);
    return { career, userMatch: career.lastRoundEvents };
  }

  let table = career.table.map((r) => ({ ...r }));
  let seed = career.seed;
  const roundRng = mulberry32(seed + career.round * 7919);
  const clubs = career.clubs;
  const map = clubMap(clubs);
  const priorInjury = new Set<string>();
  const priorSuspension = new Set<string>();
  for (const club of clubs) for (const player of club.players) {
    if (player.injuredGames > 0) priorInjury.add(player.id);
    if (player.suspendedGames > 0) priorSuspension.add(player.id);
  }
  repairPlan(career);
  if (career.starterIds.length < 11) throw httpError("Elenco sem 11 jogadores disponíveis", 400);
  let userMatch: MatchResult | null = null;
  let homeCount = 0;
  let awayCount = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const results: MatchResult[] = [];

  for (const game of roundGames) {
    seed += 1;
    const home = map.get(game.homeId);
    const away = map.get(game.awayId);
    if (!home || !away) continue;
    if (home.id === career.clubId) homeCount += 1;
    if (away.id === career.clubId) awayCount += 1;
    const preset = prepared?.find((item) => item.homeId === game.homeId && item.awayId === game.awayId);
    const result = preset ? preset.result : simulateOne(career, home, away, seed);
    if (preset) {
      applyCardsAndSuspensions(career, result);
      goalScorers(career, result);
      for (const pid of result.injuries) {
        const club = clubMap(career.clubs).get(findClubOf(career, pid));
        const player = club?.players.find((item) => item.id === pid);
        if (player && player.injuredGames === 0) player.injuredGames = 1 + (seed % 3);
      }
    }
    game.played = true;
    game.result = result;
    results.push(result);
    table = applyResult(table, home.id, away.id, result.homeGoals, result.awayGoals, { home: cardTally(result, "home"), away: cardTally(result, "away") });
    if (game.homeId === career.clubId || game.awayId === career.clubId) {
      userMatch = result;
      const outcome = outcomeForClub(career.clubId, result);
      if (outcome === "win") wins += 1;
      else if (outcome === "draw") draws += 1;
      else if (outcome === "loss") losses += 1;
    }
  }

  // Finanças da rodada
  const myClub = map.get(career.clubId)!;
  const wages = weeklyWages(myClub);
  const resultKind = wins > 0 ? "win" : draws > 0 ? "draw" : "loss";
  const pricePenalty = Math.max(0, career.admin.ticketPrice - 40) / 500;
  const attendanceRate = Math.max(0.12, Math.min(0.95, 0.32 + myClub.morale / 180 + myClub.rep / 500 - pricePenalty));
  const effectiveCapacity = Math.round(myClub.stadiumCapacity * (1 + (career.admin.stadiumLevel - 1) * 0.08));
  const ticketIncome = homeCount > 0 ? Math.round(effectiveCapacity * attendanceRate * career.admin.ticketPrice * homeCount) : 0;
  const memberIncome = Math.round(career.admin.membershipCount * career.admin.membershipFee / 4);
  const sponsorIncome = career.admin.sponsorTier * 250_000;
  const broadcastIncome = career.admin.broadcastTier * (myClub.division === 1 ? 180_000 : myClub.division === 2 ? 90_000 : 45_000);
  const merchandiseIncome = Math.round((career.admin.membershipCount * 0.08 + 300) * career.admin.merchandisePrice * 0.18);
  const prize = wins * MATCH_PRIZE.win + draws * MATCH_PRIZE.draw;
  const maintenance = career.admin.maintenanceBudget;
  const debtInterest = Math.round(career.admin.debt * 0.01);
  const tickets = ticketIncome + memberIncome + sponsorIncome + broadcastIncome + merchandiseIncome;
  const delta = tickets + prize - wages - maintenance - career.admin.youthBudget - career.admin.scoutingBudget - debtInterest;
  myClub.cash += delta;
  career.finances = myClub.cash;
  career.ledger = [
    { round: career.round, label: `Receitas (ingressos, sócios, patrocínio, TV, produtos)`, amount: tickets + prize },
    { round: career.round, label: "Folha salarial", amount: -wages },
    { round: career.round, label: "Operação, base e scouting", amount: -(maintenance + career.admin.youthBudget + career.admin.scoutingBudget) },
    ...(debtInterest > 0 ? [{ round: career.round, label: "Juros da dívida", amount: -debtInterest }] : []),
    ...career.ledger,
  ].slice(0, 40);
  career.admin.membershipCount = Math.max(0, Math.round(career.admin.membershipCount + (resultKind === "win" ? 18 : resultKind === "loss" ? -9 : 3) + (myClub.morale - 70) / 10));

  // Evolução dos jogadores do meu clube
  const avg = leagueAverageStrength(myClub.players);
  const rng = mulberry32(seed + 555);
  if (userMatch) {
    const resultFor = outcomeForClub(career.clubId, userMatch) ?? "draw";
    const playedIds = new Set([...
      career.starterIds,
      ...userMatch.substitutions.filter((change) => change.teamId === myClub.id).map((change) => change.playerInId),
    ]);
    const evolved: string[] = [];
    for (const p of myClub.players) {
      const played = playedIds.has(p.id);
      if (played) {
        const d = evolvePlayer(p, resultFor, avg, rng);
        if (d && d.note === "evoluiu") evolved.push(`${p.name} (${p.strength})`);
        p.xp = Math.min(100, p.xp + (resultFor === "win" ? 4 : resultFor === "draw" ? 2 : 1));
        p.morale = Math.max(0, Math.min(100, p.morale + (resultFor === "win" ? 3 : resultFor === "loss" ? -3 : 1)));
      }
      p.matches += (played ? 1 : 0);
    }
    if (evolved.length) {
      const shown = evolved.slice(0, 6).join(", ");
      const rest = evolved.length > 6 ? ` e mais ${evolved.length - 6}` : "";
      newMessage(career, `ev-${career.season}-${career.round}`, "evo", "Evolução da rodada", `${shown}${rest}.`);
    }
  }

  const recoveryRng = mulberry32(seed + 909);
  const warnings: string[] = [];
  for (const club of clubs) {
    const playedIds = new Set<string>();
    for (const result of results) {
      if (result.homeId !== club.id && result.awayId !== club.id) continue;
      const starters = club.id === career.clubId ? career.starterIds : defaultStarters(club.players);
      for (const id of starters) playedIds.add(id);
      for (const change of result.substitutions) {
        if (change.teamId === club.id) playedIds.add(change.playerInId);
      }
    }
    for (const player of club.players) {
      if (playedIds.has(player.id)) player.fitness = Math.max(0, player.fitness - (player.age > 32 ? 5 : player.age > 28 ? 4 : 3));
      player.fitness = Math.min(100, player.fitness + 12 + Math.floor(recoveryRng() * 4));
      player.contractGames -= 1;
      if (club.id === career.clubId && (player.contractGames === 6 || player.contractGames === 3)) warnings.push(`${player.name} (${player.contractGames} jogos)`);
    }
  }
  if (warnings.length) newMessage(career, `warn-${career.season}-${career.round}`, "contract", "Contratos perto do fim", warnings.slice(0, 6).join(", "));

  // Contratos: quem zerou vira agente livre (removido do elenco para mercado)
  const toRelease: string[] = [];
  for (const club of clubs) {
    for (const p of club.players) {
      if (p.contractGames <= 0) toRelease.push(p.id);
    }
  }
  if (toRelease.length) {
    for (const id of toRelease) {
      for (const club of clubs) {
        const idx = club.players.findIndex((p) => p.id === id);
        if (idx >= 0) career.freeAgents.push(club.players.splice(idx, 1)[0]);
      }
    }
    repairPlan(career);
    newMessage(career, `rel-${career.round}`, "contract", "Contratos encerrados", `${toRelease.length} jogador(es) deixaram os clubes e estão livres no mercado.`);
  }
  promoteYouth(career);
  repairPlan(career);

  const offers: string[] = [];
  for (const club of clubs) {
    if (club.id === career.clubId) continue;
    if (roundRng() < 0.15) {
      const p = club.players[Math.floor(roundRng() * club.players.length)];
      if (p) offers.push(`${p.name} do ${club.name} por ${(playerValue(p) / 1e6).toFixed(1)}M`);
    }
  }
  career.roundOffers = offers.slice(0, 8);

  career.fixtures = fixtures;
  career.table = sortByTable(table, career);
  sortTopScorers(career);
  refreshMarket(career);
  if (userMatch) rememberUserMatch(career, userMatch, "league");

  const standing = sortByTable(table, career).findIndex((row) => row.clubId === career.clubId) + 1;
  if (career.round >= 25 && standing > Math.max(0, table.length - 4)) {
    newMessage(career, `relg-${career.season}-${career.round}`, "board", "Zona de rebaixamento", `${myClub.name} está em ${standing}º. A diretoria cobra reação.`);
  }

  for (const club of clubs) for (const player of club.players) {
    if (priorInjury.has(player.id)) player.injuredGames = Math.max(0, player.injuredGames - 1);
    if (priorSuspension.has(player.id)) player.suspendedGames = Math.max(0, player.suspendedGames - 1);
  }

  const totalRounds = Math.max(...career.fixtures.map((f) => f.round));
  if (career.round >= totalRounds && !career.fixtures.some((f) => !f.played)) {
    let guard = 0;
    while (guard < 12 && career.cup[career.cupRound] && !career.cupFinalPlayed && !userPlays(career, career.cup[career.cupRound])) {
      playCupPhase(career, seed + guard);
      guard += 1;
    }
    if (!career.cupFinalPlayed && career.cup[career.cupRound] && userPlays(career, career.cup[career.cupRound])) {
      career.round += 1;
      career.seed = seed;
      return { career, userMatch };
    }
    endOfSeason(career);
    return { career, userMatch: career.lastRoundEvents };
  }

  career.round += 1;
  career.seed = seed;
  return { career, userMatch };
}

function sortByTable(table: Standing[], career: Career): Standing[] {
  const matches = career.fixtures.filter((fixture) => fixture.played && fixture.result).map((fixture) => ({
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: fixture.result!.homeGoals,
    awayGoals: fixture.result!.awayGoals,
  }));
  return sortTable(table.map((row) => ({ ...row, yellows: row.yellows ?? 0, reds: row.reds ?? 0, form: row.form ?? [] })), matches, career.seed);
}

const CUP_NEXT: Record<string, string | null> = {
  "1ª fase": "Oitavas",
  "Oitavas": "Quartas",
  "Quartas": "Semi",
  "Semi": "Final",
  "Final": null,
};

function phaseAnchor(slot: string, leg: 1 | 2): number {
  const anchors: Record<string, [number, number]> = {
    "1ª fase": [2, 2],
    "Oitavas": [6, 8],
    "Quartas": [12, 14],
    "Semi": [18, 20],
    "Final": [26, 30],
  };
  return (anchors[slot] ?? [2, 2])[leg - 1];
}

function userPlays(career: Career, phase: CupFixture[]): boolean {
  return phase.some((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId));
}

function cupReady(career: Career): boolean {
  const phase = career.cup[career.cupRound];
  if (!phase || phase.every((fixture) => fixture.played) || career.cupFinalPlayed) return false;
  if (career.fixtures.length > 0 && career.fixtures.every((fixture) => fixture.played)) return true;
  return career.round > phaseAnchor(phase[0].slot, phase[0].leg ?? 1);
}

function rememberUserMatch(career: Career, userMatch: MatchResult, kind: "league" | "cup"): void {
  career.lastRoundEvents = userMatch;
  career.userMatches = [...(career.userMatches ?? []), {
    season: career.season,
    round: career.round,
    kind,
    homeId: userMatch.homeId,
    awayId: userMatch.awayId,
    homeGoals: userMatch.homeGoals,
    awayGoals: userMatch.awayGoals,
  }].slice(-80);
}

function settleFixture(career: Career, fixture: CupFixture, result: MatchResult, seed: number, shootout?: { home: number; away: number; winner: "home" | "away" }): CupFixture {
  if (!fixture.singleLeg && fixture.leg === 1) {
    return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
  }
  if (fixture.singleLeg) {
    if (result.homeGoals !== result.awayGoals) {
      return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId: result.homeGoals > result.awayGoals ? fixture.homeId : fixture.awayId };
    }
    const penalties = shootout ?? resolvePenaltiesCtx(clubMap(career.clubs).get(fixture.homeId)!, clubMap(career.clubs).get(fixture.awayId)!, seed);
    return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties, winnerId: penalties.winner === "home" ? fixture.homeId : fixture.awayId };
  }
  const firstLeg = career.cup.flat().find((item) => item.tieId === fixture.tieId && item.leg === 1 && item.homeGoals !== undefined && item.awayGoals !== undefined);
  if (!firstLeg) return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
  const totaled = aggregateWinner(
    { homeId: firstLeg.homeId, awayId: firstLeg.awayId, homeGoals: firstLeg.homeGoals ?? 0, awayGoals: firstLeg.awayGoals ?? 0 },
    { homeId: fixture.homeId, awayId: fixture.awayId, homeGoals: result.homeGoals, awayGoals: result.awayGoals },
  );
  if (totaled.winnerId) return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId: totaled.winnerId };
  const penalties = shootout ?? resolvePenaltiesCtx(clubMap(career.clubs).get(fixture.homeId)!, clubMap(career.clubs).get(fixture.awayId)!, seed);
  return { ...fixture, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties, winnerId: penalties.winner === "home" ? fixture.homeId : fixture.awayId };
}

function playCupPhase(career: Career, seed: number, preset?: MatchResult, shootout?: { home: number; away: number; winner: "home" | "away" }): MatchResult | null {
  const phase = career.cup[career.cupRound];
  if (!phase) return null;
  const map = clubMap(career.clubs);
  let userMatch: MatchResult | null = null;
  career.cup[career.cupRound] = phase.map((fixture) => {
    if (fixture.played) return fixture;
    const home = map.get(fixture.homeId);
    const away = map.get(fixture.awayId);
    if (!home || !away) return { ...fixture, played: true, winnerId: fixture.homeId };
    const mine = fixture.homeId === career.clubId || fixture.awayId === career.clubId;
    const result = mine && preset ? preset : simulateOne(career, home, away, seed + fixture.homeId.length);
    if (mine && preset) {
      applyCardsAndSuspensions(career, result);
      goalScorers(career, result);
    }
    if (mine) userMatch = result;
    return settleFixture(career, fixture, result, seed + fixture.homeId.length, mine ? shootout : undefined);
  });
  const played = career.cup[career.cupRound];
  if (played.every((fixture) => fixture.played)) concludeCupPhase(career, played, seed);
  if (userMatch) {
    const winner = played.find((fixture) => fixture.homeId === userMatch!.homeId && fixture.awayId === userMatch!.awayId);
    const advanced = winner?.winnerId === career.clubId || (!winner?.winnerId && winner?.leg === 1);
    newMessage(career, `cup-${career.season}-${played[0]?.slot}-${played[0]?.leg}`, "cup", `Copa · ${played[0]?.slot}${played[0]?.singleLeg ? "" : played[0]?.leg === 1 ? " · ida" : " · volta"}`, advanced ? "Você continua na Copa." : "Sua campanha na Copa terminou nesta fase.");
  }
  career.cupPending = Boolean(career.cup[career.cupRound]?.some((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId)));
  return userMatch;
}

function concludeCupPhase(career: Career, phase: CupFixture[], seed: number): void {
  career.cupPending = false;
  if (!phase[0]?.singleLeg && phase[0]?.leg === 1) {
    if (career.cup.length === career.cupRound + 1) {
      career.cup.push(phase.map((fixture) => ({
        ...fixture,
        leg: 2 as const,
        played: false,
        homeId: fixture.awayId,
        awayId: fixture.homeId,
        homeGoals: undefined,
        awayGoals: undefined,
        winnerId: undefined,
        penalties: undefined,
        date: cupMidweekDate(career.season, phaseAnchor(fixture.slot, 2)),
      })));
    }
    career.cupRound += 1;
    return;
  }
  if (phase.some((fixture) => !fixture.winnerId)) return;
  const winners = phase.map((fixture) => fixture.winnerId).filter((id): id is string => Boolean(id));
  const nextSlot = CUP_NEXT[phase[0].slot] ?? null;
  if (!nextSlot) {
    career.cupChampion = winners[0];
    career.cupFinalPlayed = true;
    newMessage(career, `cup-champ-${career.season}`, "cup", "Campeão da Copa!", `${clubMap(career.clubs).get(winners[0])?.name ?? "O campeão"} levantou a taça. O gol fora não desempata: empate no agregado vai para os pênaltis.`);
    return;
  }
  const field = phase[0].slot === "1ª fase" ? [...winners, ...(career.cupByes ?? [])] : winners;
  const drawRng = mulberry32(seed + career.cupRound * 5000 + career.season);
  const shuffled = [...field];
  for (let index = shuffled.length; index > 1; index -= 1) {
    const swap = Math.floor(drawRng() * index);
    [shuffled[index - 1], shuffled[swap]] = [shuffled[swap], shuffled[index - 1]];
  }
  const ida: CupFixture[] = [];
  const volta: CupFixture[] = [];
  for (let index = 0; index + 1 < shuffled.length; index += 2) {
    const left = shuffled[index];
    const right = shuffled[index + 1];
    const leftRep = career.clubs.find((club) => club.id === left)?.rep ?? 0;
    const rightRep = career.clubs.find((club) => club.id === right)?.rep ?? 0;
    const home = leftRep <= rightRep ? left : right;
    const away = home === left ? right : left;
    const tieId = `${nextSlot}-${home}`;
    ida.push({ slot: nextSlot, tieId, leg: 1, singleLeg: false, homeId: home, awayId: away, played: false, date: cupMidweekDate(career.season, phaseAnchor(nextSlot, 1)) });
    volta.push({ slot: nextSlot, tieId, leg: 2, singleLeg: false, homeId: away, awayId: home, played: false, date: cupMidweekDate(career.season, phaseAnchor(nextSlot, 2)) });
  }
  career.cup.push(ida, volta);
  career.cupRound = career.cup.length - 2;
}

export function applyCupResult(career: Career, result: MatchResult, penalties?: { home: number; away: number; winner: "home" | "away" }): Career {
  const phase = career.cup[career.cupRound];
  const tie = phase?.find((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId));
  if (!tie) throw httpError("Não há jogo de copa pendente", 409);
  playCupPhase(career, career.seed, result, penalties);
  career.lastRoundEvents = result;
  rememberUserMatch(career, result, "cup");
  return career;
}

function resolvePenaltiesCtx(home: Club, away: Club, seed: number): { home: number; away: number; winner: "home" | "away" } {
  return resolvePenalties(
    Math.max(1, home.players.find((p) => p.position === "GK")?.strength ?? 20),
    Math.max(1, away.players.find((p) => p.position === "GK")?.strength ?? 20),
    seed,
  );
}

function endOfSeason(career: Career): void {
  const myClub = clubMap(career.clubs).get(career.clubId)!;
  const finalTable = sortByTable(career.table, career);
  const pos = finalTable.findIndex((r) => r.clubId === career.clubId) + 1;
  const prize = prizeFor(pos);
  const standing = finalTable.find((row) => row.clubId === career.clubId);
  const championId = finalTable[0]?.clubId;
  const used = new Set<string>();
  const bestXi = (["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"] as const).flatMap((position) => {
    const pick = [...myClub.players].filter((player) => player.position === position && !used.has(player.id)).sort((a, b) => b.strength - a.strength)[0];
    if (!pick) return [];
    used.add(pick.id);
    return [{ name: pick.name, position }];
  });
  career.history = [...(career.history ?? []), {
    season: career.season,
    division: career.division,
    position: pos,
    points: standing?.points ?? 0,
    played: standing?.played ?? 0,
    cupChampionId: career.cupChampion,
    prize,
    championId,
    bestXi,
    qualified: finalTable.map((row, index) => ({ clubId: row.clubId, zone: tableZone(career.division, index + 1) })).filter((item) => item.zone !== "mid"),
  }].slice(-20);
  myClub.cash += prize;
  career.finances = myClub.cash;
  career.ledger = [{ label: `Premiação (${pos}º lugar)`, amount: prize }, ...career.ledger].slice(0, 40);
  newMessage(career, `season-${career.season}`, "season", pos === 1 ? `CAMPEÃO ${career.season}!` : `Temporada ${career.season} encerrada`, `${pos === 1 ? `${myClub.name} é campeão nos pontos corridos.` : `${myClub.name} terminou em ${pos}º lugar na ${divisionLabel(career.division)}.`} Prêmio: R$ ${(prize / 1e6).toFixed(1)}M.${career.cupChampion ? ` Copa: ${clubMap(career.clubs).get(career.cupChampion)?.name} campeão.` : ""}`);

  // promoção/rebaixamento — tabela por divisão (a do usuário é real; a outra é sintética)
  const all = career.clubs;
  const userDiv = career.division;
  const realTable = career.table;
  const syntheticOther = (div: 1 | 2 | 3): Standing[] => {
    const ids = all.filter((c) => c.division === div).map((c) => c.id);
    const rng = mulberry32(career.seed + 4242 + div);
    return ids
      .map((id) => {
        const club = all.find((c) => c.id === id)!;
        const played = div === 3 ? 19 : 38;
        const base = (club.rep + club.players.reduce((s, p) => s + p.strength, 0)) / 2;
        const points = Math.round(base * (0.28 + rng() * 0.14));
        const gf = Math.round(base * 0.6 + rng() * 20);
        const ga = Math.round(base * 0.5 + rng() * 20);
        return { clubId: id, played, won: 0, drawn: 0, lost: 0, gf, ga, points, yellows: 0, reds: 0, form: [] };
      })
      .sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
  };
  const makeDivTable = (div: 1 | 2 | 3): Standing[] => {
    const ids = all.filter((c) => c.division === div).map((c) => c.id);
    if (div === userDiv) return sortByTable(ids.filter((id) => realTable.some((r) => r.clubId === id)).map((id) => realTable.find((r) => r.clubId === id)!), career);
    return syntheticOther(div);
  };
  const tableA = makeDivTable(1);
  const tableB = makeDivTable(2);
  const tableC = makeDivTable(3);
  const relegateA = tableA.slice(-4).map((r) => r.clubId);
  const promoteA = tableB.slice(0, 4).map((r) => r.clubId);
  let relegateB = tableB.slice(-4).map((r) => r.clubId);
  let promoteB = tableC.slice(0, 4).map((r) => r.clubId);
  if (tableC.length === 0) {
    promoteB = [];
    relegateB.forEach((id, index) => {
      const source = all.find((club) => club.id === id);
      if (!source) return;
      const generated = structuredClone(source);
      generated.id = `gerado-${career.season}-${index}`;
      generated.name = `Clube gerado ${index + 1}`;
      generated.division = 2;
      generated.players = generated.players.map((player, playerIndex) => ({ ...player, id: `${generated.id}-${playerIndex}` }));
      all.push(generated);
      source.division = 3;
    });
  }
  for (const id of relegateA) {
    const c = all.find((x) => x.id === id);
    if (c) c.division = 2;
  }
  for (const id of promoteA) {
    const c = all.find((x) => x.id === id);
    if (c) c.division = 1;
  }
  for (const id of relegateB) {
    const c = all.find((x) => x.id === id);
    if (c) c.division = 3;
  }
  for (const id of promoteB) {
    const c = all.find((x) => x.id === id);
    if (c) c.division = 2;
  }
  newMessage(career, `mv-${career.season}`, "season", "Acesso e rebaixamento", `Sobem: ${promoteA.map((id) => clubMap(all).get(id)?.name).join(", ")} para a Série A; ${promoteB.map((id) => clubMap(all).get(id)?.name).join(", ")} para a Série B. Caem: ${relegateA.map((id) => clubMap(all).get(id)?.name).join(", ")} para a Série B; ${relegateB.map((id) => clubMap(all).get(id)?.name).join(", ")} para a Série C.`);

  // nova temporada
  career.season += 1;
  career.round = 1;
  career.division = myClub.division;
  const divIds = all.filter((c) => c.division === career.division).map((c) => c.id);
  career.fixtures = fixturesForDivision(divIds, career.division).map((fixture) => ({ ...fixture, date: leagueRoundDate(career.season, fixture.round) }));
  career.table = emptyStandings(divIds);
  const nextCup = copaFirstRound(all.map((club) => ({ id: club.id, division: club.division, rep: club.rep })), career.seed + 1);
  career.cup = [nextCup.fixtures.map((fixture) => ({ ...fixture, date: cupMidweekDate(career.season, 2) }))];
  career.cupByes = nextCup.byes;
  career.cupRound = 0;
  career.cupChampion = undefined;
  career.cupFinalPlayed = false;
  for (const c of all) {
    for (const p of c.players) {
      p.injuredGames = 0;
      p.suspendedGames = 0;
      p.yellows = 0;
      p.reds = 0;
      p.age += 1;
      p.fitness = Math.min(100, p.fitness + 15);
    }
    c.morale = 65;
    c.tactic = "balanced";
  }
  newMessage(career, `new-${career.season}`, "season", `Temporada ${career.season} começou`, "Novo calendário gerado. Boa sorte!");
}

export function setTactic(career: Career, tactic: Tactic): Career {
  const myClub = clubMap(career.clubs).get(career.clubId);
  if (!myClub) throw httpError("Clube não encontrado", 404);
  myClub.tactic = tactic;
  career.tactic = tactic;
  return career;
}

export function setMatchPlan(career: Career, plan: MatchPlan): Career {
  const club = clubMap(career.clubs).get(career.clubId);
  if (!club) throw httpError("Clube não encontrado", 404);
  if (new Set(plan.starterIds).size !== 11) throw httpError("A escalação precisa de 11 jogadores diferentes", 400);
  const playerMap = new Map(club.players.map((player) => [player.id, player]));
  const starters = plan.starterIds.map((id) => playerMap.get(id));
  if (starters.some((player) => !player)) throw httpError("A escalação contém jogador inválido", 400);
  if (starters.some((player) => player!.injuredGames > 0 || player!.suspendedGames > 0)) throw httpError("Não é possível escalar jogador indisponível", 400);
  const benchIds = [...new Set(plan.benchIds ?? club.players.map((player) => player.id).filter((id) => !plan.starterIds.includes(id)).slice(0, 5))];
  if (benchIds.length > 5 || benchIds.some((id) => !playerMap.has(id)) || benchIds.some((id) => plan.starterIds.includes(id))) throw httpError("Banco de reservas inválido", 400);
  const captainId = plan.captainId ?? plan.starterIds[0];
  if (!plan.starterIds.includes(captainId)) throw httpError("O capitão precisa ser titular", 400);
  const substitutions = plan.substitutions ?? [];
  const substitutionOuts = new Set<string>();
  const substitutionIns = new Set<string>();
  for (const change of substitutions) {
    if (!plan.starterIds.includes(change.playerOutId) || !benchIds.includes(change.playerInId) || change.playerOutId === change.playerInId || substitutionOuts.has(change.playerOutId) || substitutionIns.has(change.playerInId)) throw httpError("Substituição inválida", 400);
    substitutionOuts.add(change.playerOutId);
    substitutionIns.add(change.playerInId);
  }
  career.starterIds = plan.starterIds;
  career.benchIds = benchIds;
  career.formation = plan.formation ?? career.formation;
  career.captainId = captainId;
  career.substitutions = substitutions;
  return career;
}

export function updateAdmin(career: Career, patch: AdminPatch): Career {
  const myClub = clubMap(career.clubs).get(career.clubId);
  if (!myClub) throw httpError("Clube não encontrado", 404);
  const next = { ...career.admin, ...patch };
  next.ticketPrice = Math.max(10, Math.min(300, Math.round(next.ticketPrice)));
  next.membershipFee = Math.max(10, Math.min(1_000, Math.round(next.membershipFee)));
  next.sponsorTier = Math.max(1, Math.min(5, Math.round(next.sponsorTier)));
  next.broadcastTier = Math.max(1, Math.min(3, Math.round(next.broadcastTier)));
  next.merchandisePrice = Math.max(30, Math.min(500, Math.round(next.merchandisePrice)));
  next.stadiumLevel = Math.max(1, Math.min(5, Math.round(next.stadiumLevel)));
  next.maintenanceBudget = Math.max(0, Math.min(1_000_000, Math.round(next.maintenanceBudget)));
  next.youthBudget = Math.max(0, Math.min(2_000_000, Math.round(next.youthBudget)));
  next.scoutingBudget = Math.max(0, Math.min(2_000_000, Math.round(next.scoutingBudget)));
  const levelDelta = next.stadiumLevel - career.admin.stadiumLevel;
  if (levelDelta > 0) {
    const cost = levelDelta * 750_000;
    if (myClub.cash < cost) throw httpError("Caixa insuficiente para ampliar o estádio", 400);
    myClub.cash -= cost;
    career.finances = myClub.cash;
    career.ledger = [{ label: `Ampliação do estádio · nível ${next.stadiumLevel}`, amount: -cost }, ...career.ledger].slice(0, 40);
  }
  career.admin = next;
  return career;
}

export function takeLoan(career: Career, amount: number): Career {
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value < 100_000 || value > 10_000_000) throw httpError("Empréstimo deve estar entre R$ 100 mil e R$ 10 milhões", 400);
  const room = MAX_CLUB_DEBT - career.admin.debt;
  if (room < 100_000) throw httpError("Limite de dívida de R$ 20 milhões atingido", 400);
  if (value > room) throw httpError(`A dívida cabe mais R$ ${(room / 1e6).toFixed(1)}M. O limite é R$ 20 milhões.`, 400);
  const myClub = clubMap(career.clubs).get(career.clubId)!;
  myClub.cash += value;
  career.admin.debt += value;
  career.finances = myClub.cash;
  career.ledger = [{ label: "Empréstimo bancário", amount: value }, ...career.ledger].slice(0, 40);
  newMessage(career, `loan-${career.season}-${career.round}`, "finance", "Crédito aprovado", `R$ ${(value / 1e6).toFixed(1)}M adicionados ao caixa. Juros: 1% por rodada.`);
  return career;
}

export function renewContract(career: Career, playerId: string, games = 38): { career: Career; cost: number } {
  const myClub = clubMap(career.clubs).get(career.clubId)!;
  const p = myClub.players.find((x) => x.id === playerId);
  if (!p) throw httpError("Jogador não está no seu elenco", 404);
  const cost = Math.round(p.salary * games * 0.5);
  if (myClub.cash < cost) throw httpError("Caixa insuficiente para renovar", 400);
  myClub.cash -= cost;
  p.contractGames = games;
  career.finances = myClub.cash;
  career.ledger = [{ label: `Renovação de ${p.name}`, amount: -cost }, ...career.ledger].slice(0, 40);
  newMessage(career, `ren-${playerId}`, "contract", "Contrato renovado", `${p.name} renovou por ${games} jogos.`);
  return { career, cost };
}

export function sellPlayer(career: Career, playerId: string): Career {
  const myClub = clubMap(career.clubs).get(career.clubId)!;
  const idx = myClub.players.findIndex((x) => x.id === playerId);
  if (idx < 0) throw httpError("Jogador não está no seu elenco", 404);
  if (myClub.players.length <= 11) throw httpError("O elenco precisa manter pelo menos 11 jogadores", 400);
  if (career.starterIds.includes(playerId)) throw httpError("Retire o jogador da escalação antes de vender", 400);
  const [p] = myClub.players.splice(idx, 1);
  const value = aiTransferPrice(p);
  career.freeAgents.push(p);
  myClub.cash += value;
  career.finances = myClub.cash;
  career.ledger = [{ label: `Venda de ${p.name}`, amount: value }, ...career.ledger].slice(0, 40);
  newMessage(career, `sel-${playerId}`, "market", "Venda concluída", `${p.name} foi vendido por R$ ${(value / 1e6).toFixed(1)}M e virou agente livre.`);
  repairPlan(career);
  refreshMarket(career);
  return career;
}

export function buyPlayer(career: Career, playerId: string): Career {
  const entry = career.market.find((m) => m.playerId === playerId && m.clubId === career.clubId);
  if (entry) {
    // jogador do próprio clube — nada a fazer
    return career;
  }
  const src = clubMap(career.clubs);
  const owner = career.clubs.find((c) => c.players.some((p) => p.id === playerId));
  const freeAgent = career.freeAgents.find((p) => p.id === playerId);
  if (!owner && !freeAgent) throw httpError("Jogador não encontrado", 404);
  const myClub = src.get(career.clubId)!;
  const p = owner?.players.find((x) => x.id === playerId) ?? freeAgent!;
  const price = playerValue(p);
  if (myClub.cash < price) throw httpError("Caixa insuficiente", 400);
  const marketEntry = career.market.find((m) => m.playerId === playerId);
  const actual = marketEntry ? marketEntry.price : price;
  if (myClub.players.length >= 22) throw httpError("Elenco cheio (máx. 22)", 400);
  if (owner) owner.players.splice(owner.players.findIndex((x) => x.id === playerId), 1);
  else career.freeAgents.splice(career.freeAgents.findIndex((x) => x.id === playerId), 1);
  myClub.cash -= actual;
  p.contractGames = 38;
  myClub.players.push(p);
  career.finances = myClub.cash;
  career.ledger = [{ label: `Compra de ${p.name}`, amount: -actual }, ...career.ledger].slice(0, 40);
  newMessage(career, `buy-${playerId}`, "market", "Contratação!", `${p.name} chegou ao ${myClub.name} por R$ ${(actual / 1e6).toFixed(1)}M.`);
  refreshMarket(career);
  return career;
}
