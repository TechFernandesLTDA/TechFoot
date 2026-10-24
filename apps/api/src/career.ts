import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  agePlayer, aiTransferPrice, applyResult, applyGroupResult, completeLineup, cupBracket, defaultAdminControls, defaultBench, defaultStarters,
  DIVISION_ECONOMY, doubleRoundRobin, emptyStandings, evolvePlayer, freeAgentFee, leagueAverageStrength, LOAN_AMORTIZATION_RATE,
  LOAN_INTEREST_RATE, marketSalary, maxBroadcastTier, maxSponsorTier, membershipTarget, mulberry32, nextCupRound,
  nextMembershipCount, prizeFor, renewalCost, resolvePenalties, roundFinance, sellPrice, simulateMatch, simulateMatchStepByStep, sortTable, sortGroupTable,
  startersOf, updateCondition, youthStrength,
  copaDoBrasilBracket, libertadoresBracket, sulAmericanaBracket, supercopaBracket, recopaBracket,
  estadualBracket, generateSeasonCalendar, knockoutFromGroups, advanceKnockout,
  createDefaultStaff, getYouthCoach,
  staffDevelopmentBonus, staffMoraleImpact, ageStaff,
  generateYouthPlayers, promoteYouthPlayer, developYouthPlayer, evaluateYouthPlayer,
  type AdminControls, type Club, type Competition, type CompetitionPhase, type CupFixture, type Division, type Fixture, type Formation, type InboxMessage, type LedgerEntry,
  type MatchEvent, type MatchOutcome, type MatchResult, type Player, type Position, type Standing, type SubstitutionPlan, type Tactic,
  type Staff, type StaffRole, type YouthTeam,
  ESTADUAIS_FORMATS,
} from "@techfoot/engine";

export type Career = {
  clubId: string;
  division: Division;
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
  /** Novas competições */
  copaDoBrasil?: Competition;
  libertadores?: Competition;
  sulAmericana?: Competition;
  supercopa?: Competition;
  recopa?: Competition;
  estaduais?: Competition[];
  /** Calendário da temporada */
  calendar?: {
    currentRound: number;
    fifaWindows: { id: string; name: string; startRound: number; endRound: number }[];
  };
  finances: number;
  admin: AdminControls;
  ledger: LedgerEntry[];
  market: { playerId: string; clubId: string | null; price: number }[];
  freeAgents: Player[];
  inbox: InboxMessage[];
  news: string[];
  lastRoundEvents: MatchResult | null;
  topScorers: { playerId: string; goals: number }[];
  seed: number;
  /** Comissão técnica e base */
  staff: Staff[];
  youthTeams: YouthTeam[];
  /** Histórico de contratações de staff */
  staffHistory: { season: number; role: StaffRole | "youth_promotion"; name: string; action: "hired" | "fired" | "resigned" }[];
};

export type AdminPatch = Partial<Omit<AdminControls, "membershipCount" | "debt">>;
export type MatchPlan = { starterIds: string[]; benchIds?: string[]; formation?: Formation; captainId?: string; substitutions?: SubstitutionPlan[] };

const worldPath = fileURLToPath(new URL("../../../data/world/liga-br.json", import.meta.url));

export const SQUAD_MAX = 22;
export const SQUAD_MIN = 14;
export const LEDGER_LIMIT = 80;
export const INBOX_LIMIT = 150;
export const NEW_CONTRACT_GAMES = 38;
export const MAX_DEBT = 15_000_000;
export const STADIUM_COST_PER_SEAT = 30;
/** Rodadas em que uma fase da copa é disputada (as restantes são forçadas no fim da liga). */
export const CUP_WINDOWS = [3, 7, 11, 15, 19, 23];

const YOUTH_NAMES = ["Arthur", "Bernardo", "Cauã", "Davi", "Erick", "Felipe", "Gabriel", "Henrique", "Isaac", "Joaquim", "Kauê", "Lorenzo", "Miguel", "Nicolas", "Otto", "Pietro", "Rafael", "Samuel", "Théo", "Vicente"];
const YOUTH_SURNAMES = ["Andrade", "Bittencourt", "Campos", "Duarte", "Fonseca", "Guimarães", "Ibrahim", "Junqueira", "Lacerda", "Moraes", "Neves", "Ortiz", "Peixoto", "Rezende", "Sampaio", "Tavares", "Uchoa", "Valente", "Xavier", "Zanetti"];

export function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

type World = { name: string; clubs: Club[]; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[] };

export function loadWorld(): World {
  return JSON.parse(readFileSync(worldPath, "utf8")) as World;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function money(value: number): string {
  return `R$ ${(value / 1e6).toFixed(1)}M`;
}

function newMessage(career: Career, id: string, kind: string, title: string, body: string): void {
  career.inbox = [{ id, kind, title, body, read: false }, ...career.inbox].slice(0, INBOX_LIMIT);
  career.news = [title, ...career.news].slice(0, 30);
}

function addLedger(career: Career, entry: LedgerEntry): void {
  career.ledger = [entry, ...career.ledger].slice(0, LEDGER_LIMIT);
}

function clubMap(clubs: Club[]): Map<string, Club> {
  return new Map(clubs.map((c) => [c.id, c]));
}

function myClubOf(career: Career): Club {
  const club = clubMap(career.clubs).get(career.clubId);
  if (!club) throw httpError("Clube não encontrado", 404);
  return club;
}

function divisionLabel(division: Division): string {
  return division === 1 ? "Série A" : division === 2 ? "Série B" : "Série C";
}

function divisionOf(career: Career, club: Club): Division {
  return club.id === career.clubId ? career.division : club.division;
}

function fixturesForDivision(clubIds: string[], division: Division): Fixture[] {
  const fixtures = doubleRoundRobin(clubIds);
  return division === 3 ? fixtures.filter((fixture) => fixture.round <= 19) : fixtures;
}

function outcomeFor(result: MatchResult, clubId: string): MatchOutcome {
  const mine = result.homeId === clubId ? result.homeGoals : result.awayGoals;
  const theirs = result.homeId === clubId ? result.awayGoals : result.homeGoals;
  return mine > theirs ? "win" : mine === theirs ? "draw" : "loss";
}

/** Mantém o plano de jogo válido: completa titulares indisponíveis e limpa banco/substituições. */
function repairPlan(career: Career): void {
  const club = clubMap(career.clubs).get(career.clubId);
  if (!club) return;
  career.formation ??= "4-3-3";
  career.starterIds = completeLineup(club.players, career.starterIds ?? [], career.formation);
  const valid = new Set(club.players.map((player) => player.id));
  const starters = new Set(career.starterIds);
  const keptBench = (career.benchIds ?? []).filter((id) => valid.has(id) && !starters.has(id)).slice(0, 5);
  const fill = defaultBench(club.players, career.starterIds).filter((id) => !keptBench.includes(id));
  career.benchIds = [...keptBench, ...fill].slice(0, 5);
  career.captainId = starters.has(career.captainId) ? career.captainId : career.starterIds[0];
  career.substitutions = (career.substitutions ?? []).filter((change) => starters.has(change.playerOutId) && career.benchIds.includes(change.playerInId));
}

export function normalizeCareer(career: Career): Career {
  for (const club of career.clubs) {
    club.state ??= "BR";
    club.division ??= 2;
    club.tactic ??= "balanced";
    club.rep ??= 50;
    club.morale ??= 65;
    club.staff ??= [];
    club.youthTeams ??= [];
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
      player.injuredGames ??= 0;
    }
    // Inicializa staff e base para todos os clubes
    if (club.staff.length === 0) {
      club.staff = createDefaultStaff(club.rep, mulberry32(career.seed + club.id.length * 17));
    }
    if (club.youthTeams.length === 0) {
      club.youthTeams = [
        { category: "u20", players: generateYouthPlayers(club, "u20", 18, mulberry32(career.seed + club.id.length * 19)), coachId: undefined },
        { category: "u17", players: generateYouthPlayers(club, "u17", 16, mulberry32(career.seed + club.id.length * 23)), coachId: undefined },
      ];
      const u20Coach = getYouthCoach(club.staff, "u20");
      const u17Coach = getYouthCoach(club.staff, "u17");
      if (u20Coach) club.youthTeams[0].coachId = u20Coach.id;
      if (u17Coach) club.youthTeams[1].coachId = u17Coach.id;
    }
  }
  career.freeAgents ??= [];
  career.ledger ??= [];
  career.inbox ??= [];
  career.news ??= [];
  career.market ??= [];
  career.topScorers ??= [];
  career.staff ??= [];
  career.youthTeams ??= [];
  career.staffHistory ??= [];
  const club = career.clubs.find((item) => item.id === career.clubId);
  if (club) {
    career.division ??= club.division;
    if (!career.admin) career.admin = defaultAdminControls(club, career.division);
    career.admin.debt ??= 0;
    career.admin.membershipCount ??= membershipTarget(club, career.admin, career.division);
    career.formation ??= "4-3-3";
    career.starterIds ??= [];
    career.benchIds ??= [];
    career.substitutions ??= [];
    career.captainId ??= "";
    repairPlan(career);
    career.tactic ??= club.tactic;
    club.tactic = career.tactic;
    
    // Sincroniza career.staff com club.staff do clube do usuário
    if (career.staff.length === 0) {
      career.staff = club.staff ?? [];
    }
    if (career.youthTeams.length === 0) {
      career.youthTeams = club.youthTeams ?? [];
    }
  }
  return career;
}

