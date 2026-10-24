import type { 
  Club, 
  Competition, 
  CompetitionGroup, 
  CupFixture, 
  FifaWindow, 
  Fixture, 
  GroupFixture, 
  GroupStanding, 
  SeasonCalendar, 
  Standing 
} from "./types.ts";
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

export function emptyGroupStandings(clubIds: string[]): GroupStanding[] {
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

export function applyGroupResult(table: GroupStanding[], homeId: string, awayId: string, hg: number, ag: number): GroupStanding[] {
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

/** Critérios de desempate do futebol brasileiro: pontos, vitórias, saldo, gols pró. */
export function sortTable(table: Standing[]): Standing[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.won !== a.won) return b.won - a.won;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.clubId.localeCompare(b.clubId);
  });
}

export function sortGroupTable(table: GroupStanding[]): GroupStanding[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.won !== a.won) return b.won - a.won;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.clubId.localeCompare(b.clubId);
  });
}

/** Método do círculo: n-1 rodadas com todos os pares exatamente uma vez. */
function singleRoundRobin(teamIds: string[]): { round: number; pairs: [string, string][] }[] {
  const arr = [...teamIds];
  const n = arr.length;
  const half = n / 2;
  const out: { round: number; pairs: [string, string][] }[] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push([a, b]);
    }
    out.push({ round: r + 1, pairs });
    const last = arr.pop() as string;
    arr.splice(1, 0, last);
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
      fixtures.push({ round, homeId: swap ? a : b, awayId: swap ? b : a, played: false });
    }
  }
  for (const { round, pairs } of firstLeg) {
    for (const [a, b] of pairs) {
      const swap = round % 2 === 0;
      fixtures.push({ round: maxRound + round, homeId: swap ? a : b, awayId: swap ? b : a, played: false });
    }
  }
  return fixtures;
}

/** Gera partidas de grupo (ida e volta) */
export function groupFixtures(groupIds: string[]): GroupFixture[] {
  const fixtures: GroupFixture[] = [];
  const ids = [...groupIds];
  // Ida
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      fixtures.push({ round: fixtures.length + 1, homeId: ids[i], awayId: ids[j], played: false, groupId: "" });
      fixtures.push({ round: fixtures.length + 1, homeId: ids[j], awayId: ids[i], played: false, groupId: "" });
    }
  }
  return fixtures;
}

