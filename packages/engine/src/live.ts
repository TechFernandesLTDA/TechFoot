import type { Cards, Club, EventKind, Formation, MatchEvent, MatchResult, Player, Position, Tactic } from "./types.ts";
import { effectivePowers } from "./strength.ts";
import { resolvePenalties } from "./league.ts";

export const ENGINE_VERSION = 2;

export interface Side {
  club: Club;
  starterIds: string[];
  benchIds?: string[];
  captainId?: string;
  tactic?: Tactic;
  formation?: Formation;
  substitutions?: { minute: number; playerOutId: string; playerInId: string }[];
  ai?: boolean;
}

export interface LivePlayer {
  id: string;
  name: string;
  position: Position;
  preferredPositions: Position[];
  nationality: string;
  age: number;
  xp: number;
  fit: number;
  morale: number;
  strength: number;
  behavior: number;
  stamina: number;
  finishing: number;
  passing: number;
  marking: number;
  tackling: number;
  handling: number;
  pace: number;
  leadership: number;
  yellow: number;
  off: boolean;
  injured: boolean;
}

export interface LiveSide {
  clubId: string;
  name: string;
  city: string;
  state: string;
  country: string;
  colors: [string, string];
  tactic: Tactic;
  formation: Formation;
  morale: number;
  talk: number;
  onPitch: string[];
  bench: string[];
  players: LivePlayer[];
  subsUsed: number;
  windowsUsed: number;
  windowMinute: number;
  ai: boolean;
  planned: { minute: number; playerOutId: string; playerInId: string }[];
}

export interface MatchState {
  engineVersion: number;
  seed: number;
  sim: number;
  commentary: number;
  minute: number;
  period: "1T" | "HT" | "2T" | "FT" | "PEN";
  stoppage: number;
  stoppagePlayed: number;
  score: [number, number];
  momentum: number;
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  cards: Cards;
  injuries: string[];
  events: MatchEvent[];
  substitutions: MatchResult["substitutions"];
  home: LiveSide;
  away: LiveSide;
  kind: "league" | "cup";
  decider: boolean;
  derby: boolean;
  penalties?: { home: number; away: number; winner: "home" | "away"; kicks: { side: "home" | "away"; scored: boolean }[] };
}

export type MatchCommand =
  | { type: "sub"; outId: string; inId: string }
  | { type: "tactic"; tactic: Tactic }
  | { type: "formation"; formation: Formation }
  | { type: "talk"; talk: "calma" | "cobrar" | "motivar" }
  | { type: "resume" };

export type LivePhase =
  | "firstHalf"
  | "firstStoppage"
  | "halfTime"
  | "secondHalf"
  | "secondStoppage"
  | "penalties"
  | "fullTime"
  | "abandoned";

export type StoredLiveStatus = "live" | "halftime" | "fulltime" | "finished" | "abandoned";

export type ClockState = Pick<MatchState, "period" | "minute" | "stoppage" | "stoppagePlayed" | "penalties">;

export function livePhase(state: ClockState): LivePhase {
  if (state.period === "HT") return "halfTime";
  if (state.period === "PEN") return "penalties";
  if (state.period === "FT") return state.penalties ? "penalties" : "fullTime";
  const added = state.stoppage > 0 && ((state.period === "1T" && state.minute >= 45) || (state.period === "2T" && state.minute >= 90));
  if (state.period === "2T") return added ? "secondStoppage" : "secondHalf";
  return added ? "firstStoppage" : "firstHalf";
}

export function statusForPhase(phase: LivePhase, committed = false): StoredLiveStatus {
  if (phase === "abandoned") return "abandoned";
  if (phase === "halfTime") return "halftime";
  if (phase === "fullTime" || phase === "penalties") return committed ? "finished" : "fulltime";
  return "live";
}

export function isOpenLiveStatus(status: string): boolean {
  return status === "live" || status === "halftime" || status === "fulltime";
}

export function userSideOf(state: Pick<MatchState, "home" | "away">): "home" | "away" {
  if (state.home.ai !== state.away.ai) return state.home.ai ? "away" : "home";
  return "home";
}

export function enterStoppage(state: MatchState, minutes: number): void {
  state.stoppage = minutes;
}