export function createCareer(clubId: string, season = 2026, seed?: number): Career {
  const world = loadWorld();
  const club = world.clubs.find((c) => c.id === clubId);
  if (!club) throw httpError("Clube inválido", 400);
  const clubs = structuredClone(world.clubs);
  const myClub = clubs.find((c) => c.id === clubId)!;
  const divisionClubIds = clubs.filter((c) => c.division === myClub.division).map((c) => c.id);
  const generatedSeed = seed ?? Date.now() % 1_000_000_000;
  const starters = defaultStarters(myClub.players, "4-3-3");

  // Gera competições
  const calendar = generateSeasonCalendar(season, generatedSeed);
  
  // Copa do Brasil: todos os clubes participam
  const copaDoBrasil = copaDoBrasilBracket(clubs, generatedSeed);
  
  // Libertadores: times da Série A (top 6 + campeão Copa do Brasil)
  const serieAClubs = clubs.filter(c => c.division === 1);
  const libertadoresQualified = serieAClubs.slice(0, 6);
  const libertadores = libertadoresBracket(libertadoresQualified, generatedSeed);
  
  // Sul-Americana: times da Série A (7º a 12º)
  const sulAmericanaQualified = serieAClubs.slice(6, 12);
  const sulAmericana = sulAmericanaBracket(sulAmericanaQualified, generatedSeed);
  
  // Estaduais: agrupa por estado
  const estaduais: Competition[] = [];
  const clubsByState = new Map<string, Club[]>();
  for (const c of clubs) {
    const state = c.state || "BR";
    if (!clubsByState.has(state)) clubsByState.set(state, []);
    clubsByState.get(state)!.push(c);
  }
  for (const [state, stateClubs] of clubsByState) {
    const format = ESTADUAIS_FORMATS.find(f => f.state === state);
    if (format && stateClubs.length >= 4) {
      const estadualTeams = stateClubs.map(c => c.id);
      const bracket = estadualBracket(estadualTeams, format, generatedSeed + state.charCodeAt(0));
      estaduais.push({
        id: `estadual-${state.toLowerCase()}`,
        name: format.name,
        type: "estadual",
        season,
        phase: "first_stage",
        bracket,
        prizes: { "champion": 1_000_000, "runner_up": 500_000 },
      });
    }
  }

  const career: Career = {
    clubId,
    division: myClub.division,
    season,
    round: 1,
    tactic: "balanced",
    formation: "4-3-3",
    captainId: starters[0],
    starterIds: starters,
    benchIds: defaultBench(myClub.players, starters),
    substitutions: [],
    clubs,
    table: emptyStandings(divisionClubIds),
    fixtures: fixturesForDivision(divisionClubIds, myClub.division),
    cup: buildCup(clubs, generatedSeed),
    cupRound: 0,
    cupFinalPlayed: false,
    copaDoBrasil,
    libertadores,
    sulAmericana,
    estaduais,
    calendar: {
      currentRound: 1,
      fifaWindows: calendar.fifaWindows,
    },
    finances: myClub.cash,
    admin: defaultAdminControls(myClub, myClub.division),
    ledger: [{ label: "Caixa inicial", amount: myClub.cash }],
    market: [],
    freeAgents: [],
    inbox: [],
    news: [],
    lastRoundEvents: null,
    topScorers: [],
    seed: generatedSeed,
    /** Comissão técnica e base */
    staff: createDefaultStaff(myClub.rep, mulberry32(generatedSeed + 111)),
    youthTeams: [
      { category: "u20", players: generateYouthPlayers(myClub, "u20", 18, mulberry32(generatedSeed + 222)), coachId: undefined },
      { category: "u17", players: generateYouthPlayers(myClub, "u17", 16, mulberry32(generatedSeed + 333)), coachId: undefined },
    ],
    staffHistory: [],
  };

  // Atribui técnicos das categorias de base
  const u20Coach = getYouthCoach(career.staff, "u20");
  const u17Coach = getYouthCoach(career.staff, "u17");
  if (u20Coach) career.youthTeams[0].coachId = u20Coach.id;
  if (u17Coach) career.youthTeams[1].coachId = u17Coach.id;

  newMessage(career, "welcome", "info", "Bem-vindo ao escritório", `Você assume o ${myClub.name}. Monte o time, escolha a tática e avance a rodada. ${divisionLabel(myClub.division)} tem regras próprias de acesso.`);
  
  // Inicializa staff e base para todos os clubes
  for (const club of clubs) {
    club.staff = createDefaultStaff(club.rep, mulberry32(generatedSeed + club.id.length * 17));
    club.youthTeams = [
      { category: "u20", players: generateYouthPlayers(club, "u20", 18, mulberry32(generatedSeed + club.id.length * 19)), coachId: undefined },
      { category: "u17", players: generateYouthPlayers(club, "u17", 16, mulberry32(generatedSeed + club.id.length * 23)), coachId: undefined },
    ];
    const u20Coach = getYouthCoach(club.staff, "u20");
    const u17Coach = getYouthCoach(club.staff, "u17");
    if (u20Coach) club.youthTeams[0].coachId = u20Coach.id;
    if (u17Coach) club.youthTeams[1].coachId = u17Coach.id;
  }
  
  // Sincroniza career.staff/youthTeams com o clube do usuário
  career.staff = myClub.staff ?? [];
  career.youthTeams = myClub.youthTeams ?? [];
  
  refreshMarket(career);
  return career;
}

/** Chave da copa: clubes de maior reputação avançam direto quando o número de times não é potência de 2. */
function buildCup(clubs: Club[], seed: number): CupFixture[][] {
  const byRep = [...clubs].sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id)).map((c) => c.id);
  return cupBracket(clubs.map((c) => c.id), seed, byRep);
}

function refreshMarket(career: Career): void {
  const entries: Career["market"] = [];
  for (const club of career.clubs) {
    for (const p of club.players) {
      const price = club.id === career.clubId ? sellPrice(p) : aiTransferPrice(p, career.admin.scoutingBudget);
      entries.push({ playerId: p.id, clubId: club.id, price });
    }
  }
  for (const player of career.freeAgents) entries.push({ playerId: player.id, clubId: null, price: freeAgentFee(player) });
  career.market = entries;
}

function sortTopScorers(career: Career): void {
  const rows: { playerId: string; goals: number }[] = [];
  for (const club of career.clubs) for (const p of club.players) if (p.goals > 0) rows.push({ playerId: p.id, goals: p.goals });
  career.topScorers = rows.sort((a, b) => b.goals - a.goals).slice(0, 20);
}

function findPlayer(career: Career, clubId: string, playerId: string | undefined): Player | undefined {
  if (!playerId) return undefined;
  return clubMap(career.clubs).get(clubId)?.players.find((x) => x.id === playerId);
}

/** Cartões, suspensões e lesões (Brasil: 3 amarelos = 1 jogo; vermelho = 1 jogo, 2 se direto por agressão). */
function applyDiscipline(career: Career, result: MatchResult): void {
  const injuryGames = new Map((result.injuryDetails ?? []).map((item) => [item.playerId, item.games]));
  for (const e of result.events) {
    const p = findPlayer(career, e.teamId, e.playerId);
    if (!p) continue;
    if (e.kind === "yellow") {
      p.yellows += 1;
      if (p.yellows % 3 === 0) p.suspendedGames = Math.max(p.suspendedGames, 1);
    } else if (e.kind === "red") {
      p.reds += 1;
      const direct = !result.events.some((other) => other.kind === "yellow" && other.playerId === e.playerId && other.minute <= e.minute);
      p.suspendedGames = Math.max(p.suspendedGames, direct ? 2 : 1);
    } else if (e.kind === "goal") {
      p.goals += 1;
    } else if (e.kind === "injury") {
      p.injuredGames = Math.max(p.injuredGames, injuryGames.get(p.id) ?? 1 + (e.minute % 3));
    }
  }
}

/** Escolha de tática da IA: ataca quem é mais fraco, fecha-se contra quem é mais forte. */
function aiTactic(self: Club, opponent: Club): Tactic {
  const diff = leagueAverageStrength(self.players) - leagueAverageStrength(opponent.players);
  return diff > 3 ? "offensive" : diff < -3 ? "defensive" : "balanced";
}

interface PlayedMatch {
  result: MatchResult;
  played: Record<string, Set<string>>; // clubId -> ids de quem entrou em campo
}

function simulateOne(career: Career, home: Club, away: Club, seed: number): PlayedMatch {
  const isUser = (club: Club) => club.id === career.clubId;
  const lineup = (club: Club): string[] => (isUser(club) ? completeLineup(club.players, career.starterIds, career.formation) : defaultStarters(club.players, "4-3-3"));
  const homeStarters = lineup(home);
  const awayStarters = lineup(away);
  const result = simulateMatch(
    {
      club: home,
      starterIds: homeStarters,
      benchIds: isUser(home) ? career.benchIds : undefined,
      captainId: isUser(home) ? career.captainId : undefined,
      substitutions: isUser(home) ? career.substitutions : undefined,
      tactic: isUser(home) ? career.tactic : aiTactic(home, away),
      formation: isUser(home) ? career.formation : "4-3-3",
    },
    {
      club: away,
      starterIds: awayStarters,
      benchIds: isUser(away) ? career.benchIds : undefined,
      captainId: isUser(away) ? career.captainId : undefined,
      substitutions: isUser(away) ? career.substitutions : undefined,
      tactic: isUser(away) ? career.tactic : aiTactic(away, home),
      formation: isUser(away) ? career.formation : "4-3-3",
    },
    seed,
  );
  applyDiscipline(career, result);
  const played: Record<string, Set<string>> = {
    [home.id]: new Set(startersOf(home.players, homeStarters).map((p) => p.id)),
    [away.id]: new Set(startersOf(away.players, awayStarters).map((p) => p.id)),
  };
  for (const change of result.substitutions) played[change.teamId]?.add(change.playerInId);
  return { result, played };
}

/**
 * Efeitos pós-jogo para um clube: evolução de quem jogou, condição física/moral de todos,
 * moral do clube. `notify` gera mensagens (só para o clube do usuário).
 */