/** Rótulo da fase a partir do número de clubes que a disputam. */
export function cupSlotLabel(teamCount: number, phaseIndex: number): string {
  if (teamCount <= 2) return "Final";
  if (teamCount <= 4) return "Semifinal";
  if (teamCount <= 8) return "Quartas de final";
  if (teamCount <= 16) return "Oitavas de final";
  if (teamCount <= 32) return "16avos de final";
  if (teamCount <= 64) return "32avos de final";
  return `${phaseIndex + 1}ª fase`;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function byeFixture(slot: string, id: string): CupFixture {
  return { slot, homeId: id, awayId: id, played: true, winnerId: id, bye: true, homeGoals: 0, awayGoals: 0 };
}

/**
 * Primeira fase da copa. Quando o número de clubes não é potência de 2, os primeiros
 * de `byePriority` (ex.: maiores reputações) avançam direto, como na Copa do Brasil.
 */
export function cupBracket(teamIds: string[], seed = 0, byePriority: string[] = []): CupFixture[][] {
  const rng = mulberry32(seed + 991);
  const slots = nextPowerOfTwo(teamIds.length);
  const byeCount = slots - teamIds.length;
  const priority = [...byePriority.filter((id) => teamIds.includes(id)), ...teamIds];
  const byes: string[] = [];
  for (const id of priority) {
    if (byes.length >= byeCount) break;
    if (!byes.includes(id)) byes.push(id);
  }
  const playing = shuffle(teamIds.filter((id) => !byes.includes(id)), rng);
  const slot = cupSlotLabel(teamIds.length, 0);
  const round: CupFixture[] = [];
  for (let i = 0; i + 1 < playing.length; i += 2) round.push({ slot, homeId: playing[i], awayId: playing[i + 1], played: false });
  for (const id of byes) round.push(byeFixture(slot, id));
  return [round];
}

/** Monta a fase seguinte a partir dos vencedores (sorteio puro). */
export function nextCupRound(previous: CupFixture[], seed: number, phaseIndex: number): CupFixture[] {
  const winners = previous.map((f) => f.winnerId).filter((id): id is string => Boolean(id));
  const rng = mulberry32(seed + 7331 + phaseIndex);
  const shuffled = shuffle(winners, rng);
  const slot = cupSlotLabel(shuffled.length, phaseIndex);
  const round: CupFixture[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) round.push({ slot, homeId: shuffled[i], awayId: shuffled[i + 1], played: false });
  if (shuffled.length % 2 === 1) round.push(byeFixture(slot, shuffled[shuffled.length - 1]));
  return round;
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

/** Copa do Brasil real: 92 times, potes por ranking CBF, ida/volta a partir de oitavas */
export function copaDoBrasilBracket(
  allClubs: Club[], 
  seed: number,
  _qualifiedFromState: string[] = []
): Competition {
  // 92 times: 80 de estaduais + 12 de ranking CBF (Libertadores/Série A)
  // Potes baseados em ranking CBF (rep)
  const sorted = [...allClubs].sort((a, b) => b.rep - a.rep);
  const pots: string[][] = [[], [], [], []];
  sorted.forEach((c, i) => pots[Math.floor(i / (sorted.length / 4))].push(c.id));
  
  // 1ª fase: 80 times (40 jogos) - times de estaduais + ranking
  const firstPhaseTeams = pots.flat().slice(0, 80);
  const bracket = cupBracket(firstPhaseTeams, seed, pots[0].slice(0, 12)); // 12 cabeças de chave
  
  // Fases seguintes: sorteio puro, ida/volta a partir de oitavas
  const competition: Competition = {
    id: "copa-do-brasil",
    name: "Copa do Brasil",
    type: "copa_do_brasil",
    season: new Date().getFullYear(),
    phase: "first_stage",
    bracket,
    prizes: {
      "champion": 70_000_000,
      "runner_up": 30_000_000,
      "semifinal": 8_000_000,
      "quarterfinal": 4_000_000,
      "round_of_16": 3_000_000,
      "round_of_32": 1_500_000,
      "round_of_64": 800_000,
      "round_of_80": 400_000,
    },
  };
  
  return competition;
}

/** Libertadores: 32 times em 8 grupos de 4, depois mata-mata ida/volta */
export function libertadoresBracket(
  qualifiedClubs: Club[],
  seed: number
): Competition {
  const rng = mulberry32(seed + 54321);
  
  // 32 times: campeões nacionais + ranking CONMEBOL
  const pots: string[][] = [[], [], [], []];
  const sorted = [...qualifiedClubs].sort((a, b) => b.rep - a.rep);
  sorted.forEach((c, i) => pots[Math.floor(i / 8)].push(c.id));
  
  // Sorteio dos 8 grupos (4 times cada, 1 de cada pote)
  const groups: CompetitionGroup[] = [];
  for (let g = 0; g < 8; g++) {
    const groupTeams: string[] = [];
    for (let p = 0; p < 4; p++) {
      if (pots[p].length > 0) {
        groupTeams.push(pots[p][Math.floor(rng() * pots[p].length)]);
      }
    }
    // Se não tem times suficientes, completa com times do pote 0
    while (groupTeams.length < 4 && pots[0].length > 0) {
      groupTeams.push(pots[0][Math.floor(rng() * pots[0].length)]);
    }
    if (groupTeams.length < 2) continue; // Pula grupo vazio
    const fixtures = groupFixtures(groupTeams);
    fixtures.forEach(f => f.groupId = `group-${g}`);
    groups.push({
      id: `group-${g}`,
      name: `Grupo ${String.fromCharCode(65 + g)}`,
      teams: groupTeams,
      fixtures,
      standings: emptyGroupStandings(groupTeams),
    });
  }
  
  return {
    id: "libertadores",
    name: "Copa Libertadores",
    type: "libertadores",
    season: new Date().getFullYear(),
    phase: "group",
    groups,
    prizes: {
      "champion": 120_000_000,
      "runner_up": 60_000_000,
      "semifinal": 20_000_000,
      "quarterfinal": 10_000_000,
      "round_of_16": 5_000_000,
      "group_stage_win": 300_000,
      "group_stage_draw": 100_000,
    },
  };
}

/** Sul-Americana: similar à Libertadores mas com times de ranking menor */
export function sulAmericanaBracket(
  qualifiedClubs: Club[],
  seed: number
): Competition {
  const rng = mulberry32(seed + 98765);
  
  const pots: string[][] = [[], [], [], []];
  const sorted = [...qualifiedClubs].sort((a, b) => b.rep - a.rep);
  sorted.forEach((c, i) => pots[Math.floor(i / 8)].push(c.id));
  
  const groups: CompetitionGroup[] = [];
  for (let g = 0; g < 8; g++) {
    const groupTeams: string[] = [];
    for (let p = 0; p < 4; p++) {
      if (pots[p].length > 0) {
        groupTeams.push(pots[p][Math.floor(rng() * pots[p].length)]);
      }
    }
    while (groupTeams.length < 4 && pots[0].length > 0) {
      groupTeams.push(pots[0][Math.floor(rng() * pots[0].length)]);
    }
    if (groupTeams.length < 2) continue;
    const fixtures = groupFixtures(groupTeams);
    fixtures.forEach(f => f.groupId = `group-${g}`);
    groups.push({
      id: `group-${g}`,
      name: `Grupo ${String.fromCharCode(65 + g)}`,
      teams: groupTeams,
      fixtures,
      standings: emptyGroupStandings(groupTeams),
    });
  }
  
  return {
    id: "sul-americana",
    name: "Copa Sul-Americana",
    type: "sul_americana",
    season: new Date().getFullYear(),
    phase: "group",
    groups,
    prizes: {
      "champion": 30_000_000,
      "runner_up": 15_000_000,
      "semifinal": 5_000_000,
      "quarterfinal": 2_500_000,
      "round_of_16": 1_000_000,
      "group_stage_win": 200_000,
      "group_stage_draw": 75_000,
    },
  };
}

/** Supercopa do Brasil: campeão Brasileiro x campeão Copa do Brasil (jogo único) */
export function supercopaBracket(
  brasileiraoChampion: string,
  copaDoBrasilChampion: string,
  _seed?: number
): Competition {
  if (brasileiraoChampion === copaDoBrasilChampion) {
    // Mesmo campeão - vice da Copa do Brasil ou vice do Brasileiro
    return {
      id: "supercopa",
      name: "Supercopa do Brasil",
      type: "supercopa",
      season: new Date().getFullYear(),
      phase: "final",
      bracket: [[{
        slot: "Final",
        homeId: brasileiraoChampion,
        awayId: copaDoBrasilChampion,
        played: false,
      }]],
      prizes: { "champion": 5_000_000, "runner_up": 2_000_000 },
    };
  }
  
  return {
    id: "supercopa",
    name: "Supercopa do Brasil",
    type: "supercopa",
    season: new Date().getFullYear(),
    phase: "final",
    bracket: [[{
      slot: "Final",
      homeId: brasileiraoChampion,
      awayId: copaDoBrasilChampion,
      played: false,
    }]],
    prizes: { "champion": 5_000_000, "runner_up": 2_000_000 },
  };
}

/** Recopa Sul-Americana: campeão Libertadores x campeão Sul-Americana (ida/volta) */
export function recopaBracket(
  libertadoresChampion: string,
  sulAmericanaChampion: string,
  _seed?: number
): Competition {
  return {
    id: "recopa",
    name: "Recopa Sul-Americana",
    type: "recopa",
    season: new Date().getFullYear(),
    phase: "final",
    bracket: [[{
      slot: "Final - Ida",
      homeId: libertadoresChampion,
      awayId: sulAmericanaChampion,
      played: false,
    }, {
      slot: "Final - Volta",
      homeId: sulAmericanaChampion,
      awayId: libertadoresChampion,
      played: false,
    }]],
    prizes: { "champion": 3_000_000, "runner_up": 1_500_000 },
  };
}

/** Estaduais com formatos reais por estado */
export interface EstadualFormat {
  id: string;
  name: string;
  state: string;
  teams: string[];
  format: "single_group" | "two_groups" | "knockout" | "hybrid";
  stages: string[];
  relegationSpots: number;
  qualificationSpots: { copaDoBrasil: number; serieD: number };
}

export const ESTADUAIS_FORMATS: EstadualFormat[] = [
  { id: "paulistao", name: "Paulistão", state: "SP", teams: [], format: "two_groups", stages: ["first_stage", "quarterfinals", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 4, serieD: 2 } },
  { id: "carioca", name: "Carioca", state: "RJ", teams: [], format: "two_groups", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 3, serieD: 1 } },
  { id: "mineiro", name: "Mineiro", state: "MG", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 3, serieD: 1 } },
  { id: "gaucho", name: "Gaúcho", state: "RS", teams: [], format: "two_groups", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 3, serieD: 1 } },
  { id: "paranaense", name: "Paranaense", state: "PR", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  { id: "catarinense", name: "Catarinense", state: "SC", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  { id: "goiano", name: "Goiano", state: "GO", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  { id: "baiano", name: "Baiano", state: "BA", teams: [], format: "two_groups", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  { id: "pernambucano", name: "Pernambucano", state: "PE", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  { id: "cearense", name: "Cearense", state: "CE", teams: [], format: "single_group", stages: ["first_stage", "semifinals", "final"], relegationSpots: 2, qualificationSpots: { copaDoBrasil: 2, serieD: 1 } },
  // ... demais estaduais simplificados
];

/** Gera chave de estadual baseada no formato */
export function estadualBracket(
  teams: string[],
  format: EstadualFormat,
  seed: number
): CupFixture[][] {
  const rng = mulberry32(seed + format.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  
  if (format.format === "single_group") {
    // Todos contra todos ida, top 4 semifinal
    const fixtures = doubleRoundRobin(teams);
    return [fixtures.map(f => ({ 
      slot: "1ª Fase", 
      homeId: f.homeId, 
      awayId: f.awayId, 
      played: false 
    }))];
  }
  
  if (format.format === "two_groups") {
    // 2 grupos, ida/volta dentro do grupo, cruzamento semifinal
    const shuffled = shuffle([...teams], rng);
    const mid = Math.ceil(shuffled.length / 2);
    const groupA = shuffled.slice(0, mid);
    const groupB = shuffled.slice(mid);
    
    const fixturesA = doubleRoundRobin(groupA).map(f => ({ ...f, slot: "Grupo A" }));
    const fixturesB = doubleRoundRobin(groupB).map(f => ({ ...f, slot: "Grupo B" }));
    
    return [
      [...fixturesA, ...fixturesB].map(f => ({ 
        slot: f.slot, 
        homeId: f.homeId, 
        awayId: f.awayId, 
        played: false 
      }))
    ];
  }
  
  // Fallback: mata-mata simples
  return cupBracket(teams, seed);
}

/** Janelas FIFA 2026 (baseado no calendário real) */
export const FIFA_WINDOWS_2026: FifaWindow[] = [
  { id: "fifa-mar", name: "Data FIFA Março", startRound: 3, endRound: 4, nationalTeams: [] },
  { id: "fifa-jun", name: "Data FIFA Junho", startRound: 10, endRound: 11, nationalTeams: [] },
  { id: "fifa-set", name: "Data FIFA Setembro", startRound: 20, endRound: 21, nationalTeams: [] },
  { id: "fifa-out", name: "Data FIFA Outubro", startRound: 27, endRound: 28, nationalTeams: [] },
  { id: "fifa-nov", name: "Data FIFA Novembro", startRound: 33, endRound: 34, nationalTeams: [] },
];

/** Gera calendário completo da temporada */
export function generateSeasonCalendar(season: number, _seed?: number): SeasonCalendar {
  return {
    season,
    brasileiraoRounds: 38,
    copaDoBrasilRounds: 8, // 1ª fase a final
    libertadoresRounds: 14, // 6 grupos + 8 mata-mata
    sulAmericanaRounds: 14,
    estaduais: ESTADUAIS_FORMATS.map(e => ({ id: e.id, startRound: 1, endRound: 16 })),
    fifaWindows: FIFA_WINDOWS_2026,
    supercopaRound: 0, // Antes da rodada 1
    recopaRounds: [2, 3], // Ida/volta nas rodadas 2-3
  };
}

const SEASON_PRIZES: Record<1 | 2 | 3, number[]> = {
  1: [10_000_000, 6_000_000, 4_000_000, 2_500_000, 1_500_000, 1_000_000],
  2: [4_000_000, 2_500_000, 1_500_000, 1_000_000],
  3: [1_500_000, 1_000_000, 600_000, 400_000],
};

export function prizeFor(position: number, division: 1 | 2 | 3 = 1): number {
  return SEASON_PRIZES[division][position - 1] ?? 0;
}

/** Mata-mata da Libertadores/Sul-Americana a partir dos grupos */
export function knockoutFromGroups(
  groups: CompetitionGroup[],
  seed: number,
  competitionType: "libertadores" | "sul_americana"
): CupFixture[][] {
  const rng = mulberry32(seed + (competitionType === "libertadores" ? 111 : 222));
  
  // 1º e 2º de cada grupo (16 times)
  const qualified: { clubId: string; groupPos: number; groupId: string }[] = [];
  for (const group of groups) {
    const sorted = sortGroupTable(group.standings);
    qualified.push({ clubId: sorted[0].clubId, groupPos: 1, groupId: group.id });
    qualified.push({ clubId: sorted[1].clubId, groupPos: 2, groupId: group.id });
  }
  
  // Oitavas: 1ºA x 2ºB, 1ºB x 2ºA, etc. (sorteio com proteção de mesmo grupo)
  const firstPlace = qualified.filter(q => q.groupPos === 1);
  const secondPlace = qualified.filter(q => q.groupPos === 2);
  
  const roundOf16: CupFixture[] = [];
  const usedSecond = new Set<string>();
  
  for (const first of firstPlace) {
    const available = secondPlace.filter(s => s.groupId !== first.groupId && !usedSecond.has(s.clubId));
    if (available.length === 0) continue;
    const opponent = available[Math.floor(rng() * available.length)];
    usedSecond.add(opponent.clubId);
    
    // Mandante: 1º colocado joga volta em casa
    roundOf16.push({
      slot: "Oitavas de final",
      homeId: opponent.clubId,
      awayId: first.clubId,
      played: false,
    });
  }
  
  return [roundOf16];
}

/** Avança fase de mata-mata (quartas, semi, final) */
export function advanceKnockout(
  previous: CupFixture[],
  seed: number,
  phaseIndex: number
): CupFixture[] {
  const winners = previous.map(f => f.winnerId).filter((id): id is string => Boolean(id));
  const rng = mulberry32(seed + 7331 + phaseIndex);
  const shuffled = shuffle(winners, rng);
  const slot = cupSlotLabel(shuffled.length, phaseIndex);
  const round: CupFixture[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    round.push({ slot, homeId: shuffled[i], awayId: shuffled[i + 1], played: false });
  }
  if (shuffled.length % 2 === 1) round.push(byeFixture(slot, shuffled[shuffled.length - 1]));
  return round;
}

/**
 * Disputa de pênaltis. Cobrador converte ~76% na média; goleiros fortes (1-50) derrubam
 * isso até ~61%, fracos sobem até ~85%. Série de 5 com encerramento antecipado e
 * alternadas até desempatar.
 */
export function resolvePenalties(
  homeGk: number,
  awayGk: number,
  seed: number,
): { home: number; away: number; winner: "home" | "away" } {
  const rng = mulberry32(seed + 777);
  const scoreProb = (gk: number) => Math.max(0.55, Math.min(0.9, 0.76 - (gk - 25) * 0.006));
  const pHome = scoreProb(awayGk);
  const pAway = scoreProb(homeGk);
  let home = 0;
  let away = 0;
  for (let k = 1; k <= 5; k++) {
    if (rng() < pHome) home++;
    if (home > away + (6 - k) || away > home + (5 - k)) break;
    if (rng() < pAway) away++;
    if (Math.abs(home - away) > 5 - k) break;
  }
  let extra = 0;
  while (home === away && extra < 30) {
    extra++;
    if (rng() < pHome) home++;
    if (rng() < pAway) away++;
  }
  if (home === away) {
    if (rng() < 0.5) home++;
    else away++;
  }
  return { home, away, winner: home > away ? "home" : "away" };
}