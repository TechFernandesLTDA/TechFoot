import type { Player } from "./types.ts";
import { clampStrength } from "./strength.ts";
import type { MatchOutcome } from "./economy.ts";

export interface DevelopmentResult {
  playerId: string;
  strengthBefore: number;
  strengthAfter: number;
  note: "evoluiu" | "regrediu";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Chance de ganhar +1 de força após uma vitória, por idade. */
function growthChance(age: number): number {
  if (age <= 21) return 0.16;
  if (age <= 25) return 0.1;
  if (age <= 29) return 0.05;
  if (age <= 32) return 0.02;
  return 0;
}

/** Chance de perder 1 de força após uma derrota, por idade. */
function declineChance(age: number): number {
  if (age >= 33) return 0.12;
  if (age >= 30) return 0.05;
  return 0.015;
}

/**
 * Evolução por partida. Jovens crescem com vitórias; veteranos regridem com derrotas.
 * Quem está muito acima da média da liga evolui mais devagar; quem está muito abaixo
 * regride menos. Valor esperado por temporada (40% vitórias): ~+3,5 aos 20 anos,
 * ~+1 aos 27, ~-2,5 aos 34.
 */
export function evolvePlayer(p: Player, result: MatchOutcome, leagueAvg: number, rng: () => number): DevelopmentResult | null {
  const before = p.strength;
  const gap = p.strength - leagueAvg;
  const resultGrowth = result === "win" ? 1 : result === "draw" ? 0.5 : 0.2;
  const resultDecline = result === "loss" ? 1 : result === "draw" ? 0.5 : 0.33;
  const up = growthChance(p.age) * resultGrowth * clamp(1 - gap / 30, 0.2, 1.3);
  const down = declineChance(p.age) * resultDecline * clamp(1 + gap / 30, 0.3, 1.5);
  const roll = rng();
  if (roll < up && p.strength < 50) p.strength = clampStrength(p.strength + 1);
  else if (roll >= up && roll < up + down && p.strength > 1) p.strength = clampStrength(p.strength - 1);
  if (p.strength === before) return null;
  return { playerId: p.id, strengthBefore: before, strengthAfter: p.strength, note: p.strength > before ? "evoluiu" : "regrediu" };
}

/**
 * Condição física, moral e experiência após uma rodada.
 * Quem joga gasta (mais se for veterano ou tiver pouco resistência); todos recuperam parte
 * do que falta para 100. Titular absoluto estabiliza perto de 70-75 de forma física.
 */
export function updateCondition(p: Player, played: boolean, result: MatchOutcome | null): void {
  const recovery = (100 - p.fitness) * 0.35;
  const cost = played ? (p.age > 30 ? 13 : 10) - (p.skills.stamina - 50) / 25 : 0;
  p.fitness = Math.round(clamp(p.fitness + recovery - cost, 0, 100));
  if (played) {
    p.xp = Math.min(100, p.xp + (result === "win" ? 3 : result === "draw" ? 2 : 1));
    p.morale = Math.round(clamp(p.morale + (result === "win" ? 4 : result === "loss" ? -4 : 1), 0, 100));
    p.matches += 1;
  } else {
    // reserva: moral cai devagar quando não joga, mas volta para o meio-termo
    p.morale = Math.round(clamp(p.morale - 1 + (60 - p.morale) * 0.05, 0, 100));
  }
}

export interface AgingResult {
  retired: boolean;
  strengthDelta: number;
}

/**
 * Virada de temporada: envelhece um ano; a partir dos 33 perde força e pode se aposentar.
 */
export function agePlayer(p: Player, rng: () => number): AgingResult {
  p.age += 1;
  const before = p.strength;
  if (p.age >= 33) {
    const loss = 1 + (p.age >= 35 ? 1 : 0) + (rng() < 0.4 ? 1 : 0);
    p.strength = clampStrength(p.strength - loss);
  }
  const retireChance = p.age >= 38 ? 1 : p.age >= 36 ? 0.5 : p.age >= 34 ? 0.15 : 0;
  return { retired: rng() < retireChance, strengthDelta: p.strength - before };
}

/** Força de um jovem revelado pela base: piso da divisão + investimento + sorte. */
export function youthStrength(divisionBase: number, youthBudget: number, rng: () => number): number {
  const investment = Math.round(6 * clamp(youthBudget / 1_000_000, 0, 1));
  return clampStrength(divisionBase + investment + Math.floor(rng() * 6));
}
