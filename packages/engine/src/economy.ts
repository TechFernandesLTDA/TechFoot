import type { Club, Player } from "./types.ts";
import { clampStrength } from "./strength.ts";

export interface DevelopmentResult {
  playerId: string;
  strengthBefore: number;
  strengthAfter: number;
  note: string;
}

export function playerValue(p: Player): number {
  return Math.round(p.strength * p.strength * 1250 + p.salary * 8);
}

export function leagueAverageStrength(players: Player[]): number {
  if (players.length === 0) return 25;
  return players.reduce((s, p) => s + p.strength, 0) / players.length;
}

// Estilo Elifoot: ganho de força por bom rendimento, teto ligado à média da liga.
// Goleiro passa por teste probabilístico extra de 50% para subir.
export function evolvePlayer(
  p: Player,
  result: "win" | "draw" | "loss",
  avg: number,
  rng: () => number,
): DevelopmentResult | null {
  const before = p.strength;
  if (result === "win") {
    if (p.strength >= 50 || p.strength > avg + 8) return null;
    if (p.position === "GK" && rng() < 0.5) return null;
    p.strength = clampStrength(p.strength + 1);
  } else if (result === "loss") {
    if (p.strength <= 1 || p.strength < avg - 8) return null;
    if (rng() < 0.5) return null;
    p.strength = clampStrength(p.strength - 1);
  }
  if (p.strength === before) return null;
  return {
    playerId: p.id,
    strengthBefore: before,
    strengthAfter: p.strength,
    note: p.strength > before ? "evoluiu" : "regrediu",
  };
}

export interface WeeklyFinance {
  wages: number;
  tickets: number;
  prize: number;
  total: number;
}

export function ticketRevenue(club: Club, result: "win" | "draw" | "loss"): number {
  const base = club.stadiumCapacity * (0.4 + club.morale / 250 + club.rep / 400);
  const factor = result === "win" ? 1.15 : result === "draw" ? 1 : 0.85;
  return Math.round(base * factor * 20); // R$ 20 por ingresso médio
}

export function weeklyWages(club: Club): number {
  return club.players.reduce((s, p) => s + p.salary, 0);
}

export const MATCH_PRIZE = { win: 150_000, draw: 50_000, loss: 0 };

export function computeFinances(
  club: Club,
  homeMatches: number,
  awayMatches: number,
  wins: number,
  draws: number,
  losses: number,
): WeeklyFinance {
  const wages = weeklyWages(club);
  const tickets =
    Math.round((ticketRevenue(club, "win") * wins + ticketRevenue(club, "draw") * draws + ticketRevenue(club, "loss") * losses) / Math.max(1, homeMatches + awayMatches)) * Math.max(1, homeMatches + awayMatches);
  const prize = wins * MATCH_PRIZE.win + draws * MATCH_PRIZE.draw;
  return { wages, tickets, prize, total: tickets + prize - wages };
}

export function aiTransferPrice(p: Player): number {
  return Math.round(playerValue(p) * 1.1);
}