export function endFirstHalf(state: MatchState): void {
  state.period = "HT";
}

export function resumeSecondHalf(state: MatchState): void {
  if (state.period !== "HT") return;
  state.period = "2T";
  state.stoppage = 0;
  state.stoppagePlayed = 0;
}

export function beginShootout(state: MatchState, pens: { home: number; away: number; winner: "home" | "away" }): void {
  state.penalties = { ...pens, kicks: [] };
  state.period = "PEN";
}

export function finishMatch(state: MatchState): void {
  state.period = "FT";
}

const GOAL_LINES = [
  "GOOOL! {p} marca para o {team}.",
  "É gol de {p}! O {team} chega a {score}.",
  "{p} empurra para o fundo. {score}.",
  "A rede balança: {p}, {team}.",
  "Gol de {p}. O placar fica {score}.",
  "{p} não perdoa. {team} {score}.",
  "Explode o estádio com {p}. {score}.",
  "{p} completa a jogada. {score} para o {team}.",
];
const TIE_LINES = [
  "{p} empata para o {team}. {score}.",
  "Tudo igual de novo. {p} deixa {score}.",
  "{p} busca o empate. Placar: {score}.",
];
const TURN_LINES = [
  "{p} vira o jogo para o {team}! {score}.",
  "Virada! {p} põe o {team} na frente: {score}.",
  "{p} desfaz a desvantagem e passa à frente. {score}.",
];
const EXTEND_LINES = [
  "{p} amplia para o {team}. {score}.",
  "Mais um de {p}. O {team} abre: {score}.",
  "{p} mata o contra-ataque. {score}.",
];
const CUT_LINES = [
  "{p} desconta para o {team}. {score}.",
  "Gol de honra de {p}. {score}.",
  "{p} diminui a diferença. {score}.",
];
const MISS_LINES = [
  "{p} manda para fora.",
  "Chute de {p} passa perto.",
  "{p} finaliza sem direção.",
  "A bola beija a linha e sai. {p} lamenta.",
  "Quase! {p} acerta o ângulo e a bola sai.",
  "{p} tenta de longe e não encontra o gol.",
];
const SAVE_LINES = [
  "Defesaça no chute de {p}.",
  "O goleiro espalma o chute de {p}.",
  "{p} é parado em cima da linha.",
  "Grande defesa. {p} põe as mãos na cabeça.",
  "O arqueiro fica com a bola de {p}.",
  "Milagre do goleiro contra {p}.",
];
const POST_LINES = [
  "A trave nega {p}!",
  "{p} acerta o poste.",
  "Madeira! {p} quase marca.",
  "O travessão treme no chute de {p}.",
  "Por centímetros. {p} encontra a trave.",
  "{p} beija a trave.",
];
const FOUL_LINES = [
  "Falta de {p}.",
  "{p} chega atrasado.",
  "O árbitro marca a falta de {p}.",
  "{p} derruba o adversário.",
  "Jogo parado na falta de {p}.",
  "Entrada dura de {p}.",
];
const YELLOW_LINES = [
  "Amarelo para {p}.",
  "{p} vê o cartão.",
  "Advertência para {p}.",
  "O árbitro anota {p}.",
  "{p} reclama e leva amarelo.",
  "Cartão para {p} depois da dividida.",
];
const RED_LINES = [
  "Vermelho! {p} está fora.",
  "{p} é expulso.",
  "Cartão vermelho direto para {p}.",
  "{p} deixa o time com um a menos.",
  "Expulsão de {p}. O jogo muda.",
  "O árbitro manda {p} para o vestiário.",
];
const INJURY_LINES = [
  "{p} fica no chão.",
  "Lesão de {p}.",
  "{p} pede substituição.",
  "{p} sente e não continua.",
  "Atendimento para {p}.",
  "{p} deixa o campo mancando.",
];
const SUB_LINES = [
  "Entra {p}.",
  "Substituição: {p} no jogo.",
  "{p} é chamado do banco.",
  "Mudança tática com {p}.",
  "{p} entra para mudar o ritmo.",
  "O banco manda {p}.",
];
const CHANCE_LINES = [
  "Boa chegada do {team}.",
  "O {team} arma a jogada pelo meio.",
  "Pressão do {team} no campo de ataque.",
  "O {team} troca passes e se aproxima.",
  "Lance perigoso do {team}.",
  "A torcida empurra o {team}.",
];
const CORNER_LINES = [
  "Escanteio para o {team}.",
  "Córner. O {team} cruza na área.",
  "Bola parada para o {team}.",
  "Escanteio cobrado pelo {team}.",
  "A bola sai pela linha de fundo. Córner do {team}.",
  "O {team} vai à bola parada.",
];
const FREE_LINES = [
  "Falta perigosa para o {team}.",
  "Cobrança de falta do {team}.",
  "Barreira armada. Falta do {team}.",
  "Tiro livre para o {team}.",
  "Falta na entrada da área para o {team}.",
  "O {team} tem a bola parada.",
];
const PENALTY_LINES = [
  "Pênalti para o {team}!",
  "O árbitro aponta a marca. {team}.",
  "Penalty! O {team} vai para a cobrança.",
  "Falta dentro da área. Pênalti do {team}.",
  "A torcida grita pênalti para o {team}.",
  "Marca penal a favor do {team}.",
];
const WHISTLE_LINES = [
  "Fim de jogo.",
  "O árbitro encerra.",
  "Apita o fim.",
  "Terminou o tempo.",
  "Bola para o centro, não: acabou.",
  "O jogo chega ao fim.",
];

