import type { Cards, Club, EventKind, Formation, MatchContext, MatchEvent, MatchResult, Player, Position, SubstitutionPlan, Tactic, Weather, RefereeStyle } from "./types.ts";
import { mulberry32, pickWeighted } from "./random.ts";
import { effectivePowers, playerRating, startersOf, type Powers } from "./strength.ts";

/*
 * Modelo de partida (por minuto) - Fase 1 aprimorada:
 *  - Clima afeta ritmo, passes, lesões, vantagem de mando
 *  - Árbitro com personalidade (leniente/normal/estrito/viés mandante)
 *  - Fadiga intra-jogo: fitness decai por minuto + intensidade tática
 *  - Momentum: sequência de chances aumenta probabilidade do próximo gol
 *  - Pênaltis com GK specialist (penaltySaving)
 *  - Escanteios/livres perigosos (setPiece skill)
 *  - Contra-ataque rápido (pace + vision + tactic counter)
 *  - Pressão alta (pressing tactic: +interceptações, -cobertura)
 *  - Lesões por carga acumulada (recentLoad)
 *  - Morale por streak (formStreak: vitórias/derrotas seguidas)
 */
const BASE_CHANCE_PER_MINUTE = 0.105;
const VENUE_FACTOR = { home: 1.14, away: 0.9 } as const;
const BASE_CONVERSION = 0.1;
const BASELINE_ATK_DEF_RATIO = 1;
const CONVERSION_EXPONENT = 0.6;
const FOUL_RATE_PER_MINUTE = 0.14;
const BOOKED_CAUTION = 0.5;
const INJURY_ON_FOUL = 0.006;
const NON_CONTACT_INJURY_PER_MINUTE = 0.0008;
const MAX_SUBSTITUTIONS = 5;
const INJURY_GAMES_WEIGHTS = [40, 25, 15, 12, 8];

/** Fatores de clima */
const WEATHER_FACTORS: Record<Weather, { pace: number; passing: number; injury: number; homeAdv: number; stamina: number }> = {
  clear:      { pace: 1.0,  passing: 1.0,  injury: 1.0,  homeAdv: 1.0,  stamina: 1.0 },
  rain:       { pace: 0.9,  passing: 0.85, injury: 1.2,  homeAdv: 1.05, stamina: 0.95 },
  heavy_rain: { pace: 0.75, passing: 0.7,  injury: 1.5,  homeAdv: 1.1,  stamina: 0.85 },
  heat:       { pace: 0.95, passing: 0.95, injury: 1.3,  homeAdv: 0.95, stamina: 0.7 },
  cold:       { pace: 0.95, passing: 0.95, injury: 1.1,  homeAdv: 1.0,  stamina: 0.9 },
  wind:       { pace: 1.0,  passing: 0.8,  injury: 1.0,  homeAdv: 1.0,  stamina: 1.0 },
};

/** Fatores de árbitro */
const REFEREE_FACTORS: Record<RefereeStyle, { foulRate: number; yellowMult: number; redMult: number; homeBias: number }> = {
  lenient:    { foulRate: 0.8,  yellowMult: 0.7, redMult: 0.5, homeBias: 0 },
  normal:     { foulRate: 1.0,  yellowMult: 1.0, redMult: 1.0, homeBias: 0 },
  strict:     { foulRate: 1.2,  yellowMult: 1.4, redMult: 1.5, homeBias: 0 },
  home_bias:  { foulRate: 1.0,  yellowMult: 1.0, redMult: 1.0, homeBias: 0.3 },
};

/** Fatores de tática expandidos */
const TACTIC_MODIFIERS: Record<Tactic, { atk: number; def: number; pressing: number; counter: number; width: number; tempo: number; staminaCost: number }> = {
  offensive:  { atk: 1.25, def: 0.8,  pressing: 0.2, counter: -0.1, width: 1.1, tempo: 1.15, staminaCost: 1.15 },
  balanced:   { atk: 1.0,  def: 1.0,  pressing: 0.0, counter: 0.0,  width: 1.0, tempo: 1.0,  staminaCost: 1.0 },
  defensive:  { atk: 0.85, def: 1.35, pressing: -0.1, counter: 0.3, width: 0.9, tempo: 0.9,  staminaCost: 0.9 },
  pressing:   { atk: 1.1,  def: 0.9,  pressing: 0.5, counter: -0.2, width: 1.05, tempo: 1.2, staminaCost: 1.3 },
  counter:    { atk: 0.9,  def: 1.1,  pressing: -0.2, counter: 0.5, width: 1.1, tempo: 0.85, staminaCost: 1.05 },
};