function applyPostMatch(career: Career, club: Club, match: PlayedMatch, divisionAvg: number, rng: () => number, options: { notify: boolean; recoverBench: boolean }): void {
  const outcome = outcomeFor(match.result, club.id);
  const playedIds = match.played[club.id] ?? new Set<string>();
  
  // Bônus de desenvolvimento do staff
  const devBonus = staffDevelopmentBonus(club.staff, "senior");
  const moraleImpact = staffMoraleImpact(club.staff);
  
  for (const p of club.players) {
    const played = playedIds.has(p.id);
    if (played) {
      // Aplica bônus de desenvolvimento do staff
      const d = evolvePlayer(p, outcome, divisionAvg, rng);
      // Adiciona bônus do staff ao desenvolvimento
      if (d && devBonus > 0) {
        p.strength = Math.min(100, p.strength + Math.round(devBonus * (0.5 + rng() * 0.5)));
      }
      if (d && options.notify) {
        newMessage(career, `ev-${p.id}-${career.season}-${career.round}-${d.strengthAfter}`, "evo", d.note === "evoluiu" ? "Evolução de força" : "Queda de rendimento", `${p.name} ${d.note} para ${p.strength}.`);
      }
      updateCondition(p, true, outcome);
    } else if (options.recoverBench) {
      updateCondition(p, false, null);
    }
  }
  
  // Moral do clube com impacto do staff
  const swing = outcome === "win" ? 5 : outcome === "draw" ? 1 : -4;
  club.morale = Math.round(clamp(club.morale + swing + moraleImpact + (60 - club.morale) * 0.1, 20, 100));
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
  const myClub = map.get(career.clubId)!;
  const divisionAvg: Record<Division, number> = {
    1: leagueAverageStrength(clubs.filter((c) => c.division === 1).flatMap((c) => c.players)),
    2: leagueAverageStrength(clubs.filter((c) => c.division === 2).flatMap((c) => c.players)),
    3: leagueAverageStrength(clubs.filter((c) => c.division === 3).flatMap((c) => c.players)),
  };
  const devRng = mulberry32(seed + career.round * 555);

  let userMatch: MatchResult | null = null;
  let homeGames = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const playedThisRound = new Set<string>();
  const newlySuspended = new Set<string>();

  for (const game of roundGames) {
    seed += 1;
    const home = map.get(game.homeId);
    const away = map.get(game.awayId);
    if (!home || !away) continue;
    const match = simulateOne(career, home, away, seed);
    game.played = true;
    game.result = match.result;
    table = applyResult(table, home.id, away.id, match.result.homeGoals, match.result.awayGoals);
    for (const club of [home, away]) {
      playedThisRound.add(club.id);
      applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: true });
    }
    if (home.id === career.clubId || away.id === career.clubId) {
      userMatch = match.result;
      if (home.id === career.clubId) homeGames += 1;
      const outcome = outcomeFor(match.result, career.clubId);
      if (outcome === "win") wins += 1;
      else if (outcome === "draw") draws += 1;
      else losses += 1;
    }
    // Track newly suspended players from this match
    for (const e of match.result.events) {
      if (e.kind === "red" && e.playerId) newlySuspended.add(e.playerId);
      else if (e.kind === "yellow" && e.playerId) {
        const p = findPlayer(career, e.teamId, e.playerId);
        if (p && p.yellows % 3 === 0) newlySuspended.add(p.id);
      }
    }
  }
  // Clubes de outras divisões não têm partidas simuladas: recebem um "jogo virtual" para que
  // evolução, desgaste e envelhecimento sigam o mesmo ritmo do resto do país.
  for (const club of clubs) {
    if (playedThisRound.has(club.id)) continue;
    if (club.division === career.division) {
      for (const p of club.players) updateCondition(p, false, null);
      continue;
    }
    if (club.division === 3 && career.round > 19) continue; // Série C tem turno único
    const roll = devRng();
    const outcome: MatchOutcome = roll < 0.4 ? "win" : roll < 0.7 ? "draw" : "loss";
    const starters = new Set(defaultStarters(club.players, "4-3-3"));
    for (const p of club.players) {
      if (starters.has(p.id)) {
        evolvePlayer(p, outcome, divisionAvg[club.division], devRng);
        updateCondition(p, true, outcome);
      } else {
        updateCondition(p, false, null);
      }
    }
  }

  // Finanças da rodada
  const userOutcome: MatchOutcome | null = userMatch ? outcomeFor(userMatch, career.clubId) : null;
  const finance = roundFinance(myClub, career.admin, { division: career.division, homeGames, wins, draws, losses, cash: myClub.cash });
  myClub.cash += finance.total;
  career.admin.debt = Math.max(0, career.admin.debt - finance.amortization);
  career.finances = myClub.cash;
  const round = career.round;
  const entries: LedgerEntry[] = [
    { round, label: `Bilheteria, sócios e produtos (${Math.round(finance.attendance * 100)}% de ocupação)`, amount: finance.tickets + finance.membership + finance.merchandise },
    { round, label: "Patrocínio e transmissão", amount: finance.sponsor + finance.broadcast },
    ...(finance.prize > 0 ? [{ round, label: "Premiação por resultado", amount: finance.prize }] : []),
    { round, label: "Folha salarial", amount: -finance.wages },
    { round, label: "Manutenção, base e scouting", amount: -(finance.maintenance + finance.youth + finance.scouting) },
    ...(finance.interest + finance.amortization > 0 ? [{ round, label: "Juros e amortização da dívida", amount: -(finance.interest + finance.amortization) }] : []),
    ...(finance.overdraft > 0 ? [{ round, label: "Juros do caixa negativo", amount: -finance.overdraft }] : []),
  ];
  career.ledger = [...entries, ...career.ledger].slice(0, LEDGER_LIMIT);
  career.admin.membershipCount = nextMembershipCount(career.admin.membershipCount, membershipTarget(myClub, career.admin, career.division), userOutcome);
  if (myClub.cash < 0 && myClub.cash - finance.total >= 0) {
    newMessage(career, `neg-${career.season}-${round}`, "finance", "Caixa negativo", "O clube entrou no vermelho. Juros de 1% por rodada incidem sobre o saldo devedor.");
  }

  // Contratos do meu clube: quem zerou vira agente livre. Se o elenco ficaria abaixo do
  // mínimo, a diretoria renova em caráter emergencial (mais caro e curto).
  const released: Player[] = [];
  const emergency: Player[] = [];
  for (const p of myClub.players) p.contractGames -= 1;
  for (let i = myClub.players.length - 1; i >= 0; i--) {
    const p = myClub.players[i];
    if (p.contractGames > 0) continue;
    if (myClub.players.length > SQUAD_MIN) {
      released.push(...myClub.players.splice(i, 1));
    } else {
      p.salary = Math.round(marketSalary(p.strength, career.division) * 1.2);
      p.contractGames = 19;
      const cost = renewalCost(p.salary, p.contractGames);
      myClub.cash -= cost;
      addLedger(career, { round, label: `Renovação emergencial de ${p.name}`, amount: -cost });
      emergency.push(p);
    }
  }
  career.finances = myClub.cash;
  if (released.length) {
    career.freeAgents.push(...released);
    newMessage(career, `rel-${career.season}-${round}`, "contract", "Contratos encerrados", `${released.map((p) => p.name).join(", ")} deixaram o clube e estão livres no mercado.`);
  }
  if (emergency.length) {
    newMessage(career, `emg-${career.season}-${round}`, "contract", "Renovação emergencial", `Para manter ${SQUAD_MIN} atletas, a diretoria renovou ${emergency.map((p) => p.name).join(", ")} por 19 jogos com salário 20% acima do mercado.`);
  }
  for (const p of myClub.players) {
    if (p.contractGames === 3) newMessage(career, `exp-${p.id}-${career.season}-${round}`, "contract", "Contrato perto do fim", `${p.name} tem 3 jogos de contrato. Renove ou perderá o jogador.`);
  }

  // Mercado IA: alguns clubes oferecem reforços
  for (const club of clubs) {
    if (club.id === career.clubId) continue;
    if (roundRng() < 0.12) {
      const p = club.players[Math.floor(roundRng() * club.players.length)];
      if (p) newMessage(career, `mk-${club.id}-${career.season}-${round}`, "market", `${club.name} oferece reforço`, `${p.name} (${p.strength}) está disponível por ${money(aiTransferPrice(p, career.admin.scoutingBudget))}.`);
    }
  }

  career.fixtures = fixtures;
  career.table = sortTable(table);
  sortTopScorers(career);
  career.lastRoundEvents = userMatch;

  // Copa intercalada: uma fase por janela; no fim da liga, força o que faltar
  const totalRounds = Math.max(...career.fixtures.map((f) => f.round));
  if (!career.cupFinalPlayed && CUP_WINDOWS.includes(round)) playCupPhase(career, seed, divisionAvg);
  if (round >= totalRounds) {
    let guard = 0;
    while (!career.cupFinalPlayed && guard < 8) {
      playCupPhase(career, seed + 1000 * (guard + 1), divisionAvg);
      guard++;
    }
  }

  // Novas competições
  // Copa do Brasil: fases nas rodadas 4, 10, 16, 22, 28, 34
  const CDB_WINDOWS = [4, 10, 16, 22, 28, 34];
  if (career.copaDoBrasil && !career.copaDoBrasil.champion && CDB_WINDOWS.includes(round)) {
    playCopaDoBrasilPhase(career, seed, divisionAvg);
  }
  
  // Libertadores: fase de grupos rodadas 2-13, mata-mata depois
  if (career.libertadores) {
    if (career.libertadores.phase === "group" && round >= 2 && round <= 13) {
      playLibertadoresGroupStage(career, seed, divisionAvg);
    } else if (career.libertadores.phase !== "group" && !career.libertadores.champion) {
      playInternationalKnockout(career, career.libertadores, seed, divisionAvg, "Libertadores");
    }
  }
  
  // Sul-Americana: fase de grupos rodadas 2-13, mata-mata depois
  if (career.sulAmericana) {
    if (career.sulAmericana.phase === "group" && round >= 2 && round <= 13) {
      playSulAmericanaGroupStage(career, seed, divisionAvg);
    } else if (career.sulAmericana.phase !== "group" && !career.sulAmericana.champion) {
      playInternationalKnockout(career, career.sulAmericana, seed, divisionAvg, "Sul-Americana");
    }
  }
  
  // Estaduais: rodadas 1-16
  if (career.estaduais) {
    for (const estadual of career.estaduais) {
      if (!estadual.champion && round <= 16) {
        playEstadualPhase(career, estadual, seed, divisionAvg);
      }
    }
  }
  
  // Supercopa: rodada 0 (antes do campeonato)
  if (career.supercopa && !career.supercopa.champion && round === 1) {
    playSupercopa(career, seed, divisionAvg);
  }
  
  // Recopa: rodadas 2-3 (ida/volta)
  if (career.recopa && !career.recopa.champion && (round === 2 || round === 3)) {
    playRecopa(career, seed, divisionAvg);
  }
  
  // Janelas FIFA: aplica fadiga extra
  applyFifaFatigue(career);

  // Cumprimento de suspensões e recuperação de lesões acontece ao fim da semana,
  // para que um jogador punido nesta rodada fique fora da próxima partida.
  // Jogadores que receberam cartão vermelho/3º amarelo NESTA rodada não têm a suspensão decrementada agora.
  for (const club of clubs) for (const player of club.players) {
    player.injuredGames = Math.max(0, player.injuredGames - 1);
    if (!newlySuspended.has(player.id)) {
      player.suspendedGames = Math.max(0, player.suspendedGames - 1);
    }
  }
  repairPlan(career);
  refreshMarket(career);

  if (round >= totalRounds && !career.fixtures.some((f) => !f.played)) {
    career.seed = seed;
    endOfSeason(career);
    return { career, userMatch: career.lastRoundEvents };
  }

  career.round += 1;
  career.seed = seed;
  return { career, userMatch };
}

