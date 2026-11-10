export type PlayerAvailability = "available" | "injured" | "suspended";
export type ContractStatus = "ok" | "expiring" | "expired";
export type LineupStatus = "incomplete" | "draft" | "saved";

export function playerAvailability(player: { injuredGames: number; suspendedGames: number }): PlayerAvailability {
  if (player.injuredGames > 0) return "injured";
  if (player.suspendedGames > 0) return "suspended";
  return "available";
}

export function contractStatus(contractGames: number): ContractStatus {
  if (contractGames <= 0) return "expired";
  if (contractGames <= 6) return "expiring";
  return "ok";
}

export function availabilityLabel(player: { injuredGames: number; suspendedGames: number }): string {
  const status = playerAvailability(player);
  if (status === "injured") return `Lesionado · ${player.injuredGames}j`;
  if (status === "suspended") return `Suspenso · ${player.suspendedGames}j`;
  return "Disponível";
}

export function contractLabel(contractGames: number): string {
  const status = contractStatus(contractGames);
  if (status === "expired") return "contrato encerrado";
  if (status === "expiring") return `vai expirar · ${contractGames}j`;
  return `${contractGames} jogos`;
}

export function lineupStatus(selected: readonly string[], saved: readonly string[]): LineupStatus {
  if (selected.length !== 11) return "incomplete";
  if (selected.length === saved.length && selected.every((id, index) => id === saved[index])) return "saved";
  return "draft";
}