function rngStep(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

function roll(state: number, options: string[], vars: Record<string, string>): { state: number; text: string } {
  const pick = rngStep(state);
  let text = options[Math.floor(pick.value * options.length)] ?? options[0];
  for (const [key, value] of Object.entries(vars)) text = text.replaceAll(`{${key}}`, value);
  return { state: pick.state, text };
}

function snapPlayer(player: Player): LivePlayer {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    preferredPositions: player.preferredPositions ?? [player.position],
    nationality: player.nationality,
    age: player.age,
    xp: player.xp,
    fit: player.fitness,
    morale: player.morale,
    strength: player.strength,
    behavior: player.behavior,
    stamina: player.skills.stamina,
    finishing: player.skills.finishing,
    passing: player.skills.passing,
    marking: player.skills.marking,
    tackling: player.skills.tackling,
    handling: player.skills.handling,
    pace: player.skills.pace,
    leadership: player.skills.leadership,
    yellow: 0,
    off: false,
    injured: false,
  };
}

function asClubPlayers(side: LiveSide, ids: string[]): Player[] {
  const wanted = new Set(ids);
  return side.players.filter((player) => wanted.has(player.id) && !player.off && !player.injured).map((player) => ({
    id: player.id,
    name: player.name,
    nationality: player.nationality,
    position: player.position,
    preferredPositions: player.preferredPositions,
    age: player.age,
    xp: player.xp,
    skills: {
      pace: player.pace,
      finishing: player.finishing,
      passing: player.passing,
      marking: player.marking,
      tackling: player.tackling,
      handling: player.handling,
      stamina: player.stamina,
      leadership: player.leadership,
    },
    fitness: Math.max(15, Math.min(100, player.fit)),
    morale: player.morale,
    strength: player.strength * (0.85 + 0.15 * (Math.max(0, Math.min(100, player.fit)) / 100)),
    salary: 0,
    contractGames: 1,
    behavior: player.behavior,
    injuredGames: 0,
    yellows: 0,
    reds: 0,
    goals: 0,
    matches: 0,
    suspendedGames: 0,
  }));
}

function makeSide(input: Side, ai: boolean): LiveSide {
  const starters = input.starterIds.filter((id) => input.club.players.some((player) => player.id === id));
  const bench = (input.benchIds ?? input.club.players.map((player) => player.id).filter((id) => !starters.includes(id))).filter((id) => input.club.players.some((player) => player.id === id));
  return {
    clubId: input.club.id,
    name: input.club.name,
    city: input.club.city,
    state: input.club.state,
    country: input.club.country,
    colors: input.club.colors,
    tactic: input.tactic ?? input.club.tactic ?? "balanced",
    formation: input.formation ?? "4-3-3",
    morale: input.club.morale,
    talk: 0,
    onPitch: starters.slice(0, 11),
    bench: bench.filter((id) => !starters.includes(id)).slice(0, 12),
    players: input.club.players.map(snapPlayer),
    subsUsed: 0,
    windowsUsed: 0,
    windowMinute: -1,
    ai,
    planned: (input.substitutions ?? []).map((change) => ({ ...change })),
  };
}