export function simulateNextMatch(career: Career): { career: Career; steps: { minute: number; events: MatchEvent[]; done: boolean; result?: MatchResult }[] } {
  const fixtures = career.fixtures.map((f) => ({ ...f, result: f.result ? structuredClone(f.result) : undefined }));
  const nextFixture = fixtures.find((f) => f.round === career.round && !f.played && (f.homeId === career.clubId || f.awayId === career.clubId));
  if (!nextFixture) throw httpError("Nenhum jogo agendado para esta rodada", 409);

  const clubs = career.clubs;
  const map = clubMap(clubs);
  const home = map.get(nextFixture.homeId)!;
  const away = map.get(nextFixture.awayId)!;
  const divisionAvg = leagueAverageStrength(clubs.filter((c) => c.division === career.division).flatMap((c) => c.players));
  const devRng = mulberry32(career.seed + career.round * 555);

  const isUserHome = home.id === career.clubId;

  const lineup = (club: Club): string[] => (club.id === career.clubId ? completeLineup(club.players, career.starterIds, career.formation) : defaultStarters(club.players, "4-3-3"));
  const homeStarters = lineup(home);
  const awayStarters = lineup(away);

  const steps: { minute: number; events: MatchEvent[]; done: boolean; result?: MatchResult }[] = [];
  for (const step of simulateMatchStepByStep(
    {
      club: home,
      starterIds: homeStarters,
      benchIds: isUserHome ? career.benchIds : undefined,
      captainId: isUserHome ? career.captainId : undefined,
      substitutions: isUserHome ? career.substitutions : undefined,
      tactic: isUserHome ? career.tactic : aiTactic(home, away),
      formation: isUserHome ? career.formation : "4-3-3",
    },
    {
      club: away,
      starterIds: awayStarters,
      benchIds: !isUserHome ? career.benchIds : undefined,
      captainId: !isUserHome ? career.captainId : undefined,
      substitutions: !isUserHome ? career.substitutions : undefined,
      tactic: !isUserHome ? career.tactic : aiTactic(away, home),
      formation: !isUserHome ? career.formation : "4-3-3",
    },
    career.seed + career.round * 7919,
  )) {
    steps.push(step);
    if (step.done && step.result) {
      const result = step.result;
      nextFixture.played = true;
      nextFixture.result = result;
      career.fixtures = fixtures;
      career.table = applyResult(career.table, home.id, away.id, result.homeGoals, result.awayGoals);
      applyPostMatch(career, home, { result, played: { [home.id]: new Set(homeStarters), [away.id]: new Set(awayStarters) } }, divisionAvg, devRng, { notify: home.id === career.clubId, recoverBench: true });
      applyPostMatch(career, away, { result, played: { [home.id]: new Set(homeStarters), [away.id]: new Set(awayStarters) } }, divisionAvg, devRng, { notify: away.id === career.clubId, recoverBench: true });
      career.lastRoundEvents = result;
      break;
    }
  }

  return { career, steps };
}

function playCupPhase(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  const phase = career.cup[career.cupRound];
  if (!phase) return;
  const map = clubMap(career.clubs);
  const finishCup = (winnerId: string | undefined): void => {
    career.cupChampion = winnerId;
    career.cupFinalPlayed = true;
    if (winnerId) newMessage(career, `cup-champ-${career.season}`, "cup", "Campeão da Copa!", `${map.get(winnerId)?.name} venceu a Copa Brasil TechFoot!`);
  };
  const devRng = mulberry32(seed + career.cupRound * 91);
  career.cup[career.cupRound] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    const match = simulateOne(career, home, away, seed + career.cupRound * 100 + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    let winnerId: string;
    let penalties: { home: number; away: number } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      const shootout = resolvePenaltiesFor(home, away, seed + index);
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `cup-${career.season}-${career.cupRound}-${index}`, "cup", `Copa · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Decisão nos pênaltis (${penalties.home} x ${penalties.away}). Avança: ${map.get(winnerId)?.name}` : `Avança: ${map.get(winnerId)?.name}`);
    }
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });

  const current = career.cup[career.cupRound];
  const winners = current.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  if (winners.length <= 1) {
    finishCup(winners[0]);
    return;
  }
  career.cup.push(nextCupRound(current, seed + career.season, career.cupRound + 1));
  career.cupRound += 1;
}

/** Pênaltis decididos pelos goleiros que estão em campo (o titular disponível). */
function resolvePenaltiesFor(home: Club, away: Club, seed: number): { home: number; away: number; winner: "home" | "away" } {
  const keeper = (club: Club): number => {
    const available = club.players.filter((p) => p.position === "GK" && p.injuredGames === 0 && p.suspendedGames === 0);
    const best = available.sort((a, b) => b.strength - a.strength)[0];
    return best ? best.strength : 5; // sem goleiro: improvisado
  };
  return resolvePenalties(keeper(home), keeper(away), seed);
}

/** Simula uma fase da Copa do Brasil */
function playCopaDoBrasilPhase(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  if (!career.copaDoBrasil || !career.copaDoBrasil.bracket) return;
  const bracket = career.copaDoBrasil.bracket;
  const currentRound = career.copaDoBrasil.phase === "first_stage" ? 0 : 
                       career.copaDoBrasil.phase === "round_of_64" ? 1 :
                       career.copaDoBrasil.phase === "round_of_32" ? 2 :
                       career.copaDoBrasil.phase === "round_of_16" ? 3 :
                       career.copaDoBrasil.phase === "quarterfinals" ? 4 :
                       career.copaDoBrasil.phase === "semifinals" ? 5 : 6;
  
  if (currentRound >= bracket.length) return;
  
  const phase = bracket[currentRound];
  if (!phase) return;
  
  const map = clubMap(career.clubs);
  const devRng = mulberry32(seed + currentRound * 101);
  
  career.copaDoBrasil.bracket[currentRound] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    
    const match = simulateOne(career, home, away, seed + currentRound * 100 + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    
    let winnerId: string;
    let penalties: { home: number; away: number } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      const shootout = resolvePenaltiesFor(home, away, seed + index);
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `cdb-${career.season}-${currentRound}-${index}`, "cup", `Copa do Brasil · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Pênaltis: ${penalties.home} x ${penalties.away}. Avança: ${map.get(winnerId)?.name}` : `Avança: ${map.get(winnerId)?.name}`);
    }
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });
  
  const current = career.copaDoBrasil.bracket[currentRound];
  const winners = current.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  
  if (winners.length <= 1) {
    career.copaDoBrasil.champion = winners[0];
    career.copaDoBrasil.phase = "final";
    if (winners[0]) {
      const prize = career.copaDoBrasil.prizes?.champion ?? 70_000_000;
      const winnerClub = map.get(winners[0])!;
      winnerClub.cash += prize;
      addLedger(career, { round: career.round, label: "Premiação Copa do Brasil (campeão)", amount: prize });
      newMessage(career, `cdb-champ-${career.season}`, "cup", "Campeão da Copa do Brasil!", `${winnerClub.name} venceu a Copa do Brasil! Prêmio: R$ ${(prize/1e6).toFixed(1)}M`);
    }
    return;
  }
  
  // Próxima fase
  const nextPhaseNames: CompetitionPhase[] = ["round_of_64", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"];
  career.copaDoBrasil.phase = nextPhaseNames[currentRound] ?? "final";
  career.copaDoBrasil.bracket.push(nextCupRound(current, seed + career.season, currentRound + 1));
}

