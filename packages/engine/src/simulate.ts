import type { Cards, Club, EventKind, MatchEvent, MatchResult, Player, Tactic } from "./types.ts";
import { mulberry32, pickWeighted } from "./random.ts";
import { effectivePowers, startersOf } from "./strength.ts";

const OUTCOME_WEIGHTS = [55, 18, 8, 7, 12];
const KINDS: EventKind[] = ["goal", "saved", "post", "crossbar", "miss"];

const LINES: Record<EventKind, string[]> = {
  goal: ["GOOOL! Gol de {p}!", "É gol! A torcida explode com {p}."],
  saved: ["{p} espalma! Defesa espetacular!", "O goleiro {p} faz a defesa!"],
  post: ["Bateu na trave!", "A trave nega o gol!"],
  crossbar: ["No travessão!", "A trave de cima salva."],
  miss: ["Por cima do gol.", "Chute desviado para fora."],
  yellow: ["Cartão amarelo para {p}.", "{p} entra no registro do árbitro."],
  red: ["CARTÃO VERMELHO! {p} é expulso do jogo!"],
  injury: ["Lesão! {p} deixa o campo.", "{p} sente a coxa e precisa sair."],
  foul: ["Falta de {p}.", "{p} derruba o adversário."],
  whistle: ["Fim de jogo."],
};

export interface Side {
  club: Club;
  starterIds: string[];
  tactic: Tactic;
}

function line(kind: EventKind, rng: () => number, playerName?: string): string {
  const opts = LINES[kind];
  const tpl = opts[Math.floor(rng() * opts.length)];
  return tpl.replaceAll("{p}", playerName ?? "?");
}

function pickOutfielder(starters: Player[], rng: () => number): Player {
  const pool = starters.filter((p) => p.position !== "GK");
  return pool.length ? pool[Math.floor(rng() * pool.length)] : starters[0];
}

function foulWeights(p: Player): number[] {
  const a = p.behavior; // 1..5
  return [12 + a * 10, 2 + a * 2, 1 + a]; // falta, amarelo, vermelho
}

export function simulateMatch(
  home: Side,
  away: Side,
  seed: number,
  onPlayers?: (p: Player[] | Player, cb?: never) => void,
): MatchResult {
  const rng = mulberry32(seed);
  void onPlayers;
  const homeXI = startersOf(home.club.players, home.starterIds);
  const awayXI = startersOf(away.club.players, away.starterIds);
  const homeP = effectivePowers(homeXI, home.club.country, home.tactic, home.club.morale);
  const awayP = effectivePowers(awayXI, away.club.country, away.tactic, away.club.morale);

  const cards: Cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
  const inMatchYellows = new Map<string, number>();
  const injuries: string[] = [];

  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;
  const events: MatchEvent[] = [];

  function push(kind: EventKind, minute: number, side: "home" | "away", clubId: string, playerId?: string): void {
    const p = playerId
      ? side === "home"
        ? homeXI.find((x) => x.id === playerId)
        : awayXI.find((x) => x.id === playerId)
      : undefined;
    events.push({
      minute,
      kind,
      text: line(kind, rng, p?.name),
      playerId,
      teamId: clubId,
      side,
    });
  }

  function tryFoul(minute: number, side: "home" | "away", xi: Player[], clubId: string): void {
    if (rng() < 0.02) {
      const player = pickOutfielder(xi, rng);
      const kind = pickWeighted(rng, foulWeights(player));
      if (kind === 2) {
        cards[side].red += 1;
        push("red", minute, side, clubId, player.id);
      } else if (kind === 1) {
        const prev = inMatchYellows.get(player.id) ?? 0;
        inMatchYellows.set(player.id, prev + 1);
        cards[side].yellow += 1;
        push("yellow", minute, side, clubId, player.id);
      } else {
        push("foul", minute, side, clubId, player.id);
      }
    }
  }

  function attempt(
    minute: number,
    attackXI: Player[],
    atkPower: number,
    defPower: number,
    gkPower: number,
    side: "home" | "away",
    clubId: string,
  ): boolean {
    const duelAtk = rng() * atkPower * 1.2;
    const duelDef = rng() * defPower;
    if (duelAtk <= duelDef) {
      if (rng() < 0.02) {
        const victim = pickOutfielder(attackXI, rng);
        victim.injuredGames = 1 + Math.floor(rng() * 4);
        injuries.push(victim.id);
        push("injury", minute, side, clubId, victim.id);
      }
      return false;
    }
    let kind = KINDS[pickWeighted(rng, OUTCOME_WEIGHTS)];
    if (kind === "goal") {
      const saveChance = Math.min(0.5, gkPower / 300);
      if (rng() < saveChance) kind = "saved";
    }
    const featured = kind === "goal" || kind === "saved" ? pickOutfielder(attackXI, rng) : undefined;
    push(kind, minute, side, clubId, featured?.id);
    return kind === "goal";
  }

  for (let minute = 1; minute <= 90; minute++) {
    const homeChance = rng() * 6000 < homeP.atk || rng() < 1 / 180;
    const awayChance = rng() * 7000 < awayP.atk || rng() < 1 / 270;
    if (homeChance) {
      homeShots += 1;
      if (attempt(minute, homeXI, homeP.atk, awayP.def, awayP.gk, "home", home.club.id)) homeGoals += 1;
    }
    if (awayChance) {
      awayShots += 1;
      if (attempt(minute, awayXI, awayP.atk, homeP.def, homeP.gk, "away", away.club.id)) awayGoals += 1;
    }
    if (rng() < 0.025) {
      tryFoul(minute, "home", homeXI, home.club.id);
      tryFoul(minute, "away", awayXI, away.club.id);
    }
  }

  push("whistle", 90, "home", home.club.id);
  return {
    homeId: home.club.id,
    awayId: away.club.id,
    homeGoals,
    awayGoals,
    events,
    shots: { home: homeShots, away: awayShots },
    cards,
    injuries,
    seed,
  };
}