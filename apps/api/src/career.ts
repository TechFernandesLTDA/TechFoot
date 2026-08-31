import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aiTransferPrice, applyResult, cupBracket, defaultStarters, doubleRoundRobin, emptyStandings,
  evolvePlayer, leagueAverageStrength, MATCH_PRIZE, mulberry32, nextCupSlot, playerValue, prizeFor,
  resolvePenalties, weeklyWages, simulateMatch,
  type AdminControls, type Club, type CupFixture, type Fixture, type InboxMessage,
  type Formation, type LedgerEntry, type MatchResult, type Standing, type SubstitutionPlan, type Tactic,
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
  inbox: InboxMessage[];
  news: string[];
  lastRoundEvents: MatchResult | null;
  topScorers: { playerId: string; goals: number }[];
  seed: number;
};

export type AdminPatch = Partial<Omit<AdminControls, "membershipCount" | "debt">>;
export type MatchPlan = { starterIds: string[]; benchIds?: string[]; formation?: Formation; captainId?: string; substitutions?: SubstitutionPlan[] };

const worldPath = fileURLToPath(new URL("../../../data/world/liga-br.json", import.meta.url));

export function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function loadWorld(): { name: string; clubs: Club[]; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[] } {
  return JSON.parse(readFileSync(worldPath, "utf8")) as { name: string; clubs: Club[]; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[] };
}

function newMessage(career: Career, id: string, kind: string, title: string, body: string): void {
  career.inbox = [{ id, kind, title, body, read: false }, ...career.inbox];
  career.news = [title, ...career.news].slice(0, 30);
}

function clubMap(clubs: Club[]): Map<string, Club> {
  return new Map(clubs.map((c) => [c.id, c]));
}

function divisionLabel(division: 1 | 2 | 3): string {
  return division === 1 ? "Série A" : division === 2 ? "Série B" : "Série C";
}

function fixturesForDivision(clubIds: string[], division: 1 | 2 | 3): Fixture[] {
  const fixtures = doubleRoundRobin(clubIds);
  return division === 3 ? fixtures.filter((fixture) => fixture.round <= 19) : fixtures;
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
  if (!career.admin && club) career.admin = defaultAdmin(club);
  if (club) {
    const starters = career.starterIds?.length ? career.starterIds : defaultStarters(club.players);
    career.starterIds = starters;
    career.formation ??= "4-3-3";
    career.captainId ??= starters[0];
    career.benchIds ??= club.players.map((player) => player.id).filter((id) => !starters.includes(id)).slice(0, 5);
    career.substitutions ??= [];
  }
  return career;
}

export function createCareer(clubId: string, season = 2026): Career {
  const world = loadWorld();
  const club = world.clubs.find((c) => c.id === clubId);
  if (!club) throw httpError("Clube inválido", 400);
  const clubs = structuredClone(world.clubs);
  const myClub = clubs.find((c) => c.id === clubId)!;
  const divisionClubIds = clubs.filter((c) => c.division === myClub.division).map((c) => c.id);
  const seed = Date.now() % 1_000_000_000;
  const cupTeams = cupBracket(clubs.map((c) => c.id), seed);

  const career: Career = {
    clubId,
    division: myClub.division,
    season,
    round: 1,
    tactic: "balanced",
    formation: "4-3-3",
    captainId: defaultStarters(myClub.players)[0],
    starterIds: defaultStarters(myClub.players),
    benchIds: myClub.players.map((player) => player.id).filter((id) => !defaultStarters(myClub.players).includes(id)).slice(0, 5),
    substitutions: [],
    clubs,
    table: emptyStandings(divisionClubIds),
    fixtures: fixturesForDivision(divisionClubIds, myClub.division),
    cup: cupTeams,
    cupRound: 0,
    cupFinalPlayed: false,
    finances: myClub.cash,
    admin: defaultAdmin(myClub),
    ledger: [{ label: "Caixa inicial", amount: myClub.cash }],
    market: [],
    inbox: [],
    news: [],
    lastRoundEvents: null,
    topScorers: [],
    seed,
  };

  newMessage(career, "welcome", "info", "Bem-vindo ao escritório", `Você assume o ${myClub.name}. Monte o time, escolha a tática e avance a rodada. ${divisionLabel(myClub.division)} tem regras próprias de acesso.`);
  refreshMarket(career);
  return career;
}