/** Simula fase de grupos da Libertadores */
function playLibertadoresGroupStage(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  if (!career.libertadores || !career.libertadores.groups) return;
  if (career.libertadores.phase !== "group") return;
  
  const groups = career.libertadores.groups;
  const map = clubMap(career.clubs);
  const devRng = mulberry32(seed + 202);
  
  for (const group of groups) {
    for (const fixture of group.fixtures) {
      if (fixture.played) continue;
      const home = map.get(fixture.homeId);
      const away = map.get(fixture.awayId);
      if (!home || !away) continue;
      
      const match = simulateOne(career, home, away, seed + group.id.charCodeAt(0) * 1000 + fixture.round);
      const result = match.result;
      fixture.played = true;
      fixture.result = result;
      
      for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
      
      group.standings = applyGroupResult(group.standings, home.id, away.id, result.homeGoals, result.awayGoals);
      
      if (home.id === career.clubId || away.id === career.clubId) {
        career.lastRoundEvents = result;
        newMessage(career, `lib-${career.season}-${group.id}-${fixture.round}`, "cup", `Libertadores · ${group.name}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, "");
      }
    }
    group.standings = sortGroupTable(group.standings);
  }
  
  // Verifica se todos os grupos terminaram
  const allDone = groups.every(g => g.fixtures.every(f => f.played));
  if (allDone) {
    career.libertadores.phase = "round_of_16";
    // Gera mata-mata
    career.libertadores.bracket = knockoutFromGroups(groups, seed, "libertadores");
  }
}

/** Simula fase de grupos da Sul-Americana */
function playSulAmericanaGroupStage(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  if (!career.sulAmericana || !career.sulAmericana.groups) return;
  if (career.sulAmericana.phase !== "group") return;
  
  const groups = career.sulAmericana.groups;
  const map = clubMap(career.clubs);
  const devRng = mulberry32(seed + 303);
  
  for (const group of groups) {
    for (const fixture of group.fixtures) {
      if (fixture.played) continue;
      const home = map.get(fixture.homeId);
      const away = map.get(fixture.awayId);
      if (!home || !away) continue;
      
      const match = simulateOne(career, home, away, seed + group.id.charCodeAt(0) * 1000 + fixture.round);
      const result = match.result;
      fixture.played = true;
      fixture.result = result;
      
      for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
      
      group.standings = applyGroupResult(group.standings, home.id, away.id, result.homeGoals, result.awayGoals);
      
      if (home.id === career.clubId || away.id === career.clubId) {
        career.lastRoundEvents = result;
        newMessage(career, `sul-${career.season}-${group.id}-${fixture.round}`, "cup", `Sul-Americana · ${group.name}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, "");
      }
    }
    group.standings = sortGroupTable(group.standings);
  }
  
  const allDone = groups.every(g => g.fixtures.every(f => f.played));
  if (allDone) {
    career.sulAmericana.phase = "round_of_16";
    career.sulAmericana.bracket = knockoutFromGroups(groups, seed, "sul_americana");
  }
}

/** Simula mata-mata da Libertadores/Sul-Americana */
function playInternationalKnockout(career: Career, competition: Competition | undefined, seed: number, divisionAvg: Record<Division, number>, compName: string): void {
  if (!competition || !competition.bracket) return;
  if (competition.phase === "group") return;
  
  const bracket = competition.bracket;
  const currentRound = competition.phase === "round_of_16" ? 0 :
                       competition.phase === "quarterfinals" ? 1 :
                       competition.phase === "semifinals" ? 2 : 3;
  
  if (currentRound >= bracket.length) return;
  
  const phase = bracket[currentRound];
  if (!phase) return;
  
  const map = clubMap(career.clubs);
  const devRng = mulberry32(seed + 404);
  
  competition.bracket[currentRound] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    
    const match = simulateOne(career, home, away, seed + currentRound * 100 + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    
    let winnerId: string;
    let penalties: { home: number; away: number } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      const shootout = resolvePenaltiesFor(home, away, seed + index);
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `${compName.toLowerCase()}-${career.season}-${currentRound}-${index}`, "cup", `${compName} · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Pênaltis: ${penalties.home} x ${penalties.away}. Avança: ${map.get(winnerId)?.name}` : `Avança: ${map.get(winnerId)?.name}`);
    }
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });
  
  const current = competition.bracket[currentRound];
  const winners = current.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  
  if (winners.length <= 1) {
    competition.champion = winners[0];
    competition.phase = "final";
    if (winners[0]) {
      const prize = competition.prizes?.champion ?? 0;
      const winnerClub = map.get(winners[0])!;
      winnerClub.cash += prize;
      addLedger(career, { round: career.round, label: `Premiação ${compName} (campeão)`, amount: prize });
      newMessage(career, `${compName.toLowerCase()}-champ-${career.season}`, "cup", `Campeão da ${compName}!`, `${winnerClub.name} venceu a ${compName}! Prêmio: R$ ${(prize/1e6).toFixed(1)}M`);
    }
    return;
  }
  
  const nextPhases: CompetitionPhase[] = ["quarterfinals", "semifinals", "final"];
  competition.phase = nextPhases[currentRound] ?? "final";
  competition.bracket.push(advanceKnockout(current, seed + career.season, currentRound + 1));
}

/** Simula estadual */
function playEstadualPhase(career: Career, estadual: Competition, seed: number, divisionAvg: Record<Division, number>): void {
  if (!estadual.bracket) return;
  const bracket = estadual.bracket;
  const currentRound = estadual.phase === "first_stage" ? 0 :
                       estadual.phase === "quarterfinals" ? 1 :
                       estadual.phase === "semifinals" ? 2 : 3;
  
  if (currentRound >= bracket.length) return;
  
  const phase = bracket[currentRound];
  if (!phase) return;
  
  const map = clubMap(career.clubs);
  const devRng = mulberry32(seed + 505);
  
  estadual.bracket[currentRound] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    
    const match = simulateOne(career, home, away, seed + currentRound * 100 + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    
    let winnerId: string;
    let penalties: { home: number; away: number } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      const shootout = resolvePenaltiesFor(home, away, seed + index);
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `est-${estadual.id}-${career.season}-${currentRound}-${index}`, "cup", `${estadual.name} · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Pênaltis: ${penalties.home} x ${penalties.away}. Avança: ${map.get(winnerId)?.name}` : `Avança: ${map.get(winnerId)?.name}`);
    }
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });
  
  const current = estadual.bracket[currentRound];
  const winners = current.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  
  if (winners.length <= 1) {
    estadual.champion = winners[0];
    estadual.phase = "final";
    if (winners[0]) {
      const prize = estadual.prizes?.champion ?? 1_000_000;
      const winnerClub = map.get(winners[0])!;
      winnerClub.cash += prize;
      addLedger(career, { round: career.round, label: `Premiação ${estadual.name} (campeão)`, amount: prize });
      newMessage(career, `est-champ-${estadual.id}-${career.season}`, "cup", `Campeão do ${estadual.name}!`, `${winnerClub.name} venceu o ${estadual.name}!`);
    }
    return;
  }
  
  const nextPhases: CompetitionPhase[] = ["quarterfinals", "semifinals", "final"];
  estadual.phase = nextPhases[currentRound] ?? "final";
  estadual.bracket.push(nextCupRound(current, seed + career.season, currentRound + 1));
}