export function initMatch(home: Side, away: Side, seed: number, opts?: { kind?: "league" | "cup"; homeAi?: boolean; awayAi?: boolean; decider?: boolean }): MatchState {
  const homeSide = makeSide(home, opts?.homeAi ?? false);
  const awaySide = makeSide(away, opts?.awayAi ?? true);
  return {
    engineVersion: ENGINE_VERSION,
    seed,
    sim: (seed + 17) >>> 0,
    commentary: (seed + 909091) >>> 0,
    minute: 0,
    period: "1T",
    stoppage: 0,
    stoppagePlayed: 0,
    score: [0, 0],
    momentum: 0,
    possession: { home: 0, away: 0 },
    shots: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
    injuries: [],
    events: [],
    substitutions: [],
    home: homeSide,
    away: awaySide,
    kind: opts?.kind ?? "league",
    decider: opts?.decider ?? opts?.kind !== "cup",
    derby: Boolean(home.club.state && home.club.state === away.club.state),
  };
}

function playerOf(side: LiveSide, id: string): LivePlayer | undefined {
  return side.players.find((player) => player.id === id);
}

function active(side: LiveSide): LivePlayer[] {
  return side.onPitch.map((id) => playerOf(side, id)).filter((player): player is LivePlayer => Boolean(player && !player.off && !player.injured));
}

function powers(side: LiveSide, derbyBoost = 1) {
  const players = asClubPlayers(side, side.onPitch);
  const captain = players[0]?.skills.leadership ?? 0;
  const base = effectivePowers(players, side.country, side.tactic, side.morale, side.formation, captain);
  const talk = 1 + side.talk;
  return { atk: base.atk * talk * derbyBoost, def: base.def * talk, gk: base.gk };
}

function clockLabel(state: MatchState): number {
  return state.minute;
}

function pushEvent(state: MatchState, event: Omit<MatchEvent, "text"> & { lines: string[]; vars: Record<string, string> }): MatchEvent {
  const spoken = roll(state.commentary, event.lines, event.vars);
  state.commentary = spoken.state;
  const made: MatchEvent = {
    minute: event.minute,
    kind: event.kind,
    text: spoken.text,
    playerId: event.playerId,
    teamId: event.teamId,
    side: event.side,
    big: event.big,
    stoppage: event.stoppage,
  };
  state.events.push(made);
  return made;
}

function outfielder(players: LivePlayer[], draw: number): LivePlayer | undefined {
  const pool = players.filter((player) => player.position !== "GK");
  const source = pool.length ? pool : players;
  return source[Math.floor(draw * source.length)];
}

function canSub(side: LiveSide, minute: number, period: MatchState["period"]): boolean {
  if (side.subsUsed >= 5) return false;
  if (period === "HT") return true;
  if (side.windowMinute === minute) return true;
  return side.windowsUsed < 3;
}

function applySub(state: MatchState, sideName: "home" | "away", outId: string, inId: string): boolean {
  const side = state[sideName];
  if (!canSub(side, state.minute, state.period)) return false;
  const outIndex = side.onPitch.indexOf(outId);
  const inIndex = side.bench.indexOf(inId);
  const incoming = playerOf(side, inId);
  const outgoing = playerOf(side, outId);
  if (outIndex < 0 || inIndex < 0 || !incoming || !outgoing || incoming.off || incoming.injured) return false;
  if (state.period !== "HT" && side.windowMinute !== state.minute) {
    side.windowsUsed += 1;
    side.windowMinute = state.minute;
  }
  side.onPitch[outIndex] = inId;
  side.bench.splice(inIndex, 1);
  side.subsUsed += 1;
  state.substitutions.push({ minute: state.minute, teamId: side.clubId, playerOutId: outId, playerInId: inId });
  pushEvent(state, {
    minute: state.minute,
    kind: "substitution",
    side: sideName,
    teamId: side.clubId,
    playerId: inId,
    lines: SUB_LINES,
    vars: { p: incoming.name, team: side.name },
    stoppage: state.stoppagePlayed || undefined,
  });
  return true;
}