function refreshMarket(career: Career): void {
  const entries = new Map<string, { playerId: string; clubId: string | null; price: number }>();
  for (const club of career.clubs) {
    for (const p of club.players) {
      entries.set(p.id, { playerId: p.id, clubId: club.id, price: playerValue(p) });
    }
  }
  // jogadores livres (sem clube) também entram
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

export function simulateRound(career: Career): { career: Career; userMatch: MatchResult | null } {
  const fixtures = career.fixtures.map((f) => ({ ...f, result: f.result ? structuredClone(f.result) : undefined }));
  const roundGames = fixtures.filter((f) => f.round === career.round && !f.played);
  if (roundGames.length === 0) throw httpError("Rodada já simulada", 409);

  let table = career.table.map((r) => ({ ...r }));
  let seed = career.seed;
  const roundRng = mulberry32(seed + career.round * 7919);
  const clubs = career.clubs;
  const map = clubMap(clubs);
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
    const result = simulateOne(career, home, away, seed);
    game.played = true;
    game.result = result;
    results.push(result);
    table = applyResult(table, home.id, away.id, result.homeGoals, result.awayGoals);
    if (game.homeId === career.clubId || game.awayId === career.clubId) {
      userMatch = result;
      if (result.homeGoals > result.awayGoals) wins += 1;
      else if (result.homeGoals === result.awayGoals) draws += 1;
      else losses += 1;
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
    const resultFor = userMatch.homeGoals > userMatch.awayGoals ? "win" : userMatch.homeGoals === userMatch.awayGoals ? "draw" : "loss";
    for (const p of myClub.players) {
      const played = (userMatch.homeId === career.clubId ? userMatch.homeGoals + userMatch.awayGoals >= 0 : true) && career.starterIds.includes(p.id);
      if (played) {
        const d = evolvePlayer(p, resultFor, avg, rng);
        if (d && d.note === "evoluiu") {
          newMessage(career, `ev-${p.id}`, "evo", "Evolução de força", `${p.name} evoluiu para ${p.strength}.`);
        }
      }
      p.contractGames -= 1;
      p.suspendedGames = Math.max(0, p.suspendedGames - 1);
      p.matches += (played ? 1 : 0);
    }
  }

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
        if (idx >= 0) club.players.splice(idx, 1);
      }
    }
    newMessage(career, `rel-${career.round}`, "contract", "Contratos encerrados", `${toRelease.length} jogador(es) deixaram os clubes e estão livres no mercado.`);
  }

  // Mercado IA: alguns clubes oferecem reforços
  for (const club of clubs) {
    if (club.id === career.clubId) continue;
    if (roundRng() < 0.15) {
      const p = club.players[Math.floor(roundRng() * club.players.length)];
      if (p) {
        newMessage(career, `mk-${club.id}-${career.round}`, "market", `${club.name} oferece reforço`, `${p.name} (${p.strength}) está disponível por ${(playerValue(p) / 1e6).toFixed(1)}M.`);
      }
    }
  }

  career.fixtures = fixtures;
  career.table = sortByTable(table);
  sortTopScorers(career);
  refreshMarket(career);
  career.lastRoundEvents = userMatch;

  // Copa intercalada: uma fase por janela
  const cupWindows = [4, 8, 12, 14];
  if (!career.cupFinalPlayed && cupWindows.includes(career.round)) {
    playCupPhase(career, seed);
  }

  // Se a última rodada da liga chegou e a copa ainda não terminou, força todas as fases
  const totalRounds = Math.max(...career.fixtures.map((f) => f.round));
  if (career.round >= totalRounds && !career.cupFinalPlayed) {
    let guard = 0;
    while (!career.cupFinalPlayed && guard < 5) {
      playCupPhase(career, seed + guard);
      guard++;
    }
  }

  if (career.round >= totalRounds && !career.fixtures.some((f) => !f.played)) {
    endOfSeason(career);
    return { career, userMatch: career.lastRoundEvents };
  }

  career.round += 1;
  career.seed = seed;
  return { career, userMatch };
}

function sortByTable(table: Standing[]): Standing[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gd = (b.gf - b.ga) - (a.gf - a.ga);
    return gd !== 0 ? gd : b.gf - a.gf;
  });
}

