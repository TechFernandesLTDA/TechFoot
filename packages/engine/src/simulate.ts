import type { Club, EventKind, MatchEvent, MatchResult, Player } from "./types.ts";
import { mulberry32, pickWeighted } from "./random.ts";
import { attackPower, defensePower, keeperPower, startersOf } from "./strength.ts";

const OUTCOME_WEIGHTS = [55, 18, 8, 7, 12];
const KINDS: EventKind[] = ["goal", "saved", "post", "crossbar", "miss"];

const LINES: Record<EventKind, string[]> = {
  goal: ["GOOOL! A bola treme a rede.", "É gol! A torcida explode."],
  saved: ["O goleiro espalma!", "Defesa espetacular."],
  post: ["Bateu na trave!", "A trave nega o gol."],
  crossbar: ["No travessão!", "A trave de cima salva."],
  miss: ["Por cima do gol.", "Chute desviado para fora."],
  whistle: ["Fim de jogo."],
};

export interface Side {
  club: Club;
  starterIds: string[];
}

function pickScorer(starters: Player[], rng: () => number): Player | undefined {
  const pool = starters.filter((p) => p.position === "FW" || p.position === "MF");
  if (pool.length === 0) return starters[0];
  return pool[Math.floor(rng() * pool.length)];
}

function line(kind: EventKind, rng: () => number): string {
  const opts = LINES[kind];
  return opts[Math.floor(rng() * opts.length)];
}

function attempt(
  minute: number,
  attack: Side,
  atkPower: number,
  defPower: number,
  gkPower: number,
  teamId: string,
  rng: () => number,
  events: MatchEvent[],
): boolean {
  const duelAtk = rng() * atkPower * 1.2;
  const duelDef = rng() * defPower;
  if (duelAtk <= duelDef) return false;
  let kind = KINDS[pickWeighted(rng, OUTCOME_WEIGHTS)];
  if (kind === "goal") {
    const saveChance = Math.min(0.5, gkPower / 300);
    if (rng() < saveChance) kind = "saved";
  }
  const scorer = kind === "goal" ? pickScorer(startersOf(attack.club.players, attack.starterIds), rng) : undefined;
  events.push({
    minute,
    kind,
    text: line(kind, rng),
    playerId: scorer?.id,
    teamId,
  });
  return kind === "goal";
}

export function simulateMatch(home: Side, away: Side, seed: number): MatchResult {
  const rng = mulberry32(seed);
  const homeXI = startersOf(home.club.players, home.starterIds);
  const awayXI = startersOf(away.club.players, away.starterIds);
  const homeAtk = attackPower(homeXI, home.club.country);
  const homeDef = defensePower(homeXI, home.club.country);
  const homeGk = keeperPower(homeXI, home.club.country);
  const awayAtk = attackPower(awayXI, away.club.country);
  const awayDef = defensePower(awayXI, away.club.country);
  const awayGk = keeperPower(awayXI, away.club.country);

  let homeGoals = 0;
  let awayGoals = 0;
  let homeShots = 0;
  let awayShots = 0;
  const events: MatchEvent[] = [];

  for (let minute = 1; minute <= 90; minute++) {
    const homeChance = rng() * 6000 < homeAtk || rng() < 1 / 180;
    const awayChance = rng() * 7000 < awayAtk || rng() < 1 / 270;
    if (homeChance) {
      homeShots += 1;
      if (attempt(minute, home, homeAtk, awayDef, awayGk, home.club.id, rng, events)) homeGoals += 1;
    }
    if (awayChance) {
      awayShots += 1;
      if (attempt(minute, away, awayAtk, homeDef, homeGk, away.club.id, rng, events)) awayGoals += 1;
    }
  }

  events.push({ minute: 90, kind: "whistle", text: "Fim de jogo.", teamId: home.club.id });
  return {
    homeId: home.club.id,
    awayId: away.club.id,
    homeGoals,
    awayGoals,
    events,
    shots: { home: homeShots, away: awayShots },
    seed,
  };
}