function maybeAi(state: MatchState, sideName: "home" | "away"): void {
  const side = state[sideName];
  if (!side.ai || state.period === "HT" || state.period === "FT") return;
  const scoreFor = sideName === "home" ? state.score[0] : state.score[1];
  const scoreAgainst = sideName === "home" ? state.score[1] : state.score[0];
  if (state.minute >= 70 && scoreFor < scoreAgainst && side.tactic !== "offensive") side.tactic = "offensive";
  if (state.minute >= 70 && scoreFor > scoreAgainst && side.tactic !== "defensive") side.tactic = "defensive";
  if (state.minute < 60) return;
  const tired = active(side).filter((player) => player.position !== "GK").sort((a, b) => a.fit - b.fit)[0];
  if (!tired || tired.fit >= 62) return;
  const replacement = side.bench.map((id) => playerOf(side, id)).find((player) => player && !player.off && !player.injured && player.position === tired.position);
  if (!replacement) return;
  applySub(state, sideName, tired.id, replacement.id);
}

function planned(state: MatchState, sideName: "home" | "away"): void {
  const side = state[sideName];
  const due = side.planned.filter((change) => change.minute === state.minute);
  side.planned = side.planned.filter((change) => change.minute !== state.minute);
  for (const change of due) applySub(state, sideName, change.playerOutId, change.playerInId);
}

function fatigue(side: LiveSide): void {
  for (const id of side.onPitch) {
    const player = playerOf(side, id);
    if (!player || player.off || player.injured) continue;
    const loss = 0.035 + (player.age > 32 ? 0.015 : 0) + Math.max(0, 40 - player.stamina) / 4000;
    player.fit = Math.max(15, player.fit - loss);
  }
}

export function applyCommand(state: MatchState, command: MatchCommand): MatchState {
  const next = structuredClone(state);
  const mine = userSideOf(next);
  if (command.type === "resume") {
    resumeSecondHalf(next);
    return next;
  }
  if (next.period === "FT" || next.period === "PEN") return next;
  if (command.type === "talk") {
    if (next.period !== "HT") return next;
    const boost = command.talk === "motivar" ? 0.04 : command.talk === "cobrar" ? 0.03 : -0.02;
    next[mine].talk = boost;
    next.momentum = Math.max(-100, Math.min(100, next.momentum + (command.talk === "calma" ? -12 : 10)));
    return next;
  }
  if (command.type === "tactic") {
    next[mine].tactic = command.tactic;
    return next;
  }
  if (command.type === "formation") {
    next[mine].formation = command.formation;
    return next;
  }
  applySub(next, mine, command.outId, command.inId);
  return next;
}

function finishHalf(state: MatchState): void {
  if (state.minute === 45 && state.period === "1T") {
    if (state.stoppage === 0) {
      const rollStoppage = rngStep(state.sim);
      state.sim = rollStoppage.state;
      enterStoppage(state, 1 + Math.floor(rollStoppage.value * 5));
    }
    if (state.stoppagePlayed < state.stoppage) return;
    endFirstHalf(state);
    return;
  }
  if (state.minute >= 90 && state.period === "2T") {
    if (state.stoppage === 0) {
      const rollStoppage = rngStep(state.sim);
      state.sim = rollStoppage.state;
      enterStoppage(state, 2 + Math.floor(rollStoppage.value * 7));
    }
    if (state.stoppagePlayed < state.stoppage) return;
    if (state.kind === "cup" && state.decider && state.score[0] === state.score[1]) {
      const pens = resolvePenalties(30, 30, state.sim);
      beginShootout(state, pens);
      pushEvent(state, {
        minute: 90,
        kind: "whistle",
        side: "none",
        teamId: "",
        lines: ["Pênaltis: {score}.", "A vaga sai nos pênaltis. {score}.", "Decisão na marca: {score}.", "Os pênaltis fecham a noite. {score}.", "A disputa termina {score}.", "Classificação definida nos pênaltis, {score}."],
        vars: { score: `${pens.home} a ${pens.away}` },
        stoppage: state.stoppage,
      });
      finishMatch(state);
      return;
    }
    finishMatch(state);
    pushEvent(state, {
      minute: 90,
      kind: "whistle",
      side: "none",
      teamId: "",
      lines: WHISTLE_LINES,
      vars: {},
      stoppage: state.stoppage,
    });
  }
}

