import type { Player, Position } from "./types.ts";

export function clampStrength(value: number): number {
  return Math.max(1, Math.min(50, Math.round(value)));
}

export function startersOf(players: Player[], starterIds: string[]): Player[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return starterIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p))
    .filter((p) => p.injuredGames === 0 && p.reds === 0)
    .slice(0, 11);
}

export function sectorPower(
  starters: Player[],
  clubCountry: string,
  sector: Position,
): number {
  return starters
    .filter((p) => p.position === sector)
    .reduce((sum, p) => {
      const local = p.nationality === clubCountry ? 3 : 0;
      return sum + p.strength * 2 + local;
    }, 0);
}

export function attackPower(starters: Player[], clubCountry: string): number {
  return sectorPower(starters, clubCountry, "FW") + sectorPower(starters, clubCountry, "MF") * 0.5;
}

export function defensePower(starters: Player[], clubCountry: string): number {
  return sectorPower(starters, clubCountry, "DF") + sectorPower(starters, clubCountry, "MF") * 0.5;
}

export function keeperPower(starters: Player[], clubCountry: string): number {
  return sectorPower(starters, clubCountry, "GK");
}

export function defaultStarters(players: Player[]): string[] {
  const order: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  const used = new Set<string>();
  const ids: string[] = [];
  for (const pos of order) {
    const next = players.find((p) => p.position === pos && !used.has(p.id) && p.injuredGames === 0);
    if (next) {
      used.add(next.id);
      ids.push(next.id);
    }
  }
  for (const p of players) {
    if (ids.length >= 11) break;
    if (!used.has(p.id) && p.injuredGames === 0) {
      used.add(p.id);
      ids.push(p.id);
    }
  }
  return ids;
}
