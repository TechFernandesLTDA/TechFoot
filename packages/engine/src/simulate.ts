import type { Cards, Club, EventKind, Formation, MatchEvent, MatchResult, Player, SubstitutionPlan, Tactic } from "./types.ts";
import { mulberry32, pickWeighted } from "./random.ts";
import { effectivePowers, startersOf } from "./strength.ts";

const OUTCOME_WEIGHTS = [55, 18, 8, 7, 12];
const KINDS: EventKind[] = ["goal", "saved", "post", "crossbar", "miss"];
const LINES: Record<EventKind, string[]> = {
  goal: ["GOOOL! Gol de {p}!", "É gol! A torcida explode com {p}."],
  saved: ["Defesa espetacular!", "O goleiro faz a defesa!"],
  post: ["Bateu na trave!", "A trave nega o gol!"],
  crossbar: ["No travessão!", "A trave de cima salva."],
  miss: ["Por cima do gol.", "Chute desviado para fora."],
  yellow: ["Cartão amarelo para {p}.", "{p} entra no registro do árbitro."],
  red: ["CARTÃO VERMELHO! {p} é expulso do jogo!"],
  injury: ["Lesão! {p} deixa o campo.", "{p} sente a coxa e precisa sair."],
  foul: ["Falta de {p}.", "{p} derruba o adversário."],
  substitution: ["Substituição: {p} entra no jogo."],
  whistle: ["Fim de jogo."],
};

export interface Side {
  club: Club;
  starterIds: string[];
  benchIds?: string[];
  captainId?: string;
  tactic?: Tactic;
  formation?: Formation;
  substitutions?: SubstitutionPlan[];
}

function line(kind: EventKind, rng: () => number, playerName?: string): string {
  const options = LINES[kind];
  return options[Math.floor(rng() * options.length)].replaceAll("{p}", playerName ?? "?");
}

function pickOutfielder(players: Player[], rng: () => number): Player | undefined {
  const pool = players.filter((p) => p.position !== "GK");
  return pool.length ? pool[Math.floor(rng() * pool.length)] : players[0];
}

function foulWeights(player: Player): number[] {
  return [12 + player.behavior * 10, 2 + player.behavior * 2, 1 + player.behavior];
}