export function stepMinute(state: MatchState): { state: MatchState; events: MatchEvent[] } {
  if (state.period === "HT" || state.period === "FT" || state.period === "PEN") return { state, events: [] };
  const next = structuredClone(state);
  const before = next.events.length;
  if ((next.minute === 45 && next.period === "1T" && next.stoppage > 0 && next.stoppagePlayed < next.stoppage) || (next.minute >= 90 && next.period === "2T" && next.stoppage > 0 && next.stoppagePlayed < next.stoppage)) {
    next.stoppagePlayed += 1;
  } else {
    next.minute += 1;
    if (next.minute > 90) next.minute = 90;
  }
  fatigue(next.home);
  fatigue(next.away);
  planned(next, "home");
  planned(next, "away");
  maybeAi(next, "home");
  maybeAi(next, "away");
  playChances(next);
  finishHalf(next);
  return { state: next, events: next.events.slice(before) };
}

function playChances(state: MatchState): void {
  const derbyBoost = state.derby ? 1.08 : 1;
  const homePower = powers(state.home, derbyBoost);
  const awayPower = powers(state.away, derbyBoost);
  const derby = state.derby ? 1.08 : 1;
  const momentum = 1 + state.momentum / 500;
  const homeDraw = rngStep(state.sim);
  state.sim = homeDraw.state;
  const awayDraw = rngStep(state.sim);
  state.sim = awayDraw.state;
  const homeRate = Math.min(0.16, (homePower.atk / Math.max(1, homePower.atk + awayPower.def)) * 0.22 * momentum * derby);
  const awayRate = Math.min(0.16, (awayPower.atk / Math.max(1, awayPower.atk + homePower.def)) * 0.2 * (2 - momentum) * derby);
  if (homeDraw.value < Math.max(homeRate, awayRate)) state.possession.home += homeDraw.value < homeRate ? 1 : 0;
  if (homeDraw.value < homeRate) attack(state, "home", homePower.atk, awayPower.def, awayPower.gk);
  if (awayDraw.value < awayRate) attack(state, "away", awayPower.atk, homePower.def, homePower.gk);
  foul(state, "home");
  foul(state, "away");
}

function attack(state: MatchState, sideName: "home" | "away", atk: number, def: number, gk: number): void {
  const side = state[sideName];
  const players = active(side);
  if (players.length === 0) return;
  state.shots[sideName] += 1;
  const draw = rngStep(state.sim);
  state.sim = draw.state;
  const shooterDraw = rngStep(state.sim);
  state.sim = shooterDraw.state;
  const shooter = outfielder(players, shooterDraw.value);
  const vars = { p: shooter?.name ?? "o atacante", team: side.name, score: "" };
  if (draw.value < 0.08) {
    state.corners[sideName] += 1;
    pushEvent(state, { minute: clockLabel(state), kind: "corner", side: sideName, teamId: side.clubId, lines: CORNER_LINES, vars, stoppage: state.stoppagePlayed || undefined });
    return;
  }
  if (draw.value < 0.14) {
    pushEvent(state, { minute: clockLabel(state), kind: "freekick", side: sideName, teamId: side.clubId, lines: FREE_LINES, vars, stoppage: state.stoppagePlayed || undefined });
  }
  const contest = rngStep(state.sim);
  state.sim = contest.state;
  const defended = contest.value * atk * 1.15 <= contest.value * def * 0.35 + def * 0.2;
  if (defended && contest.value > 0.42) {
    pushEvent(state, { minute: clockLabel(state), kind: "chance", side: sideName, teamId: side.clubId, playerId: shooter?.id, lines: CHANCE_LINES, vars, big: contest.value > 0.9, stoppage: state.stoppagePlayed || undefined });
    return;
  }
  const kindDraw = rngStep(state.sim);
  state.sim = kindDraw.state;
  const weights = [46, 22, 8, 7, 17];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = kindDraw.value * total;
  let kind: EventKind = "miss";
  const kinds: EventKind[] = ["goal", "saved", "post", "crossbar", "miss"];
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) {
      kind = kinds[index];
      break;
    }
  }
  if (kind === "goal") {
    const saveDraw = rngStep(state.sim);
    state.sim = saveDraw.state;
    if (saveDraw.value < Math.min(0.55, gk / 280)) kind = "saved";
  }
  const big = kind === "goal" || kind === "post" || kind === "penalty";
  if (kind === "goal") {
    const beforeHome = state.score[0];
    const beforeAway = state.score[1];
    if (sideName === "home") state.score[0] += 1;
    else state.score[1] += 1;
    vars.score = `${state.score[0]} a ${state.score[1]}`;
    const lines = goalLines(sideName, beforeHome, beforeAway, state.score[0], state.score[1]);
    pushEvent(state, { minute: clockLabel(state), kind, side: sideName, teamId: side.clubId, playerId: shooter?.id, lines, vars, big: true, stoppage: state.stoppagePlayed || undefined });
    state.momentum = Math.max(-100, Math.min(100, state.momentum + (sideName === "home" ? 22 : -22)));
    return;
  }
  const lines = kind === "saved" ? SAVE_LINES : kind === "post" || kind === "crossbar" ? POST_LINES : MISS_LINES;
  pushEvent(state, { minute: clockLabel(state), kind, side: sideName, teamId: side.clubId, playerId: shooter?.id, lines, vars, big, stoppage: state.stoppagePlayed || undefined });
}