function playCupPhase(career: Career, seed: number): void {
  const phase = career.cup[career.cupRound];
  if (!phase) return;
  const pending = phase.filter((f) => !f.played);
  if (pending.length === 0) {
    if (phase.length === 1) {
      career.cupChampion = phase[0].winnerId;
      career.cupFinalPlayed = true;
      newMessage(career, `cup-champ-${career.season}`, "cup", "Campeão da Copa!", `${clubMap(career.clubs).get(phase[0].winnerId!)?.name} venceu a Copa Brasil TechFoot!`);
    }
    return;
  }
  const map = clubMap(career.clubs);
  career.cup[career.cupRound] = phase.map((f) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return f;
    const result = simulateOne(career, home, away, seed + career.cupRound * 100 + f.homeId.length);
    let winnerId: string;
    let penalties: { home: number; away: number; winner: "home" | "away" } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      penalties = resolvePenaltiesCtx(home, away, seed + f.homeId.length);
      winnerId = penalties.winner === "home" ? home.id : away.id;
    }
    newMessage(career, `cup-${f.slot}-${f.homeId}`, "cup", `Copa · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Decisão nos pênaltis. Avança: ${clubMap(career.clubs).get(winnerId)?.name}` : `Avança: ${clubMap(career.clubs).get(winnerId)?.name}`);
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });

  const winners = career.cup[career.cupRound].map((f) => f.winnerId!).filter(Boolean);
  if (phase.length === 1) {
    career.cupChampion = winners[0];
    career.cupFinalPlayed = true;
    return;
  }
  // monta próxima fase a partir dos vencedores
  const shuffled = winners.slice();
  const drawRng = mulberry32(seed + career.cupRound * 5000 + career.season);
  for (let i = shuffled.length; i > 1; i--) {
    const j = Math.floor(drawRng() * i);
    [shuffled[i - 1], shuffled[j]] = [shuffled[j], shuffled[i - 1]];
  }
  const next: CupFixture[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    next.push({ slot: nextCupSlot(phase.length), homeId: shuffled[i], awayId: shuffled[i + 1], played: false });
  }
  career.cup.push(next);
  career.cupRound += 1;
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
  const finalTable = sortByTable(career.table);
  const pos = finalTable.findIndex((r) => r.clubId === career.clubId) + 1;
  const prize = prizeFor(pos);
  myClub.cash += prize;
  career.finances = myClub.cash;
  career.ledger = [{ label: `Premiação (${pos}º lugar)`, amount: prize }, ...career.ledger].slice(0, 40);
  newMessage(career, `season-${career.season}`, "season", `Temporada ${career.season} encerrada`, `${myClub.name} terminou em ${pos}º lugar na ${career.division === 1 ? "Série A" : "Série B"}. Prêmio: R$ ${(prize / 1e6).toFixed(1)}M.${career.cupChampion ? ` Copa: ${clubMap(career.clubs).get(career.cupChampion)?.name} campeão.` : ""}`);

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
        return { clubId: id, played, won: 0, drawn: 0, lost: 0, gf, ga, points };
      })
      .sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
  };
  const makeDivTable = (div: 1 | 2 | 3): Standing[] => {
    const ids = all.filter((c) => c.division === div).map((c) => c.id);
    if (div === userDiv) return sortByTable(ids.filter((id) => realTable.some((r) => r.clubId === id)).map((id) => realTable.find((r) => r.clubId === id)!));
    return syntheticOther(div);
  };
  const tableA = makeDivTable(1);
  const tableB = makeDivTable(2);
  const tableC = makeDivTable(3);
  const relegateA = tableA.slice(-4).map((r) => r.clubId);
  const promoteA = tableB.slice(0, 4).map((r) => r.clubId);
  const relegateB = tableB.slice(-4).map((r) => r.clubId);
  const promoteB = tableC.slice(0, 4).map((r) => r.clubId);
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
  career.fixtures = fixturesForDivision(divIds, career.division);
  career.table = emptyStandings(divIds);
  career.cup = cupBracket(all.map((c) => c.id), career.seed + 1);
  career.cupRound = 0;
  career.cupChampion = undefined;
  career.cupFinalPlayed = false;
  for (const c of all) {
    for (const p of c.players) {
      p.injuredGames = 0;
      p.suspendedGames = 0;
      p.yellows = 0;
      p.reds = 0;
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
  if (substitutions.some((change) => !plan.starterIds.includes(change.playerOutId) || !benchIds.includes(change.playerInId) || change.playerOutId === change.playerInId)) throw httpError("Substituição inválida", 400);
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
  const p = myClub.players[idx];
  const value = aiTransferPrice(p);
  myClub.players.splice(idx, 1);
  myClub.cash += value;
  career.finances = myClub.cash;
  career.ledger = [{ label: `Venda de ${p.name}`, amount: value }, ...career.ledger].slice(0, 40);
  newMessage(career, `sel-${playerId}`, "market", "Venda concluída", `${p.name} foi vendido por R$ ${(value / 1e6).toFixed(1)}M e virou agente livre.`);
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
  if (!owner) throw httpError("Jogador não encontrado", 404);
  const myClub = src.get(career.clubId)!;
  const p = owner.players.find((x) => x.id === playerId)!;
  const price = playerValue(p);
  if (myClub.cash < price) throw httpError("Caixa insuficiente", 400);
  const marketEntry = career.market.find((m) => m.playerId === playerId);
  const actual = marketEntry ? marketEntry.price : price;
  if (myClub.players.length >= 22) throw httpError("Elenco cheio (máx. 22)", 400);
  owner.players.splice(owner.players.findIndex((x) => x.id === playerId), 1);
  myClub.cash -= actual;
  p.contractGames = 20;
  myClub.players.push(p);
  career.finances = myClub.cash;
  career.ledger = [{ label: `Compra de ${p.name}`, amount: -actual }, ...career.ledger].slice(0, 40);
  newMessage(career, `buy-${playerId}`, "market", "Contratação!", `${p.name} chegou ao ${myClub.name} por R$ ${(actual / 1e6).toFixed(1)}M.`);
  refreshMarket(career);
  return career;
}
