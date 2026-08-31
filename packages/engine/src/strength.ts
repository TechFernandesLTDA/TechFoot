import type { Formation, Player, Position, Tactic } from "./types.ts";

export function clampStrength(value: number): number {
  return Math.max(1, Math.min(50, Math.round(value)));
}

export function startersOf(players: Player[], starterIds: string[]): Player[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return starterIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p))
    .filter((p) => p.injuredGames === 0 && p.suspendedGames === 0 && p.reds === 0)
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
      const skill = sector === "GK" ? p.skills.handling : sector === "DF" ? (p.skills.marking + p.skills.tackling) / 2 : sector === "MF" ? (p.skills.passing + p.skills.stamina) / 2 : (p.skills.finishing + p.skills.pace) / 2;
      const ageFactor = p.age < 19 ? 0.88 : p.age > 32 ? 0.92 : 1;
      const availability = Math.max(0.55, Math.min(1, p.fitness / 100)) * (0.85 + p.morale / 666);
      const technicalPower = p.strength * 1.4 + skill * 0.35 + p.xp * 0.15;
      return sum + technicalPower * ageFactor * availability + local;
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

const TACTIC_ATK = { offensive: 1.25, balanced: 1, defensive: 0.8 } as const;
const TACTIC_DEF = { offensive: 0.8, balanced: 1, defensive: 1.25 } as const;

export function effectivePowers(
  starters: Player[],
  country: string,
  tactic: Tactic,
  morale: number,
  formation: Formation = "4-3-3",
  captainLeadership = 0,
): { atk: number; def: number; gk: number } {
  const baseAtk = attackPower(starters, country);
  const baseDef = defensePower(starters, country);
  const baseGk = keeperPower(starters, country);
  const moraleMod = 0.9 + (morale / 100) * 0.2; // 0.9..1.1
  const captainMod = 1 + Math.max(0, Math.min(100, captainLeadership)) / 2000;
  const formationAtk = formation === "4-3-3" ? 1.05 : formation === "3-5-2" ? 1.02 : formation === "5-3-2" ? 0.94 : formation === "4-2-3-1" ? 1.01 : 1;
  const formationDef = formation === "5-3-2" ? 1.08 : formation === "3-5-2" ? 0.96 : formation === "4-2-3-1" ? 1.03 : formation === "4-4-2" ? 1.01 : 0.98;
  return {
    atk: baseAtk * TACTIC_ATK[tactic] * formationAtk * moraleMod * captainMod,
    def: baseDef * TACTIC_DEF[tactic] * formationDef * moraleMod * captainMod,
    gk: baseGk * moraleMod * captainMod,
  };
}

export function defaultStarters(players: Player[]): string[] {
  const order: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  const used = new Set<string>();
  const ids: string[] = [];
  for (const pos of order) {
    const next = players.find(
      (p) => p.position === pos && !used.has(p.id) && p.injuredGames === 0 && p.suspendedGames === 0,
    );
    if (next) {
      used.add(next.id);
      ids.push(next.id);
    }
  }
  for (const p of players) {
    if (ids.length >= 11) break;
    if (!used.has(p.id) && p.injuredGames === 0 && p.suspendedGames === 0) {
      used.add(p.id);
      ids.push(p.id);
    }
  }
  return ids;
}