function goalLines(side: "home" | "away", beforeHome: number, beforeAway: number, home: number, away: number): string[] {
  const beforeFor = side === "home" ? beforeHome : beforeAway;
  const beforeAgainst = side === "home" ? beforeAway : beforeHome;
  const afterFor = side === "home" ? home : away;
  const afterAgainst = side === "home" ? away : home;
  if (beforeFor < beforeAgainst && afterFor > afterAgainst) return TURN_LINES;
  if (beforeFor < beforeAgainst && afterFor === afterAgainst) return TIE_LINES;
  if (beforeFor < beforeAgainst) return CUT_LINES;
  if (beforeFor > beforeAgainst) return EXTEND_LINES;
  if (beforeFor === beforeAgainst && afterFor > afterAgainst) return GOAL_LINES;
  return GOAL_LINES;
}

function foul(state: MatchState, sideName: "home" | "away"): void {
  const gate = rngStep(state.sim);
  state.sim = gate.state;
  if (gate.value >= 0.08) return;
  const side = state[sideName];
  const players = active(side).filter((player) => player.position !== "GK");
  if (players.length === 0) return;
  const who = rngStep(state.sim);
  state.sim = who.state;
  const player = players[Math.floor(who.value * players.length)];
  const card = rngStep(state.sim);
  state.sim = card.state;
  const yellowWeight = 18 + player.behavior;
  const redWeight = 1;
  const foulWeight = 90;
  const total = yellowWeight + redWeight + foulWeight;
  const mark = card.value * total;
  state.fouls[sideName] += 1;
  if (mark < redWeight) {
    sendOff(state, sideName, player, false);
    return;
  }
  if (mark < redWeight + yellowWeight) {
    player.yellow += 1;
    state.cards[sideName].yellow += 1;
    pushEvent(state, { minute: clockLabel(state), kind: "yellow", side: sideName, teamId: side.clubId, playerId: player.id, lines: YELLOW_LINES, vars: { p: player.name, team: side.name }, stoppage: state.stoppagePlayed || undefined });
    if (player.yellow >= 2) sendOff(state, sideName, player, true);
    return;
  }
  if (card.value > 0.97) {
    state.corners[sideName === "home" ? "away" : "home"] += 1;
    pushEvent(state, { minute: clockLabel(state), kind: "penalty", side: sideName === "home" ? "away" : "home", teamId: sideName === "home" ? state.away.clubId : state.home.clubId, lines: PENALTY_LINES, vars: { p: player.name, team: sideName === "home" ? state.away.name : state.home.name }, big: true, stoppage: state.stoppagePlayed || undefined });
    takePenalty(state, sideName === "home" ? "away" : "home");
    return;
  }
  pushEvent(state, { minute: clockLabel(state), kind: "foul", side: sideName, teamId: side.clubId, playerId: player.id, lines: FOUL_LINES, vars: { p: player.name, team: side.name }, stoppage: state.stoppagePlayed || undefined });
  if (card.value > 0.992) {
    player.injured = true;
    state.injuries.push(player.id);
    pushEvent(state, { minute: clockLabel(state), kind: "injury", side: sideName, teamId: side.clubId, playerId: player.id, lines: INJURY_LINES, vars: { p: player.name, team: side.name }, big: true, stoppage: state.stoppagePlayed || undefined });
    const replacement = side.bench.map((id) => playerOf(side, id)).find((candidate) => candidate && !candidate.injured && !candidate.off);
    if (!replacement || !canSub(side, state.minute, state.period) || !applySub(state, sideName, player.id, replacement.id)) {
      side.onPitch = side.onPitch.filter((id) => id !== player.id);
    }
  }
}