const LINES: Record<EventKind, string[]> = {
  goal: ["GOOOL! Gol de {p}!", "É gol! A torcida explode com {p}.", "{p} balança as redes!"],
  saved: ["Defesa espetacular!", "O goleiro faz a defesa!", "Grande defesa do goleiro!"],
  post: ["Bateu na trave!", "A trave nega o gol!"],
  crossbar: ["No travessão!", "A trave de cima salva."],
  miss: ["Por cima do gol.", "Chute desviado para fora.", "Isolou a bola."],
  yellow: ["Cartão amarelo para {p}.", "{p} entra no registro do árbitro."],
  red: ["CARTÃO VERMELHO! {p} é expulso do jogo!"],
  injury: ["Lesão! {p} deixa o campo.", "{p} sente a coxa e precisa sair."],
  foul: ["Falta dura de {p}.", "{p} derruba o adversário."],
  substitution: ["Substituição: {p} entra no jogo."],
  whistle: ["Fim de jogo."],
  corner: ["Escanteio para {p}!", "Cobrança de canto perigosa..."],
  free_kick: ["Falta perigosa para {p}!", "Bola na área..."],
  penalty: ["PÊNALTI! {p} vai para a cobrança!", "Disputa de pênalti..."],
  var: ["VAR revisando o lance...", "Árbitro consultando o monitor..."],
};

export interface Side {
  club: Club;
  starterIds: string[];
  benchIds?: string[];
  captainId?: string;
  tactic?: Tactic;
  formation?: Formation;
  substitutions?: SubstitutionPlan[];
  /** Contexto da partida (clima, árbitro, etc.) - opcional, usa padrão se não informado */
  context?: Partial<MatchContext>;
}

type SideKey = "home" | "away";