export function simulateMatch(home: Side, away: Side, seed: number): MatchResult {
  const rng = mulberry32(seed);
  let homeActive = startersOf(home.club.players, home.starterIds);
  let awayActive = startersOf(away.club.players, away.starterIds);
  const homeBench = (home.benchIds ?? home.club.players.map((p) => p.id).filter((id) => !home.starterIds.includes(id))).map((id) => home.club.players.find((p) => p.id === id)).filter((p): p is Player => Boolean(p));
  const awayBench = (away.benchIds ?? away.club.players.map((p) => p.id).filter((id) => !away.starterIds.includes(id))).map((id) => away.club.players.find((p) => p.id === id)).filter((p): p is Player => Boolean(p));
  const formationHome = home.formation ?? "4-3-3";
  const formationAway = away.formation ?? "4-3-3";
  const tacticHome = home.tactic ?? "balanced";
  const tacticAway = away.tactic ?? "balanced";
  const cards: Cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  const matchYellows = new Map<string, number>();
  const sentOff = new Set<string>();
  const injuries: string[] = [];
  const substitutions: MatchResult["substitutions"] = [];
  const events: MatchEvent[] = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;

  function playerName(id: string | undefined, side: "home" | "away"): string | undefined {
    const players = side === "home" ? home.club.players : away.club.players;
    return players.find((p) => p.id === id)?.name;
  }

  function push(kind: EventKind, minute: number, side: "home" | "away", teamId: string, playerId?: string, textPlayerId?: string): void {
    events.push({ minute, kind, text: line(kind, rng, playerName(textPlayerId ?? playerId, side)), playerId, teamId, side });
  }

  function tryFoul(minute: number, side: "home" | "away", players: Player[], teamId: string): void {
    if (players.length === 0 || rng() >= 0.028) return;
    const player = pickOutfielder(players, rng);
    if (!player) return;
    const kind = pickWeighted(rng, foulWeights(player));
    if (kind === 2) {
      cards[side].red += 1;
      sentOff.add(player.id);
      if (side === "home") homeActive = homeActive.filter((item) => item.id !== player.id);
      else awayActive = awayActive.filter((item) => item.id !== player.id);
      push("red", minute, side, teamId, player.id);
      return;
    }
    if (kind === 1) {
      const yellows = (matchYellows.get(player.id) ?? 0) + 1;
      matchYellows.set(player.id, yellows);
      cards[side].yellow += 1;
      if (yellows >= 2) {
        cards[side].red += 1;
        sentOff.add(player.id);
        if (side === "home") homeActive = homeActive.filter((item) => item.id !== player.id);
        else awayActive = awayActive.filter((item) => item.id !== player.id);
        push("yellow", minute, side, teamId, player.id);
        push("red", minute, side, teamId, player.id);
      } else {
        push("yellow", minute, side, teamId, player.id);
      }
      return;
    }
    push("foul", minute, side, teamId, player.id);
  }

  function applySubstitutions(minute: number, side: "home" | "away", plan: SubstitutionPlan[] | undefined, teamId: string): void {
    if (!plan) return;
    for (const change of plan.filter((item) => item.minute === minute)) {
      const active = side === "home" ? homeActive : awayActive;
      const bench = side === "home" ? homeBench : awayBench;
      const outIndex = active.findIndex((p) => p.id === change.playerOutId);
      const inIndex = bench.findIndex((p) => p.id === change.playerInId && !sentOff.has(p.id));
      if (outIndex < 0 || inIndex < 0) continue;
      const playerIn = bench.splice(inIndex, 1)[0];
      const playerOut = active[outIndex];
      active[outIndex] = playerIn;
      substitutions.push({ minute, teamId, playerOutId: playerOut.id, playerInId: playerIn.id });
      push("substitution", minute, side, teamId, playerIn.id, playerIn.id);
    }
  }

  function attempt(minute: number, attackPlayers: Player[], atkPower: number, defPower: number, gkPower: number, side: "home" | "away", teamId: string): boolean {
    if (attackPlayers.length === 0) return false;
    if (rng() * atkPower * 1.2 <= rng() * defPower) {
      if (rng() < 0.018) {
        const victim = pickOutfielder(attackPlayers, rng);
        if (victim && !injuries.includes(victim.id)) {
          injuries.push(victim.id);
          push("injury", minute, side, teamId, victim.id);
          if (side === "home") homeActive = homeActive.filter((p) => p.id !== victim.id);
          else awayActive = awayActive.filter((p) => p.id !== victim.id);
        }
      }
      return false;
    }
    let kind = KINDS[pickWeighted(rng, OUTCOME_WEIGHTS)];
    if (kind === "goal" && rng() < Math.min(0.5, gkPower / 300)) kind = "saved";
    const featured = pickOutfielder(attackPlayers, rng);
    push(kind, minute, side, teamId, featured?.id, kind === "goal" ? featured?.id : undefined);
    return kind === "goal";
  }

  for (let minute = 1; minute <= 90; minute++) {
    applySubstitutions(minute, "home", home.substitutions, home.club.id);
    applySubstitutions(minute, "away", away.substitutions, away.club.id);
    const currentHomeCaptain = homeActive.find((player) => player.id === home.captainId)?.skills.leadership ?? 0;
    const currentAwayCaptain = awayActive.find((player) => player.id === away.captainId)?.skills.leadership ?? 0;
    const homePower = effectivePowers(homeActive, home.club.country, tacticHome, home.club.morale, formationHome, currentHomeCaptain);
    const awayPower = effectivePowers(awayActive, away.club.country, tacticAway, away.club.morale, formationAway, currentAwayCaptain);
    const homeChance = rng() * 6000 < homePower.atk || rng() < 1 / 180;
    const awayChance = rng() * 7000 < awayPower.atk || rng() < 1 / 270;
    if (homeChance) {
      homeShots += 1;
      if (attempt(minute, homeActive, homePower.atk, awayPower.def, awayPower.gk, "home", home.club.id)) homeGoals += 1;
    }
    if (awayChance) {
      awayShots += 1;
      if (attempt(minute, awayActive, awayPower.atk, homePower.def, homePower.gk, "away", away.club.id)) awayGoals += 1;
    }
    tryFoul(minute, "home", homeActive, home.club.id);
    tryFoul(minute, "away", awayActive, away.club.id);
  }

  push("whistle", 90, "home", home.club.id);
  return { homeId: home.club.id, awayId: away.club.id, homeGoals, awayGoals, events, shots: { home: homeShots, away: awayShots }, cards, injuries, seed, substitutions };
}