function sendOff(state: MatchState, sideName: "home" | "away", player: LivePlayer, secondYellow: boolean): void {
  const side = state[sideName];
  player.off = true;
  state.cards[sideName].red += 1;
  side.onPitch = side.onPitch.filter((id) => id !== player.id);
  pushEvent(state, {
    minute: clockLabel(state),
    kind: "red",
    side: sideName,
    teamId: side.clubId,
    playerId: player.id,
    lines: secondYellow ? ["Segundo amarelo de {p}.", "{p} está expulso com dois amarelos.", "Vermelho para {p} depois do segundo amarelo.", "{p} despede-se com o segundo cartão.", "Dois amarelos: {p} fora.", "{p} vai para o chuveiro pelo segundo amarelo."] : RED_LINES,
    vars: { p: player.name, team: side.name },
    big: true,
    stoppage: state.stoppagePlayed || undefined,
  });
}

function takePenalty(state: MatchState, sideName: "home" | "away"): void {
  const side = state[sideName];
  const taker = active(side).find((player) => player.position !== "GK") ?? active(side)[0];
  const draw = rngStep(state.sim);
  state.sim = draw.state;
  const scored = draw.value > 0.22;
  if (!scored) {
    pushEvent(state, { minute: clockLabel(state), kind: "saved", side: sideName, teamId: side.clubId, playerId: taker?.id, lines: ["O goleiro pega o pênalti de {p}.", "{p} cobra e o goleiro defende.", "Pênalti perdido por {p}.", "{p} isolou o pênalti.", "A cobrança de {p} para fora.", "Defesa no pênalti de {p}."], vars: { p: taker?.name ?? "o cobrador", team: side.name }, big: true, stoppage: state.stoppagePlayed || undefined });
    return;
  }
  const beforeHome = state.score[0];
  const beforeAway = state.score[1];
  if (sideName === "home") state.score[0] += 1;
  else state.score[1] += 1;
  pushEvent(state, { minute: clockLabel(state), kind: "goal", side: sideName, teamId: side.clubId, playerId: taker?.id, lines: goalLines(sideName, beforeHome, beforeAway, state.score[0], state.score[1]), vars: { p: taker?.name ?? "o cobrador", team: side.name, score: `${state.score[0]} a ${state.score[1]}` }, big: true, stoppage: state.stoppagePlayed || undefined });
}

export function simulateMatch(home: Side, away: Side, seed: number): MatchResult {
  let state = initMatch(home, away, seed, { homeAi: home.ai ?? false, awayAi: away.ai ?? false, kind: "league" });
  let guard = 0;
  while (state.period !== "FT" && guard < 160) {
    if (state.period === "HT") state = applyCommand(state, { type: "resume" });
    else state = stepMinute(state).state;
    guard += 1;
  }
  return {
    homeId: state.home.clubId,
    awayId: state.away.clubId,
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    events: state.events,
    shots: state.shots,
    cards: state.cards,
    injuries: state.injuries,
    seed,
    substitutions: state.substitutions,
  };
}

export function displayMinute(state: ClockState): string {
  const phase = livePhase(state);
  if (phase === "halfTime") return "INTERVALO";
  if (phase === "penalties") return "PÊNALTIS";
  if (phase === "fullTime") return "FIM";
  if (state.stoppagePlayed > 0) return `${state.minute}+${state.stoppagePlayed}`;
  return `${state.minute}'`;
}
