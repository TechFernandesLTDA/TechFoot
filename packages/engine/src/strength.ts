import type { Formation, Player, Position, Tactic } from "./types.ts";

export function clampStrength(value: number): number {
  return Math.max(1, Math.min(50, Math.round(value)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const FORMATION_SHAPES: Record<Formation, Record<Position, number>> = {
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "4-4-2": { GK: 1, DF: 4, MF: 4, FW: 2 },
  "3-5-2": { GK: 1, DF: 3, MF: 5, FW: 2 },
  "5-3-2": { GK: 1, DF: 5, MF: 3, FW: 2 },
  "4-2-3-1": { GK: 1, DF: 4, MF: 5, FW: 1 },
};

const SECTORS: Position[] = ["GK", "DF", "MF", "FW"];

export function isAvailable(p: Player): boolean {
  return p.injuredGames === 0 && p.suspendedGames === 0;
}

/** Habilidade técnica relevante para o setor em que o jogador atua. */
export function positionSkill(p: Player, sector: Position): number {
  const s = p.skills;
  if (sector === "GK") return s.handling;
  if (sector === "DF") return (s.marking + s.tackling) / 2;
  if (sector === "MF") return (s.passing + s.stamina) / 2;
  return (s.finishing + s.pace) / 2;
}

/** Fator de adaptação: 1 na posição natural, 0.85 em posição secundária, 0.6 improvisado. */
export function positionFit(p: Player, sector: Position): number {
  if (p.position === sector) return 1;
  if (p.preferredPositions.includes(sector)) return 0.85;
  return sector === "GK" || p.position === "GK" ? 0.45 : 0.6;
}

/** Força efetiva de um jogador atuando em um setor (considera idade, forma física, moral e adaptação). */
export function playerPower(p: Player, sector: Position, clubCountry?: string): number {
  const skill = positionSkill(p, sector);
  const ageFactor = p.age < 19 ? 0.9 : p.age <= 21 ? 0.96 : p.age >= 34 ? 0.9 : p.age >= 32 ? 0.95 : 1;
  const fitnessFactor = 0.6 + 0.4 * clamp01(p.fitness / 100);
  const moraleFactor = 0.9 + 0.1 * clamp01(p.morale / 100);
  const local = clubCountry && p.nationality === clubCountry ? 1.03 : 1;
  const technical = p.strength * 1.4 + skill * 0.35 + p.xp * 0.15;
  return technical * ageFactor * fitnessFactor * moraleFactor * positionFit(p, sector) * local;
}

/** Nota geral usada para ordenar jogadores na hora de escalar (posição natural). */
export function playerRating(p: Player): number {
  return playerPower(p, p.position);
}

export function startersOf(players: Player[], starterIds: string[]): Player[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const seen = new Set<string>();
  return starterIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p))
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .filter(isAvailable)
    .slice(0, 11);
}

export interface SlotAssignment {
  player: Player;
  slot: Position;
}

/**
 * Distribui os titulares pelos setores da formação. Primeiro ocupa cada setor com
 * jogadores da posição natural (melhores primeiro), depois com posições secundárias
 * e por fim improvisa. Com menos de 11 (expulsões) alguns setores ficam desfalcados.
 */
export function assignSlots(starters: Player[], formation: Formation = "4-3-3"): SlotAssignment[] {
  const shape = { ...FORMATION_SHAPES[formation] };
  const remaining = [...starters].sort((a, b) => playerRating(b) - playerRating(a));
  const out: SlotAssignment[] = [];
  const take = (sector: Position, accept: (p: Player) => boolean): void => {
    for (let i = 0; i < remaining.length && shape[sector] > 0; ) {
      const p = remaining[i];
      if (accept(p)) {
        out.push({ player: p, slot: sector });
        remaining.splice(i, 1);
        shape[sector] -= 1;
      } else {
        i++;
      }
    }
  };
  for (const sector of SECTORS) take(sector, (p) => p.position === sector);
  for (const sector of SECTORS) take(sector, (p) => p.preferredPositions.includes(sector));
  // improvisação: sobras vão para setores ainda abertos (nunca um jogador de linha no gol se houver outra vaga)
  for (const sector of SECTORS.filter((s) => s !== "GK")) take(sector, () => true);
  take("GK", () => true);
  // ainda sobrou gente (formação já cheia): reforça o setor natural
  for (const p of remaining) out.push({ player: p, slot: p.position });
  return out;
}

export function sectorPower(starters: Player[], clubCountry: string, sector: Position, formation: Formation = "4-3-3"): number {
  const assigned = assignSlots(starters, formation).filter((a) => a.slot === sector);
  if (sector === "GK") {
    // Só um goleiro joga: vale o melhor; sem goleiro, alguém improvisa com penalidade pesada.
    return assigned.reduce((best, a) => Math.max(best, playerPower(a.player, "GK", clubCountry)), 0);
  }
  return assigned.reduce((sum, a) => sum + playerPower(a.player, sector, clubCountry), 0);
}

/**
 * Pesos de cada setor no ataque e na defesa. Zagueiro vale 0,75 na defesa para que
 * um 4-3-3 tenha ataque e defesa equivalentes; meias dividem-se entre os dois lados;
 * no 5-3-2 os alas apoiam o ataque e no 4-2-3-1 os meias são mais ofensivos.
 */
export const FORMATION_WEIGHTS: Record<Formation, { dfDef: number; mfAtk: number; mfDef: number; dfAtk: number }> = {
  "4-3-3": { dfDef: 0.75, mfAtk: 0.5, mfDef: 0.5, dfAtk: 0 },
  "4-4-2": { dfDef: 0.75, mfAtk: 0.5, mfDef: 0.5, dfAtk: 0 },
  "3-5-2": { dfDef: 0.75, mfAtk: 0.5, mfDef: 0.5, dfAtk: 0 },
  "5-3-2": { dfDef: 0.75, mfAtk: 0.5, mfDef: 0.5, dfAtk: 0.05 },
  "4-2-3-1": { dfDef: 0.75, mfAtk: 0.6, mfDef: 0.4, dfAtk: 0 },
};

export function attackPower(starters: Player[], clubCountry: string, formation: Formation = "4-3-3"): number {
  const w = FORMATION_WEIGHTS[formation];
  return sectorPower(starters, clubCountry, "FW", formation) + sectorPower(starters, clubCountry, "MF", formation) * w.mfAtk + sectorPower(starters, clubCountry, "DF", formation) * w.dfAtk;
}

export function defensePower(starters: Player[], clubCountry: string, formation: Formation = "4-3-3"): number {
  const w = FORMATION_WEIGHTS[formation];
  return sectorPower(starters, clubCountry, "DF", formation) * w.dfDef + sectorPower(starters, clubCountry, "MF", formation) * w.mfDef;
}

export function keeperPower(starters: Player[], clubCountry: string, formation: Formation = "4-3-3"): number {
  return sectorPower(starters, clubCountry, "GK", formation);
}

// Tática: fechar-se rende um pouco mais do que se abrir custa (defender é mais barato que atacar),
// compensando a variância extra que jogos abertos dão ao azarão.
export const TACTIC_ATK: Record<Tactic, number> = {
  offensive: 1.2,
  balanced: 1,
  defensive: 0.85,
  pressing: 1.1,
  counter: 0.9,
};
export const TACTIC_DEF: Record<Tactic, number> = {
  offensive: 0.82,
  balanced: 1,
  defensive: 1.22,
  pressing: 0.9,
  counter: 1.1,
};

export interface Powers {
  atk: number;
  def: number;
  gk: number;
  /** Ataque e goleiro sem tática/moral/capitão: base para comparar goleiro x atacantes. */
  rawAtk: number;
  rawGk: number;
}

export function effectivePowers(
  starters: Player[],
  country: string,
  tactic: Tactic,
  morale: number,
  formation: Formation = "4-3-3",
  captainLeadership = 0,
): Powers {
  const assignment = assignSlots(starters, formation);
  const sum = (sector: Position): number => assignment.filter((a) => a.slot === sector).reduce((s, a) => s + playerPower(a.player, sector, country), 0);
  const gk = assignment.filter((a) => a.slot === "GK").reduce((best, a) => Math.max(best, playerPower(a.player, "GK", country)), 0);
  const w = FORMATION_WEIGHTS[formation];
  const mf = sum("MF");
  const df = sum("DF");
  const baseAtk = sum("FW") + mf * w.mfAtk + df * w.dfAtk;
  const baseDef = df * w.dfDef + mf * w.mfDef;
  const moraleMod = 0.92 + clamp01(morale / 100) * 0.16; // 0.92..1.08
  const captainMod = 1 + Math.max(0, Math.min(100, captainLeadership)) / 2000; // até +5%
  return {
    atk: baseAtk * TACTIC_ATK[tactic] * moraleMod * captainMod,
    def: baseDef * TACTIC_DEF[tactic] * moraleMod * captainMod,
    gk: gk * moraleMod * captainMod,
    rawAtk: baseAtk,
    rawGk: gk,
  };
}

/**
 * Completa uma escalação: mantém os titulares informados que estão disponíveis e
 * preenche as vagas restantes seguindo a formação (melhores disponíveis por setor).
 */
export function completeLineup(players: Player[], starterIds: string[], formation: Formation = "4-3-3"): string[] {
  const kept = startersOf(players, starterIds);
  const used = new Set(kept.map((p) => p.id));
  const shape = { ...FORMATION_SHAPES[formation] };
  for (const a of assignSlots(kept, formation)) shape[a.slot] = Math.max(0, shape[a.slot] - 1);
  const pool = players.filter((p) => isAvailable(p) && !used.has(p.id)).sort((a, b) => playerRating(b) - playerRating(a));
  const ids = kept.map((p) => p.id);
  const fill = (accept: (p: Player, sector: Position) => boolean): void => {
    for (const sector of SECTORS) {
      while (shape[sector] > 0 && ids.length < 11) {
        const idx = pool.findIndex((p) => accept(p, sector));
        if (idx < 0) break;
        ids.push(pool[idx].id);
        pool.splice(idx, 1);
        shape[sector] -= 1;
      }
    }
  };
  fill((p, sector) => p.position === sector);
  fill((p, sector) => p.preferredPositions.includes(sector));
  fill((p, sector) => sector !== "GK" && p.position !== "GK");
  fill(() => true);
  for (const p of pool) {
    if (ids.length >= 11) break;
    ids.push(p.id);
  }
  return ids.slice(0, 11);
}

export function defaultStarters(players: Player[], formation: Formation = "4-3-3"): string[] {
  return completeLineup(players, [], formation);
}

/** Banco padrão: melhores disponíveis fora da escalação, garantindo um goleiro reserva quando houver. */
export function defaultBench(players: Player[], starterIds: string[], size = 5): string[] {
  const starters = new Set(starterIds);
  const pool = players.filter((p) => !starters.has(p.id) && isAvailable(p)).sort((a, b) => playerRating(b) - playerRating(a));
  const bench: string[] = [];
  const gk = pool.find((p) => p.position === "GK");
  if (gk) bench.push(gk.id);
  for (const p of pool) {
    if (bench.length >= size) break;
    if (!bench.includes(p.id)) bench.push(p.id);
  }
  return bench;
}