/** Simula Supercopa do Brasil */
function playSupercopa(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  if (!career.supercopa || !career.supercopa.bracket || career.supercopa.phase !== "final") return;
  if (career.supercopa.bracket[0]?.[0]?.played) return;
  
  const map = clubMap(career.clubs);
  const phase = career.supercopa.bracket[0];
  const devRng = mulberry32(seed + 606);
  
  career.supercopa.bracket[0] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    
    const match = simulateOne(career, home, away, seed + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    
    let winnerId: string;
    let penalties: { home: number; away: number } | undefined;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    } else {
      const shootout = resolvePenaltiesFor(home, away, seed + index);
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `supercopa-${career.season}-${index}`, "cup", `Supercopa do Brasil: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, penalties ? `Pênaltis: ${penalties.home} x ${penalties.away}. Campeão: ${map.get(winnerId)?.name}` : `Campeão: ${map.get(winnerId)?.name}`);
    }
    return { ...f, played: true, winnerId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties };
  });
  
  const current = career.supercopa.bracket[0];
  const winners = current.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  if (winners[0]) {
    career.supercopa.champion = winners[0];
    const prize = career.supercopa.prizes?.champion ?? 5_000_000;
    const winnerClub = map.get(winners[0])!;
    winnerClub.cash += prize;
    addLedger(career, { round: career.round, label: "Premiação Supercopa do Brasil (campeão)", amount: prize });
    newMessage(career, `supercopa-champ-${career.season}`, "cup", "Campeão da Supercopa do Brasil!", `${winnerClub.name} venceu a Supercopa do Brasil!`);
  }
}

/** Simula Recopa Sul-Americana */
function playRecopa(career: Career, seed: number, divisionAvg: Record<Division, number>): void {
  if (!career.recopa || !career.recopa.bracket || career.recopa.phase !== "final") return;
  if (career.recopa.bracket[0]?.[0]?.played && career.recopa.bracket[0]?.[1]?.played) return;
  
  const map = clubMap(career.clubs);
  const phase = career.recopa.bracket[0];
  const devRng = mulberry32(seed + 707);
  
  career.recopa.bracket[0] = phase.map((f, index) => {
    if (f.played) return f;
    const home = map.get(f.homeId);
    const away = map.get(f.awayId);
    if (!home || !away) return { ...f, played: true, winnerId: home?.id ?? away?.id, bye: true };
    
    const match = simulateOne(career, home, away, seed + index);
    const result = match.result;
    for (const club of [home, away]) applyPostMatch(career, club, match, divisionAvg[divisionOf(career, club)], devRng, { notify: club.id === career.clubId, recoverBench: false });
    
    const involvesUser = home.id === career.clubId || away.id === career.clubId;
    if (involvesUser) {
      career.lastRoundEvents = result;
      newMessage(career, `recopa-${career.season}-${index}`, "cup", `Recopa · ${f.slot}: ${home.name} ${result.homeGoals} x ${result.awayGoals} ${away.name}`, "");
    }
    return { ...f, played: true, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
  });
  
  // Verifica se ambos os jogos terminaram para decidir campeão
  const bothPlayed = career.recopa.bracket[0].every(f => f.played);
  if (bothPlayed) {
    const game1 = career.recopa.bracket[0][0];
    const game2 = career.recopa.bracket[0][1];
    const aggHome = (game1.homeGoals ?? 0) + (game2.awayGoals ?? 0);
    const aggAway = (game1.awayGoals ?? 0) + (game2.homeGoals ?? 0);
    let winnerId: string;
    if (aggHome !== aggAway) {
      winnerId = aggHome > aggAway ? game1.homeId : game1.awayId;
    } else {
      // Pênaltis
      const home = map.get(game1.homeId)!;
      const away = map.get(game1.awayId)!;
      const shootout = resolvePenaltiesFor(home, away, seed + 999);
      winnerId = shootout.winner === "home" ? home.id : away.id;
    }
    career.recopa.champion = winnerId;
    const prize = career.recopa.prizes?.champion ?? 3_000_000;
    const winnerClub = map.get(winnerId)!;
    winnerClub.cash += prize;
    addLedger(career, { round: career.round, label: "Premiação Recopa Sul-Americana (campeão)", amount: prize });
    newMessage(career, `recopa-champ-${career.season}`, "cup", "Campeão da Recopa Sul-Americana!", `${winnerClub.name} venceu a Recopa Sul-Americana!`);
  }
}

/** Verifica se é janela FIFA (pula rodada para clubes com muitos convocados) */
function isFifaWindow(career: Career): boolean {
  if (!career.calendar?.fifaWindows) return false;
  return career.calendar.fifaWindows.some(w => career.round >= w.startRound && career.round <= w.endRound);
}

/** Aplica fadiga extra por jogos de seleção */
function applyFifaFatigue(career: Career): void {
  if (!isFifaWindow(career)) return;
  // Simula convocação: jogadores de maior força têm chance de serem chamados
  for (const club of career.clubs) {
    for (const p of club.players) {
      if (p.strength > 70 && Math.random() < 0.3) {
        p.fitness = Math.max(40, p.fitness - 15);
        p.recentLoad = (p.recentLoad ?? 0) + 1;
      }
    }
  }
}

/** Classificação sintética das divisões que não são simuladas partida a partida. */
function syntheticTable(clubs: Club[], division: Division, rng: () => number): Standing[] {
  const played = division === 3 ? 19 : 38;
  const rows = clubs.filter((c) => c.division === division).map((club) => {
    const quality = leagueAverageStrength(club.players) * 2 + club.rep / 2 + club.morale / 4 + rng() * 25;
    return { clubId: club.id, quality };
  });
  rows.sort((a, b) => b.quality - a.quality);
  return rows.map((row, index) => {
    const ppg = clamp(2.2 - (index / Math.max(1, rows.length - 1)) * 1.4 + (rng() - 0.5) * 0.2, 0.6, 2.4);
    const points = Math.round(played * ppg);
    const won = Math.floor(points / 3);
    const drawn = points - won * 3;
    const lost = Math.max(0, played - won - drawn);
    const gf = Math.round(won * 1.9 + drawn * 1 + lost * 0.5);
    const ga = Math.round(won * 0.6 + drawn * 1 + lost * 1.9);
    return { clubId: row.clubId, played, won, drawn, lost, gf, ga, points };
  });
}

function makeYouth(club: Club, division: Division, youthBudget: number, rng: () => number, position: Position, season: number, index: number): Player {
  const strength = youthStrength(DIVISION_ECONOMY[division].youthBase, youthBudget, rng);
  const name = `${YOUTH_NAMES[Math.floor(rng() * YOUTH_NAMES.length)]} ${YOUTH_SURNAMES[Math.floor(rng() * YOUTH_SURNAMES.length)]}`;
  const skill = (bonus: number) => clamp(Math.round(strength * 2 + bonus + rng() * 10), 20, 100);
  const secondary: Position = position === "GK" ? "GK" : position === "DF" ? "MF" : position === "FW" ? "MF" : "DF";
  return {
    id: `${club.id}-y${season}-${index}`,
    name,
    nationality: club.country,
    position,
    preferredPositions: position === "GK" ? ["GK"] : [position, secondary],
    age: 17 + Math.floor(rng() * 3),
    xp: 0,
    skills: {
      pace: skill(8),
      finishing: skill(position === "FW" ? 14 : 0),
      passing: skill(position === "MF" ? 14 : 4),
      marking: skill(position === "DF" ? 14 : 0),
      tackling: skill(position === "DF" ? 12 : 0),
      handling: skill(position === "GK" ? 20 : -10),
      stamina: skill(10),
      leadership: skill(-5),
    },
    fitness: 95,
    morale: 75,
    strength,
    salary: Math.round(marketSalary(strength, division) * 0.6),
    contractGames: 76,
    behavior: 1 + Math.floor(rng() * 4),
    injuredGames: 0,
    yellows: 0,
    reds: 0,
    goals: 0,
    matches: 0,
    suspendedGames: 0,
  };
}

/** Posição mais carente do elenco em relação a um plantel padrão (2 GK, 5 DF, 5 MF, 4 FW). */
function neededPosition(club: Club, rng: () => number): Position {
  const ideal: Record<Position, number> = { GK: 2, DF: 5, MF: 5, FW: 4 };
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const p of club.players) counts[p.position] += 1;
  const deficits = (Object.keys(ideal) as Position[]).map((pos) => ({ pos, deficit: ideal[pos] - counts[pos] })).sort((a, b) => b.deficit - a.deficit);
  if (deficits[0].deficit > 0) return deficits[0].pos;
  const outfield: Position[] = ["DF", "MF", "FW"];
  return outfield[Math.floor(rng() * outfield.length)];
}

function endOfSeason(career: Career): void {
  const myClub = myClubOf(career);
  const all = career.clubs;
  const byId = clubMap(all);
  const finalTable = sortTable(career.table);
  const pos = finalTable.findIndex((r) => r.clubId === career.clubId) + 1;
  const prize = prizeFor(pos, career.division);
  if (prize > 0) {
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: `Premiação (${pos}º lugar na ${divisionLabel(career.division)})`, amount: prize });
  }
  const cupPrize = career.cupChampion === career.clubId ? DIVISION_ECONOMY[1].winPrize * 25 : 0;
  if (cupPrize > 0) {
    myClub.cash += cupPrize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação da Copa", amount: cupPrize });
  }
  
  // Premiações das novas competições
  if (career.copaDoBrasil?.champion === career.clubId) {
    const prize = career.copaDoBrasil.prizes?.champion ?? 70_000_000;
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação Copa do Brasil (campeão)", amount: prize });
  }
  if (career.libertadores?.champion === career.clubId) {
    const prize = career.libertadores.prizes?.champion ?? 120_000_000;
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação Libertadores (campeão)", amount: prize });
  }
  if (career.sulAmericana?.champion === career.clubId) {
    const prize = career.sulAmericana.prizes?.champion ?? 30_000_000;
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação Sul-Americana (campeão)", amount: prize });
  }
  if (career.supercopa?.champion === career.clubId) {
    const prize = career.supercopa.prizes?.champion ?? 5_000_000;
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação Supercopa (campeão)", amount: prize });
  }
  if (career.recopa?.champion === career.clubId) {
    const prize = career.recopa.prizes?.champion ?? 3_000_000;
    myClub.cash += prize;
    career.finances = myClub.cash;
    addLedger(career, { label: "Premiação Recopa (campeão)", amount: prize });
  }
  if (career.estaduais) {
    for (const estadual of career.estaduais) {
      if (estadual.champion === career.clubId) {
        const prize = estadual.prizes?.champion ?? 1_000_000;
        myClub.cash += prize;
        career.finances = myClub.cash;
        addLedger(career, { label: `Premiação ${estadual.name} (campeão)`, amount: prize });
      }
    }
  }
  
  newMessage(career, `season-${career.season}`, "season", `Temporada ${career.season} encerrada`, `${myClub.name} terminou em ${pos}º lugar na ${divisionLabel(career.division)}. Prêmio: ${money(prize)}.${career.cupChampion ? ` Copa: ${byId.get(career.cupChampion)?.name} campeão.` : ""}${career.copaDoBrasil?.champion ? ` Copa do Brasil: ${byId.get(career.copaDoBrasil.champion)?.name} campeão.` : ""}${career.libertadores?.champion ? ` Libertadores: ${byId.get(career.libertadores.champion)?.name} campeão.` : ""}`);

  // Reputação: aproxima-se de um alvo dado pela divisão e pela colocação
  const rng = mulberry32(career.seed + 4242 + career.season);
  const userDiv = career.division;
  const tables: Record<Division, Standing[]> = {
    1: userDiv === 1 ? finalTable : syntheticTable(all, 1, rng),
    2: userDiv === 2 ? finalTable : syntheticTable(all, 2, rng),
    3: userDiv === 3 ? finalTable : syntheticTable(all, 3, rng),
  };
  const repBase: Record<Division, number> = { 1: 62, 2: 42, 3: 28 };
  for (const div of [1, 2, 3] as Division[]) {
    const rows = tables[div];
    rows.forEach((row, index) => {
      const club = byId.get(row.clubId);
      if (!club) return;
      const target = repBase[div] + (rows.length - 1 - index) * 1.2 + (career.cupChampion === club.id ? 5 : 0) + (career.copaDoBrasil?.champion === club.id ? 8 : 0) + (career.libertadores?.champion === club.id ? 15 : 0) + (career.sulAmericana?.champion === club.id ? 5 : 0);
      club.rep = Math.round(clamp(club.rep + (target - club.rep) * 0.4, 10, 95));
    });
  }

  // Acesso e rebaixamento (4 sobem / 4 caem)
  const relegateA = tables[1].slice(-4).map((r) => r.clubId);
  const promoteA = tables[2].slice(0, 4).map((r) => r.clubId);
  const relegateB = tables[2].slice(-4).map((r) => r.clubId);
  const promoteB = tables[3].slice(0, 4).map((r) => r.clubId);
  const move = (ids: string[], division: Division): void => {
    for (const id of ids) {
      const c = byId.get(id);
      if (c) c.division = division;
    }
  };
  const before = new Map(all.map((c) => [c.id, c.division]));
  move(relegateA, 2);
  move(promoteA, 1);
  move(relegateB, 3);
  move(promoteB, 2);
  // Cláusula de divisão: salários acompanham a nova realidade do clube (redutor na queda, reajuste na subida)
  for (const c of all) {
    if (before.get(c.id) === c.division) continue;
    for (const p of c.players) p.salary = marketSalary(p.strength, c.division);
  }
  const names = (ids: string[]): string => ids.map((id) => byId.get(id)?.name).join(", ");
  newMessage(career, `mv-${career.season}`, "season", "Acesso e rebaixamento", `Sobem: ${names(promoteA)} para a Série A; ${names(promoteB)} para a Série B. Caem: ${names(relegateA)} para a Série B; ${names(relegateB)} para a Série C.`);

  // Envelhecimento, aposentadorias e base
  const retiredMine: string[] = [];
  const youthMine: Player[] = [];
  for (const c of all) {
    const division = c.id === career.clubId ? myClub.division : c.division;
    const retired: Player[] = [];
    for (const p of c.players) {
      const aging = agePlayer(p, rng);
      if (aging.retired) retired.push(p);
    }
    c.players = c.players.filter((p) => !retired.includes(p));
    if (c.id === career.clubId) retiredMine.push(...retired.map((p) => p.name));
    const youthBudget = c.id === career.clubId ? career.admin.youthBudget : division === 1 ? 150_000 : division === 2 ? 60_000 : 25_000;
    let prospects = c.id === career.clubId
      ? retired.length + 1 + (rng() < career.admin.youthBudget / 1_500_000 ? 1 : 0)
      : Math.max(retired.length, 16 - c.players.length);
    for (let i = 0; i < prospects && c.players.length < SQUAD_MAX; i++) {
      const youth = makeYouth(c, division, youthBudget, rng, neededPosition(c, rng), career.season, i);
      c.players.push(youth);
      if (c.id === career.clubId) youthMine.push(youth);
    }
    for (const p of c.players) {
      p.injuredGames = 0;
      p.suspendedGames = 0;
      p.yellows = 0;
      p.reds = 0;
      p.goals = 0;
      p.fitness = Math.min(100, p.fitness + 15);
      p.morale = Math.round(clamp(p.morale + (70 - p.morale) * 0.5, 0, 100));
    }
    c.morale = 65;
    c.tactic = c.id === career.clubId ? career.tactic : "balanced";
  }
  if (retiredMine.length) newMessage(career, `ret-${career.season}`, "contract", "Aposentadorias", `${retiredMine.join(", ")} encerraram a carreira.`);
  if (youthMine.length) newMessage(career, `youth-${career.season}`, "evo", "Promovidos da base", `${youthMine.map((p) => `${p.name} (${p.position}, ${p.strength})`).join(", ")} sobem ao profissional.`);

  // Staff envelhecimento e renovações (apenas clube do usuário)
  const myClubStaff = myClub.staff ?? [];
  const staffRetired: Staff[] = [];
  for (const s of myClubStaff) {
    const aging = ageStaff(s, rng);
    if (aging.retired) {
      staffRetired.push(s);
    }
  }
  if (staffRetired.length > 0) {
    for (const s of staffRetired) {
      career.staffHistory.push({ season: career.season, role: s.role, name: s.name, action: "resigned" });
      newMessage(career, `staff-ret-${s.id}-${career.season}`, "contract", `${s.name} se aposentou`, `O ${s.role.replace("_", " ")} ${s.name} (${s.age} anos) encerrou a carreira.`);
    }
    myClub.staff = (myClub.staff ?? []).filter(s => !staffRetired.includes(s));
  }
  
  // Renova contratos de staff que estão acabando
  for (const s of (myClub.staff ?? [])) {
    s.contractGames -= 38; // uma temporada
    if (s.contractGames <= 0) {
      // Renova automaticamente com pequeno aumento
      s.contractGames = 76;
      s.salary = Math.round(s.salary * 1.05);
      career.staffHistory.push({ season: career.season, role: s.role, name: s.name, action: "hired" });
      newMessage(career, `staff-ren-${s.id}-${career.season}`, "contract", `${s.name} renovou`, `Contrato renovado por 2 temporadas. Novo salário: R$ ${(s.salary/1000).toFixed(0)}k/rodada.`);
    }
  }
  
  // Desenvolvimento da base e promoções
  const promotedFromYouth: string[] = [];
  for (const youthTeam of career.youthTeams) {
    for (const youth of youthTeam.players) {
      developYouthPlayer(youth, career.staff, rng);
    }
    
    // Avalia promoções
    const toPromote = youthTeam.players.filter(y => evaluateYouthPlayer(y, career.staff) === "promote");
    const toRelease = youthTeam.players.filter(y => evaluateYouthPlayer(y, career.staff) === "release");
    
    for (const youth of toPromote) {
      const { player, message } = promoteYouthPlayer(youth, myClub, rng);
      myClub.players.push(player);
      promotedFromYouth.push(message);
      career.staffHistory.push({ season: career.season, role: "youth_promotion", name: youth.name, action: "hired" });
    }
    
    // Remove dispensados
    youthTeam.players = youthTeam.players.filter(y => !toRelease.includes(y) && !toPromote.includes(y));
    
    if (toRelease.length > 0) {
      newMessage(career, `youth-rel-${career.season}-${youthTeam.category}`, "contract", `Dispensas na base ${youthTeam.category.toUpperCase()}`, `${toRelease.map(y => y.name).join(", ")} foram dispensados.`);
    }
  }
  
  // Reabastece categorias de base
  for (const youthTeam of career.youthTeams) {
    const needed = (youthTeam.category === "u20" ? 18 : 16) - youthTeam.players.length;
    if (needed > 0) {
      const newYouth = generateYouthPlayers(myClub, youthTeam.category, needed, rng);
      youthTeam.players.push(...newYouth);
    }
  }
  
  if (promotedFromYouth.length > 0) {
    newMessage(career, `youth-prom-${career.season}`, "evo", "Promovidos da base", promotedFromYouth.join(" | "));
  }

  // nova temporada
  career.season += 1;
  career.round = 1;
  career.division = myClub.division;
  const divIds = all.filter((c) => c.division === career.division).map((c) => c.id);
  career.fixtures = fixturesForDivision(divIds, career.division);
  career.table = emptyStandings(divIds);
  career.cup = buildCup(all, career.seed + career.season);
  career.cupRound = 0;
  career.cupChampion = undefined;
  career.cupFinalPlayed = false;
  
  // Recria competições para nova temporada
  const newSeason = career.season;
  const newSeed = career.seed + career.season;
  
  // Copa do Brasil
  career.copaDoBrasil = copaDoBrasilBracket(all, newSeed);
  
  // Libertadores: top 6 da Série A + campeão Copa do Brasil
  const serieAClubs = all.filter(c => c.division === 1);
  const libertadoresQualified = [...serieAClubs.slice(0, 6)];
  const cdbChampionId = career.copaDoBrasil?.champion;
  if (cdbChampionId) {
    const cdbChamp = all.find(c => c.id === cdbChampionId);
    if (cdbChamp && !libertadoresQualified.includes(cdbChamp)) {
      libertadoresQualified.push(cdbChamp);
    }
  }
  career.libertadores = libertadoresBracket(libertadoresQualified, newSeed);
  
  // Sul-Americana: 7º a 12º da Série A
  const sulAmericanaQualified = serieAClubs.slice(6, 12);
  career.sulAmericana = sulAmericanaBracket(sulAmericanaQualified, newSeed);
  
  // Supercopa: campeão Brasileiro x campeão Copa do Brasil
  const brasileiraoChampion = tables[1][0]?.clubId;
  const copaDoBrasilChampion = career.copaDoBrasil?.champion;
  if (brasileiraoChampion && copaDoBrasilChampion) {
    career.supercopa = supercopaBracket(brasileiraoChampion, copaDoBrasilChampion, newSeed);
  }
  
  // Recopa: campeão Libertadores x campeão Sul-Americana
  const libertadoresChampion = career.libertadores?.champion;
  const sulAmericanaChampion = career.sulAmericana?.champion;
  if (libertadoresChampion && sulAmericanaChampion) {
    career.recopa = recopaBracket(libertadoresChampion, sulAmericanaChampion, newSeed);
  }
  
  // Estaduais
  career.estaduais = [];
  const clubsByState = new Map<string, Club[]>();
  for (const c of all) {
    const state = c.state || "BR";
    if (!clubsByState.has(state)) clubsByState.set(state, []);
    clubsByState.get(state)!.push(c);
  }
  for (const [state, stateClubs] of clubsByState) {
    const format = ESTADUAIS_FORMATS.find(f => f.state === state);
    if (format && stateClubs.length >= 4) {
      const estadualTeams = stateClubs.map(c => c.id);
      const bracket = estadualBracket(estadualTeams, format, newSeed + state.charCodeAt(0));
      career.estaduais.push({
        id: `estadual-${state.toLowerCase()}`,
        name: format.name,
        type: "estadual",
        season: newSeason,
        phase: "first_stage",
        bracket,
        prizes: { "champion": 1_000_000, "runner_up": 500_000 },
      });
    }
  }
  
  // Calendário
  const calendar = generateSeasonCalendar(newSeason, newSeed);
  career.calendar = {
    currentRound: 1,
    fifaWindows: calendar.fifaWindows,
  };
  
  career.admin.broadcastTier = Math.min(career.admin.broadcastTier, maxBroadcastTier(career.division));
  repairPlan(career);
  refreshMarket(career);
  newMessage(career, `new-${career.season}`, "season", `Temporada ${career.season} começou`, `Novo calendário da ${divisionLabel(career.division)} gerado. Boa sorte!`);
}

export function setTactic(career: Career, tactic: Tactic): Career {
  const myClub = myClubOf(career);
  myClub.tactic = tactic;
  career.tactic = tactic;
  return career;
}

export function setMatchPlan(career: Career, plan: MatchPlan): Career {
  const club = myClubOf(career);
  if (new Set(plan.starterIds).size !== 11) throw httpError("A escalação precisa de 11 jogadores diferentes", 400);
  const playerMap = new Map(club.players.map((player) => [player.id, player]));
  const starters = plan.starterIds.map((id) => playerMap.get(id));
  if (starters.some((player) => !player)) throw httpError("A escalação contém jogador inválido", 400);
  if (starters.some((player) => player!.injuredGames > 0 || player!.suspendedGames > 0)) throw httpError("Não é possível escalar jogador indisponível", 400);
  if (starters.filter((player) => player!.position === "GK").length !== 1) throw httpError("A escalação precisa de exatamente um goleiro", 400);
  const benchIds = [...new Set(plan.benchIds ?? defaultBench(club.players, plan.starterIds))];
  if (benchIds.length > 5 || benchIds.some((id) => !playerMap.has(id)) || benchIds.some((id) => plan.starterIds.includes(id))) throw httpError("Banco de reservas inválido", 400);
  const captainId = plan.captainId ?? plan.starterIds[0];
  if (!plan.starterIds.includes(captainId)) throw httpError("O capitão precisa ser titular", 400);
  const substitutions = plan.substitutions ?? [];
  if (substitutions.length > 5) throw httpError("São permitidas no máximo 5 substituições", 400);
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

export function stadiumUpgradeCost(club: Club, fromLevel: number, toLevel: number): number {
  let cost = 0;
  for (let level = fromLevel + 1; level <= toLevel; level++) cost += club.stadiumCapacity * STADIUM_COST_PER_SEAT * level;
  return Math.round(cost);
}

export function updateAdmin(career: Career, patch: AdminPatch): Career {
  const myClub = myClubOf(career);
  const next = { ...career.admin, ...patch };
  next.ticketPrice = clamp(Math.round(next.ticketPrice), 10, 300);
  next.membershipFee = clamp(Math.round(next.membershipFee), 10, 1_000);
  next.merchandisePrice = clamp(Math.round(next.merchandisePrice), 30, 500);
  next.stadiumLevel = clamp(Math.round(next.stadiumLevel), 1, 5);
  next.maintenanceBudget = clamp(Math.round(next.maintenanceBudget), 0, 1_000_000);
  next.youthBudget = clamp(Math.round(next.youthBudget), 0, 2_000_000);
  next.scoutingBudget = clamp(Math.round(next.scoutingBudget), 0, 2_000_000);
  const sponsorCap = maxSponsorTier(myClub.rep);
  const requestedSponsor = clamp(Math.round(next.sponsorTier), 1, 5);
  next.sponsorTier = Math.min(requestedSponsor, sponsorCap);
  if (requestedSponsor > sponsorCap) {
    newMessage(career, `spons-${career.season}-${career.round}`, "finance", "Patrocínio limitado pela reputação", `Com reputação ${myClub.rep}, o clube só fecha patrocínio até o nível ${sponsorCap}. Suba na tabela para atrair marcas maiores.`);
  }
  const broadcastCap = maxBroadcastTier(career.division);
  const requestedBroadcast = clamp(Math.round(next.broadcastTier), 1, 3);
  next.broadcastTier = Math.min(requestedBroadcast, broadcastCap);
  if (requestedBroadcast > broadcastCap) {
    newMessage(career, `tv-${career.season}-${career.round}`, "finance", "Pacote de TV limitado pela divisão", `A ${divisionLabel(career.division)} negocia transmissão até o nível ${broadcastCap}.`);
  }
  if (next.stadiumLevel < career.admin.stadiumLevel) next.stadiumLevel = career.admin.stadiumLevel; // não se desfaz uma obra
  const levelDelta = next.stadiumLevel - career.admin.stadiumLevel;
  if (levelDelta > 0) {
    const cost = stadiumUpgradeCost(myClub, career.admin.stadiumLevel, next.stadiumLevel);
    if (myClub.cash < cost) throw httpError(`Caixa insuficiente para ampliar o estádio (custo ${money(cost)})`, 400);
    myClub.cash -= cost;
    career.finances = myClub.cash;
    addLedger(career, { label: `Ampliação do estádio · nível ${next.stadiumLevel}`, amount: -cost });
  }
  career.admin = next;
  return career;
}

export function takeLoan(career: Career, amount: number): Career {
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value < 100_000 || value > 10_000_000) throw httpError("Empréstimo deve estar entre R$ 100 mil e R$ 10 milhões", 400);
  if (career.admin.debt + value > MAX_DEBT) throw httpError(`Limite de crédito do clube é ${money(MAX_DEBT)} em dívida total`, 400);
  const myClub = myClubOf(career);
  myClub.cash += value;
  career.admin.debt += value;
  career.finances = myClub.cash;
  addLedger(career, { label: "Empréstimo bancário", amount: value });
  newMessage(career, `loan-${career.season}-${career.round}-${career.admin.debt}`, "finance", "Crédito aprovado", `${money(value)} adicionados ao caixa. Juros de ${Math.round(LOAN_INTEREST_RATE * 100)}% e amortização de ${(LOAN_AMORTIZATION_RATE * 100).toFixed(1)}% da dívida por rodada.`);
  return career;
}

export function renewContract(career: Career, playerId: string, games = NEW_CONTRACT_GAMES): { career: Career; cost: number } {
  const myClub = myClubOf(career);
  const p = myClub.players.find((x) => x.id === playerId);
  if (!p) throw httpError("Jogador não está no seu elenco", 404);
  const newSalary = Math.max(p.salary, marketSalary(p.strength, career.division));
  const cost = renewalCost(newSalary, games);
  if (myClub.cash < cost) throw httpError(`Caixa insuficiente para renovar (luvas de ${money(cost)})`, 400);
  myClub.cash -= cost;
  p.contractGames = games;
  p.salary = newSalary;
  p.morale = Math.min(100, p.morale + 10);
  career.finances = myClub.cash;
  addLedger(career, { label: `Renovação de ${p.name}`, amount: -cost });
  newMessage(career, `ren-${playerId}-${career.season}-${career.round}`, "contract", "Contrato renovado", `${p.name} renovou por ${games} jogos com salário de R$ ${newSalary.toLocaleString("pt-BR")} por rodada.`);
  refreshMarket(career);
  return { career, cost };
}

export function sellPlayer(career: Career, playerId: string): Career {
  const myClub = myClubOf(career);
  const idx = myClub.players.findIndex((x) => x.id === playerId);
  if (idx < 0) throw httpError("Jogador não está no seu elenco", 404);
  if (myClub.players.length <= SQUAD_MIN) throw httpError(`O elenco precisa manter pelo menos ${SQUAD_MIN} jogadores`, 400);
  if (career.starterIds.includes(playerId)) throw httpError("Retire o jogador da escalação antes de vender", 400);
  const p = myClub.players[idx];
  const value = sellPrice(p);
  const rng = mulberry32(career.seed + p.id.length * 31 + career.round);
  const buyers = career.clubs.filter((c) => c.id !== career.clubId && c.players.length < SQUAD_MAX);
  const buyer = buyers.length ? buyers[Math.floor(rng() * buyers.length)] : undefined;
  myClub.players.splice(idx, 1);
  if (buyer) {
    p.contractGames = NEW_CONTRACT_GAMES;
    p.salary = marketSalary(p.strength, buyer.division);
    buyer.players.push(p);
  } else {
    career.freeAgents.push(p);
  }
  myClub.cash += value;
  career.finances = myClub.cash;
  addLedger(career, { label: `Venda de ${p.name}`, amount: value });
  newMessage(career, `sel-${playerId}-${career.season}-${career.round}`, "market", "Venda concluída", `${p.name} foi vendido por ${money(value)} para ${buyer ? buyer.name : "o mercado livre"}.`);
  repairPlan(career);
  refreshMarket(career);
  return career;
}

export function buyPlayer(career: Career, playerId: string): Career {
  const myClub = myClubOf(career);
  if (myClub.players.some((p) => p.id === playerId)) throw httpError("Esse jogador já está no seu elenco", 400);
  const owner = career.clubs.find((c) => c.players.some((p) => p.id === playerId));
  const freeAgent = career.freeAgents.find((p) => p.id === playerId);
  if (!owner && !freeAgent) throw httpError("Jogador não encontrado", 404);
  if (myClub.players.length >= SQUAD_MAX) throw httpError(`Elenco cheio (máx. ${SQUAD_MAX})`, 400);
  if (owner && owner.players.length <= 11) throw httpError(`${owner.name} não libera o jogador: elenco no limite`, 400);
  const p = owner?.players.find((x) => x.id === playerId) ?? freeAgent!;
  const marketEntry = career.market.find((m) => m.playerId === playerId);
  const price = marketEntry?.price ?? (owner ? aiTransferPrice(p, career.admin.scoutingBudget) : freeAgentFee(p));
  if (myClub.cash < price) throw httpError(`Caixa insuficiente (preço ${money(price)})`, 400);
  if (owner) owner.players.splice(owner.players.findIndex((x) => x.id === playerId), 1);
  else career.freeAgents.splice(career.freeAgents.findIndex((x) => x.id === playerId), 1);
  myClub.cash -= price;
  p.contractGames = NEW_CONTRACT_GAMES;
  p.salary = marketSalary(p.strength, career.division);
  p.morale = Math.min(100, p.morale + 5);
  myClub.players.push(p);
  career.finances = myClub.cash;
  addLedger(career, { label: `Compra de ${p.name}`, amount: -price });
  newMessage(career, `buy-${playerId}-${career.season}-${career.round}`, "market", "Contratação!", `${p.name} chegou ao ${myClub.name} por ${money(price)}. Salário: R$ ${p.salary.toLocaleString("pt-BR")} por rodada.`);
  repairPlan(career);
  refreshMarket(career);
  return career;
}