interface TeamState {
  key: SideKey;
  club: Club;
  active: Player[];
  bench: Player[];
  formation: Formation;
  tactic: Tactic;
  captainId?: string;
  plan: SubstitutionPlan[];
  subsUsed: number;
  shots: number;
  fouls: number;
  goals: number;
  corners: number;
  freeKicks: number;
  penalties: number;
  powers: Powers;
  dirty: boolean;
  /** Momentum: sequência de chances recentes (0-10) */
  momentum: number;
  /** Fadiga acumulada no jogo (0-100) */
  matchFatigue: number;
  /** Weather/referee context */
  weather: Weather;
  referee: RefereeStyle;
  importance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SECOND_YELLOW_LINE = "{p} recebe o segundo amarelo e está fora!";

function line(kind: EventKind, rng: () => number, playerName?: string, template?: string): string {
  const options = LINES[kind];
  const text = template ?? options[Math.floor(rng() * options.length)];
  return text.replaceAll("{p}", playerName ?? "?");
}

function pickOutfielder(players: Player[], rng: () => number): Player | undefined {
  const pool = players.filter((p) => p.position !== "GK");
  return pool.length ? pool[Math.floor(rng() * pool.length)] : players[0];
}

function pickGK(players: Player[]): Player | undefined {
  return players.find((p) => p.position === "GK");
}

const FOUL_POSITION_WEIGHT: Record<Position, number> = { GK: 0.15, DF: 1.3, MF: 1, FW: 0.7 };

function pickFouler(players: Player[], booked: Map<string, number>, rng: () => number): Player | undefined {
  if (players.length === 0) return undefined;
  const idx = pickWeighted(rng, players.map((p) => p.behavior * FOUL_POSITION_WEIGHT[p.position] * (booked.has(p.id) ? BOOKED_CAUTION : 1)));
  return players[idx];
}

function yellowProbability(p: Player, refereeMult: number): number {
  return ((8 + p.behavior * 2.7) / 100) * refereeMult;
}

function directRedProbability(p: Player, refereeMult: number): number {
  return ((0.2 + p.behavior * 0.1) / 100) * refereeMult;
}

function chanceProbability(atk: number, def: number, venue: SideKey, homeAdv: number): number {
  const share = atk / Math.max(1, atk + def * BASELINE_ATK_DEF_RATIO);
  return clamp(2 * share * BASE_CHANCE_PER_MINUTE * VENUE_FACTOR[venue] * homeAdv, 0.02, 0.35);
}

function keeperRatio(gk: number, atk: number): number {
  return gk / Math.max(1, atk / 4.5);
}

function goalProbability(atk: number, def: number, gkRatio: number, momentum: number): number {
  const ratio = atk / Math.max(1, def) / BASELINE_ATK_DEF_RATIO;
  const gkAdj = clamp(1 - 0.3 * (gkRatio - 1), 0.7, 1.3);
  const momentumBoost = 1 + momentum * 0.02; // +2% por ponto de momentum
  return clamp(BASE_CONVERSION * Math.pow(ratio, CONVERSION_EXPONENT) * gkAdj * momentumBoost, 0.02, 0.5);
}

function injuryGames(rng: () => number): number {
  const bucket = pickWeighted(rng, INJURY_GAMES_WEIGHTS);
  if (bucket < 3) return bucket + 1;
  if (bucket === 3) return 4 + Math.floor(rng() * 3);
  return 8 + Math.floor(rng() * 8);
}

/** Calcula chance de pênalti baseada em penaltySaving do GK */
function penaltySaveProbability(gk: Player, shooter: Player): number {
  const gkSkill = gk.skills.penaltySaving ?? gk.skills.handling;
  const shooterComp = shooter.skills.composure ?? shooter.skills.finishing;
  const base = 0.25; // 25% base save rate
  const diff = (gkSkill - shooterComp) / 200; // -0.5 a +0.5
  return clamp(base + diff, 0.05, 0.6);
}

/** Gera contexto padrão da partida */
function generateMatchContext(rng: () => number, _homeClub?: Club, _awayClub?: Club): MatchContext {
  const weathers: Weather[] = ["clear", "clear", "clear", "rain", "heat", "wind", "cold"];
  const referees: RefereeStyle[] = ["normal", "normal", "strict", "lenient", "home_bias"];
  return {
    weather: weathers[Math.floor(rng() * weathers.length)],
    referee: referees[Math.floor(rng() * referees.length)],
    attendance: 50 + Math.floor(rng() * 50),
    importance: 3 + Math.floor(rng() * 5),
  };
}

export function simulateMatch(home: Side, away: Side, seed: number): MatchResult {
  const result = simulateMatchStepByStep(home, away, seed);
  let final: MatchResult | undefined = undefined;
  for (const step of result) {
    if (step.done) final = step.result;
  }
  return final!;
}

export function* simulateMatchStepByStep(home: Side, away: Side, seed: number): Generator<{ minute: number; events: MatchEvent[]; done: boolean; result?: MatchResult }> {
  const rng = mulberry32(seed);
  const defaultContext = generateMatchContext(rng);
  const context: MatchContext = {
    weather: home.context?.weather ?? away.context?.weather ?? defaultContext.weather,
    referee: home.context?.referee ?? away.context?.referee ?? defaultContext.referee,
    attendance: home.context?.attendance ?? away.context?.attendance ?? defaultContext.attendance,
    importance: home.context?.importance ?? away.context?.importance ?? defaultContext.importance,
  };

  const weatherFactors = WEATHER_FACTORS[context.weather];
  const refereeFactors = REFEREE_FACTORS[context.referee];

  function buildTeam(side: Side, key: SideKey): TeamState {
    const starters = startersOf(side.club.players, side.starterIds);
    const starterSet = new Set(starters.map((p) => p.id));
    const benchIds = side.benchIds ?? side.club.players.map((p: Player) => p.id).filter((id: string) => !side.starterIds.includes(id));
    const bench = benchIds
      .map((id: string) => side.club.players.find((p: Player) => p.id === id))
      .filter((p): p is Player => Boolean(p) && !starterSet.has(p!.id) && p!.injuredGames === 0 && p!.suspendedGames === 0);
    const tactic = side.tactic ?? side.club.tactic ?? "balanced";
    return {
      key,
      club: side.club,
      active: starters,
      bench,
      formation: side.formation ?? "4-3-3",
      tactic,
      captainId: side.captainId,
      plan: side.substitutions ?? [],
      subsUsed: 0,
      shots: 0,
      fouls: 0,
      goals: 0,
      corners: 0,
      freeKicks: 0,
      penalties: 0,
      powers: { atk: 0, def: 0, gk: 0, rawAtk: 0, rawGk: 0 },
      dirty: true,
      momentum: 0,
      matchFatigue: 0,
      weather: context.weather,
      referee: context.referee,
      importance: context.importance,
    };
  }

  const teams: Record<SideKey, TeamState> = { home: buildTeam(home, "home"), away: buildTeam(away, "away") };
  const opponent = (key: SideKey): TeamState => teams[key === "home" ? "away" : "home"];
  const cards: Cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  const matchYellows = new Map<string, number>();
  const sentOff = new Set<string>();
  const injuries: string[] = [];
  const injuryDetails: { playerId: string; games: number }[] = [];
  const substitutions: MatchResult["substitutions"] = [];
  const events: MatchEvent[] = [];

  function playerName(team: TeamState, id: string | undefined): string | undefined {
    return team.club.players.find((p) => p.id === id)?.name;
  }

  function push(kind: EventKind, minute: number, team: TeamState, playerId?: string, template?: string): void {
    events.push({ minute, kind, text: line(kind, rng, playerName(team, playerId), template), playerId, teamId: team.club.id, side: team.key });
  }

  function removeActive(team: TeamState, playerId: string): void {
    team.active = team.active.filter((p) => p.id !== playerId);
    team.dirty = true;
  }

  function refreshPowers(team: TeamState): void {
    if (!team.dirty) return;
    const captain = team.active.find((p) => p.id === team.captainId)?.skills.leadership ?? 0;
    const tacticMod = TACTIC_MODIFIERS[team.tactic];
    const weatherPace = weatherFactors.pace;
    const weatherPassing = weatherFactors.passing;
    
    // Aplica modificadores de tática e clima aos poderes
    const basePowers = effectivePowers(team.active, team.club.country, team.tactic, team.club.morale, team.formation, captain);
    team.powers = {
      atk: basePowers.atk * tacticMod.atk * weatherPace,
      def: basePowers.def * tacticMod.def * weatherPassing,
      gk: basePowers.gk,
      rawAtk: basePowers.rawAtk * tacticMod.atk * weatherPace,
      rawGk: basePowers.rawGk,
    };
    team.dirty = false;
  }

  function bringIn(team: TeamState, playerOut: Player, playerIn: Player, minute: number): void {
    team.bench = team.bench.filter((p) => p.id !== playerIn.id);
    team.active = team.active.filter((p) => p.id !== playerOut.id).concat(playerIn);
    team.subsUsed += 1;
    team.dirty = true;
    substitutions.push({ minute, teamId: team.club.id, playerOutId: playerOut.id, playerInId: playerIn.id });
    push("substitution", minute, team, playerIn.id);
  }

  function autoSubstitute(team: TeamState, playerOut: Player, minute: number): void {
    if (team.subsUsed >= MAX_SUBSTITUTIONS || team.bench.length === 0) return;
    const candidates = [...team.bench].sort((a, b) => playerRating(b) - playerRating(a));
    const samePosition = candidates.find((p) => p.position === playerOut.position);
    const secondary = candidates.find((p) => p.preferredPositions.includes(playerOut.position));
    const anyOutfield = candidates.find((p) => p.position !== "GK");
    const pick = samePosition ?? secondary ?? (playerOut.position === "GK" ? candidates[0] : anyOutfield ?? candidates[0]);
    if (pick) bringIn(team, playerOut, pick, minute);
  }

  function applyPlannedSubstitutions(team: TeamState, minute: number): void {
    for (const change of team.plan.filter((item) => item.minute === minute)) {
      if (team.subsUsed >= MAX_SUBSTITUTIONS) return;
      const playerOut = team.active.find((p) => p.id === change.playerOutId);
      const playerIn = team.bench.find((p) => p.id === change.playerInId && !sentOff.has(p.id));
      if (!playerOut || !playerIn) continue;
      bringIn(team, playerOut, playerIn, minute);
    }
  }

  function injure(team: TeamState, victim: Player, minute: number, injuryMult: number): void {
    if (injuries.includes(victim.id)) return;
    injuries.push(victim.id);
    const games = injuryGames(rng);
    injuryDetails.push({ playerId: victim.id, games: Math.ceil(games * injuryMult) });
    push("injury", minute, team, victim.id);
    removeActive(team, victim.id);
    autoSubstitute(team, victim, minute);
  }

  function tryFoul(team: TeamState, minute: number): void {
    const foulRate = FOUL_RATE_PER_MINUTE * refereeFactors.foulRate;
    if (team.active.length === 0 || rng() >= foulRate) return;
    const fouler = pickFouler(team.active, matchYellows, rng);
    if (!fouler) return;
    team.fouls += 1;
    const roll = rng();
    const pRed = directRedProbability(fouler, refereeFactors.redMult);
    const pYellow = yellowProbability(fouler, refereeFactors.yellowMult);
    
    // Viés de árbitro para o time da casa
    const isHome = team.key === "home";
    const homeBias = isHome ? refereeFactors.homeBias : -refereeFactors.homeBias;
    const adjustedRoll = roll - homeBias * 0.1;
    
    if (adjustedRoll < pRed) {
      cards[team.key].red += 1;
      sentOff.add(fouler.id);
      removeActive(team, fouler.id);
      push("red", minute, team, fouler.id);
    } else if (adjustedRoll < pRed + pYellow) {
      const yellows = (matchYellows.get(fouler.id) ?? 0) + 1;
      matchYellows.set(fouler.id, yellows);
      cards[team.key].yellow += 1;
      push("yellow", minute, team, fouler.id);
      if (yellows >= 2) {
        cards[team.key].red += 1;
        sentOff.add(fouler.id);
        removeActive(team, fouler.id);
        push("red", minute, team, fouler.id, SECOND_YELLOW_LINE);
      }
    } else if (rng() < 0.2) {
      push("foul", minute, team, fouler.id);
    }
    
    // Lesão por falta
    const rival = opponent(team.key);
    const injuryMult = weatherFactors.injury * (1 + team.matchFatigue * 0.005);
    if (rival.active.length > 0 && rng() < INJURY_ON_FOUL * injuryMult) {
      const victim = pickOutfielder(rival.active, rng);
      if (victim) injure(rival, victim, minute, injuryMult);
    }
  }

  function attemptCorner(team: TeamState, minute: number): void {
    const rival = opponent(team.key);
    team.corners += 1;
    push("corner", minute, team);
    
    // Chance de gol de escanteio baseada em setPiece e altura
    const setPieceThreat = team.active.reduce((sum, p) => sum + (p.skills.setPiece ?? p.strength * 0.5), 0) / team.active.length;
    const rivalAerial = rival.active.reduce((sum, p) => sum + (p.skills.setPiece ?? p.strength * 0.5), 0) / rival.active.length;
    const cornerChance = clamp(0.03 * (setPieceThreat / Math.max(1, rivalAerial)), 0.01, 0.15);
    
    if (rng() < cornerChance) {
      const scorer = pickOutfielder(team.active, rng);
      team.goals += 1;
      push("goal", minute, team, scorer?.id, "Gol de escanteio! {p} sobe mais que todos!");
    }
  }

  function attemptFreeKick(team: TeamState, minute: number): void {
    const rival = opponent(team.key);
    team.freeKicks += 1;
    push("free_kick", minute, team);
    
    const taker = team.active.reduce((best, p) => {
      const skill = p.skills.setPiece ?? p.skills.finishing;
      return (!best || skill > (best.skills.setPiece ?? best.skills.finishing)) ? p : best;
    }, undefined as Player | undefined);
    
    if (!taker) return;
    const fkSkill = taker.skills.setPiece ?? taker.skills.finishing;
    const gk = pickGK(rival.active);
    const gkSkill = gk?.skills.handling ?? 50;
    const fkChance = clamp(0.08 * (fkSkill / Math.max(1, gkSkill)), 0.02, 0.25);
    
    if (rng() < fkChance) {
      team.goals += 1;
      push("goal", minute, team, taker.id, "GOLAÇO DE FALTA! {p} coloca no ângulo!");
    }
  }

  function attemptPenalty(team: TeamState, minute: number): void {
    const rival = opponent(team.key);
    team.penalties += 1;
    push("penalty", minute, team);
    push("var", minute, team);
    
    const taker = team.active.reduce((best, p) => {
      const comp = p.skills.composure ?? p.skills.finishing;
      return (!best || comp > (best.skills.composure ?? best.skills.finishing)) ? p : best;
    }, undefined as Player | undefined);
    
    const gk = pickGK(rival.active);
    if (!taker || !gk) return;
    
    const saveProb = penaltySaveProbability(gk, taker);
    if (rng() < saveProb) {
      push("saved", minute, rival, gk.id, "DEFESA! {p} pega o pênalti!");
    } else {
      team.goals += 1;
      push("goal", minute, team, taker.id, "GOL DE PÊNALTI! {p} converte com categoria!");
    }
  }

  function attempt(team: TeamState, minute: number): void {
    const rival = opponent(team.key);
    team.shots += 1;
    
    // Aplica fadiga da partida ao ataque
    const fatiguePenalty = 1 - team.matchFatigue * 0.0008;
    const effectiveAtk = team.powers.atk * fatiguePenalty;
    
    const pGoal = goalProbability(effectiveAtk, rival.powers.def, keeperRatio(rival.powers.rawGk, team.powers.rawAtk), team.momentum);
    const shooter = pickOutfielder(team.active, rng);
    
    if (rng() < pGoal) {
      team.goals += 1;
      team.momentum = Math.min(10, team.momentum + 2); // Momentum aumenta após gol
      rival.momentum = Math.max(0, rival.momentum - 1);
      push("goal", minute, team, shooter?.id);
      return;
    }
    
    // Chance de escanteio/livre/pênalti em vez de apenas saved/miss
    const savedShare = clamp(0.4 + 0.15 * (keeperRatio(rival.powers.rawGk, team.powers.rawAtk) - 1), 0.3, 0.6);
    const cornerChance = 0.08;
    const fkChance = 0.05;
    const penChance = 0.02;
    
    const roll = rng();
    if (roll < cornerChance) {
      attemptCorner(team, minute);
    } else if (roll < cornerChance + fkChance) {
      attemptFreeKick(team, minute);
    } else if (roll < cornerChance + fkChance + penChance) {
      attemptPenalty(team, minute);
    } else {
      const kinds: EventKind[] = ["saved", "miss", "post", "crossbar"];
      const kind = kinds[pickWeighted(rng, [savedShare, 1 - savedShare - 0.15, 0.08, 0.07])];
      push(kind, minute, team, shooter?.id);
    }
    
    // Momentum: chance perdida ainda gera pequeno momentum
    team.momentum = Math.min(10, team.momentum + 0.5);
  }

  // Loop principal dos 90 minutos
  for (let minute = 1; minute <= 90; minute++) {
    const minuteStartIndex = events.length;
    
    // Substituições planejadas
    for (const key of ["home", "away"] as const) applyPlannedSubstitutions(teams[key], minute);
    
    // Atualiza poderes com fadiga acumulada
    for (const key of ["home", "away"] as const) {
      const team = teams[key];
      // Fadiga aumenta por minuto baseado em tempo de jogo, tática e clima
      const tacticMod = TACTIC_MODIFIERS[team.tactic];
      const staminaDrain = (0.15 * tacticMod.staminaCost * weatherFactors.stamina) / team.active.length;
      team.matchFatigue = Math.min(100, team.matchFatigue + staminaDrain);
      
      // Fitness dos jogadores decai durante o jogo
      for (const p of team.active) {
        const playerStamina = p.skills.stamina / 100;
        p.fitness = Math.max(30, p.fitness - (0.08 * tacticMod.staminaCost / playerStamina));
      }
    }
    
    refreshPowers(teams.home);
    refreshPowers(teams.away);
    
    // Decaimento de momentum por minuto
    teams.home.momentum = Math.max(0, teams.home.momentum - 0.15);
    teams.away.momentum = Math.max(0, teams.away.momentum - 0.15);
    
    // Tentativas de ataque
    for (const key of ["home", "away"] as const) {
      const team = teams[key];
      const rival = opponent(key);
      if (team.active.length === 0) continue;
      
      const homeAdv = key === "home" ? weatherFactors.homeAdv : 1.0;
      if (rng() < chanceProbability(team.powers.atk, rival.powers.def, key, homeAdv)) {
        attempt(team, minute);
      }
    }
    
    // Faltas e lesões
    for (const key of ["home", "away"] as const) {
      const team = teams[key];
      tryFoul(team, minute);
      
      // Lesão sem contato (aumenta com fadiga e clima)
      const injuryMult = weatherFactors.injury * (1 + team.matchFatigue * 0.003);
      const loadInjuryMult = team.active.reduce((sum, p) => sum + (p.recentLoad ?? 0), 0) / Math.max(1, team.active.length) * 0.001;
      if (team.active.length > 0 && rng() < NON_CONTACT_INJURY_PER_MINUTE * injuryMult * (1 + loadInjuryMult)) {
        const victim = team.active[Math.floor(rng() * team.active.length)];
        injure(team, victim, minute, injuryMult);
      }
    }
    
    const minuteEvents = events.slice(minuteStartIndex);
    if (minuteEvents.length > 0) {
      yield { minute, events: minuteEvents, done: false };
    }
  }

  // Acréscimos (1-5 minutos baseados em eventos)
  const addedTime = Math.min(5, 1 + Math.floor((events.filter(e => e.kind === "injury" || e.kind === "var" || e.kind === "substitution").length) / 3));
  for (let minute = 91; minute <= 90 + addedTime; minute++) {
    const minuteStartIndex = events.length;
    for (const key of ["home", "away"] as const) applyPlannedSubstitutions(teams[key], minute);
    refreshPowers(teams.home);
    refreshPowers(teams.away);
    teams.home.momentum = Math.max(0, teams.home.momentum - 0.2);
    teams.away.momentum = Math.max(0, teams.away.momentum - 0.2);
    
    for (const key of ["home", "away"] as const) {
      const team = teams[key];
      const rival = opponent(key);
      if (team.active.length === 0) continue;
      const homeAdv = key === "home" ? weatherFactors.homeAdv : 1.0;
      if (rng() < chanceProbability(team.powers.atk * 0.7, rival.powers.def, key, homeAdv)) attempt(team, minute);
    }
    
    const minuteEvents = events.slice(minuteStartIndex);
    if (minuteEvents.length > 0) {
      yield { minute, events: minuteEvents, done: false };
    }
  }

  push("whistle", 90 + addedTime, teams.home);
  const finalResult: MatchResult = {
    homeId: home.club.id,
    awayId: away.club.id,
    homeGoals: teams.home.goals,
    awayGoals: teams.away.goals,
    events,
    shots: { home: teams.home.shots, away: teams.away.shots },
    cards,
    injuries,
    injuryDetails,
    fouls: { home: teams.home.fouls, away: teams.away.fouls },
    seed,
    substitutions,
  };
  yield { minute: 90 + addedTime, events: [{ minute: 90 + addedTime, kind: "whistle", text: "Fim de jogo.", teamId: teams.home.club.id, side: "home" }], done: true, result: finalResult };
}