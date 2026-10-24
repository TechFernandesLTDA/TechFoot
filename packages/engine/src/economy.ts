import type { AdminControls, Club, Player } from "./types.ts";

export type Division = 1 | 2 | 3;
export type MatchOutcome = "win" | "draw" | "loss";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Parâmetros econômicos por divisão (valores por rodada, em R$). */
export const DIVISION_ECONOMY: Record<Division, {
  ticketRef: number;
  feeRef: number;
  merchandiseRef: number;
  sponsorBase: number;
  broadcastBase: number;
  winPrize: number;
  youthBase: number;
  wageFactor: number;
}> = {
  1: { ticketRef: 35, feeRef: 80, merchandiseRef: 150, sponsorBase: 140_000, broadcastBase: 300_000, winPrize: 120_000, youthBase: 22, wageFactor: 1.15 },
  2: { ticketRef: 30, feeRef: 50, merchandiseRef: 100, sponsorBase: 70_000, broadcastBase: 170_000, winPrize: 50_000, youthBase: 17, wageFactor: 1 },
  3: { ticketRef: 20, feeRef: 30, merchandiseRef: 70, sponsorBase: 45_000, broadcastBase: 120_000, winPrize: 20_000, youthBase: 13, wageFactor: 0.85 },
};

export const SPONSOR_TIER_MULTIPLIER = [1, 1.6, 2.2, 2.8, 3.4];
export const BROADCAST_TIER_MULTIPLIER = [1, 1.3, 1.6];
export const LOAN_INTEREST_RATE = 0.01; // por rodada
export const LOAN_AMORTIZATION_RATE = 0.025; // por rodada
export const OVERDRAFT_RATE = 0.01; // juros sobre caixa negativo
export const STADIUM_UPGRADE_COST = 750_000; // por nível
export const CONTRACT_SIGNING_BONUS = 0.25; // fração dos salários do contrato paga na assinatura

// ---------------------------------------------------------------------------
// Valores de mercado e salários
// ---------------------------------------------------------------------------

/** Fator de idade no valor de mercado: jovens valem mais, veteranos menos. */
export function ageValueFactor(age: number): number {
  if (age <= 22) return 1.25;
  if (age <= 27) return 1.1;
  if (age <= 30) return 1;
  if (age <= 32) return 0.8;
  if (age <= 34) return 0.6;
  return 0.4;
}

export function playerValue(p: Player): number {
  return Math.round(Math.pow(p.strength, 2.1) * 1000 * ageValueFactor(p.age) + p.salary * 6);
}

/** Preço pedido por um clube controlado pela IA; scouting reduz o ágio (até 15 p.p.). */
export function aiTransferPrice(p: Player, scoutingBudget = 0): number {
  const premium = 1.2 - 0.15 * clamp(scoutingBudget / 1_000_000, 0, 1);
  return Math.round(playerValue(p) * premium);
}

/** Quanto o clube recebe ao vender (sempre abaixo do preço de compra: sem arbitragem). */
export function sellPrice(p: Player): number {
  return Math.round(playerValue(p) * 0.85);
}

/** Luvas para contratar um jogador sem clube. */
export function freeAgentFee(p: Player): number {
  return Math.round(playerValue(p) * 0.35);
}

/** Salário de mercado por rodada, conforme força e divisão do clube. */
export function marketSalary(strength: number, division: Division): number {
  return Math.round((8_000 + Math.pow(strength, 1.7) * 80) * DIVISION_ECONOMY[division].wageFactor / 50) * 50;
}

export function renewalCost(salary: number, games: number): number {
  return Math.round(salary * games * CONTRACT_SIGNING_BONUS);
}

export function leagueAverageStrength(players: Player[]): number {
  if (players.length === 0) return 25;
  return players.reduce((s, p) => s + p.strength, 0) / players.length;
}

export function weeklyWages(club: Club): number {
  const playerWages = club.players.reduce((s, p) => s + p.salary, 0);
  const staffWages = club.staff?.reduce((s, st) => s + st.salary, 0) ?? 0;
  return playerWages + staffWages;
}

// ---------------------------------------------------------------------------
// Receitas e despesas da rodada
// ---------------------------------------------------------------------------

export function maxSponsorTier(rep: number): number {
  if (rep >= 80) return 5;
  if (rep >= 65) return 4;
  if (rep >= 50) return 3;
  if (rep >= 35) return 2;
  return 1;
}

export function maxBroadcastTier(division: Division): number {
  return division === 1 ? 3 : division === 2 ? 2 : 1;
}

export function effectiveCapacity(club: Club, admin: AdminControls): number {
  return Math.round(club.stadiumCapacity * (1 + (admin.stadiumLevel - 1) * 0.08));
}

/**
 * Elasticidade de preço assimétrica: abaixo da referência a demanda cresce devagar
 * (expoente 0,5); acima, cai rápido (expoente 1,3). Receita máxima fica perto da referência,
 * então "preço no teto" nunca é a melhor jogada.
 */
export function priceFactor(price: number, ref: number): number {
  const p = Math.max(1, price);
  const exponent = p >= ref ? 1.3 : 0.5;
  return clamp(Math.pow(ref / p, exponent), 0.1, 1.4);
}

/** Estádios grandes lotam menos: fator de tamanho relativo a 30 mil lugares. */
function capacityFactor(capacity: number): number {
  return clamp(Math.pow(30_000 / Math.max(1_000, capacity), 0.35), 0.7, 1.1);
}

/** Ocupação esperada do estádio (0..1). */
export function attendanceRate(club: Club, admin: AdminControls, division: Division): number {
  const base = 0.22 + club.morale / 250 + club.rep / 400;
  const maintenanceFactor = 0.85 + 0.15 * clamp(admin.maintenanceBudget / (club.stadiumCapacity * 2), 0, 1);
  const capacity = effectiveCapacity(club, admin);
  return clamp(base * capacityFactor(capacity) * priceFactor(admin.ticketPrice, DIVISION_ECONOMY[division].ticketRef) * maintenanceFactor, 0.05, 1);
}

/** Número de sócios que o clube sustenta: cresce com reputação e moral, cai com mensalidade alta. */
export function membershipTarget(club: Club, admin: AdminControls, division: Division): number {
  const feeFactor = priceFactor(admin.membershipFee, DIVISION_ECONOMY[division].feeRef);
  const attendance = attendanceRate(club, admin, division);
  return Math.round((2_000 + club.rep * club.rep * 2) * feeFactor * (0.6 + club.morale / 175) * (0.7 + 0.3 * attendance));
}

/** Atualiza o quadro de sócios: aproxima do alvo e reage ao resultado. */
export function nextMembershipCount(current: number, target: number, result: MatchOutcome | null): number {
  const bump = result === "win" ? 0.01 : result === "loss" ? -0.008 : result === "draw" ? 0.002 : 0;
  return Math.max(0, Math.round(current + (target - current) * 0.08 + target * bump));
}

export function matchPrize(division: Division, result: MatchOutcome): number {
  const win = DIVISION_ECONOMY[division].winPrize;
  return result === "win" ? win : result === "draw" ? Math.round(win / 3) : 0;
}

export interface RoundFinanceInput {
  division: Division;
  homeGames: number;
  wins: number;
  draws: number;
  losses: number;
  cash: number;
}

export interface RoundFinance {
  tickets: number;
  membership: number;
  merchandise: number;
  sponsor: number;
  broadcast: number;
  prize: number;
  wages: number;
  playerWages: number;
  staffWages: number;
  maintenance: number;
  youth: number;
  scouting: number;
  interest: number;
  amortization: number;
  overdraft: number;
  income: number;
  expenses: number;
  total: number;
  attendance: number;
}

export function roundFinance(club: Club, admin: AdminControls, input: RoundFinanceInput): RoundFinance {
  const eco = DIVISION_ECONOMY[input.division];
  const attendance = attendanceRate(club, admin, input.division);
  const capacity = effectiveCapacity(club, admin);
  const tickets = Math.round(capacity * attendance * admin.ticketPrice * input.homeGames);
  const membership = Math.round((admin.membershipCount * admin.membershipFee) / 4);
  const merchandise = Math.round((admin.membershipCount * 0.12 + capacity * 0.03) * admin.merchandisePrice * 0.2 * priceFactor(admin.merchandisePrice, eco.merchandiseRef));
  const sponsorTier = Math.min(admin.sponsorTier, maxSponsorTier(club.rep));
  const sponsor = Math.round(eco.sponsorBase * SPONSOR_TIER_MULTIPLIER[sponsorTier - 1] * (0.7 + club.rep / 250));
  const broadcastTier = Math.min(admin.broadcastTier, maxBroadcastTier(input.division));
  const broadcast = Math.round(eco.broadcastBase * BROADCAST_TIER_MULTIPLIER[broadcastTier - 1]);
  const prize = input.wins * matchPrize(input.division, "win") + input.draws * matchPrize(input.division, "draw");
  const playerWages = club.players.reduce((s, p) => s + p.salary, 0);
  const staffWages = club.staff?.reduce((s, st) => s + st.salary, 0) ?? 0;
  const wages = playerWages + staffWages;
  const interest = Math.round(admin.debt * LOAN_INTEREST_RATE);
  const amortization = Math.min(admin.debt, Math.round(admin.debt * LOAN_AMORTIZATION_RATE));
  const overdraft = input.cash < 0 ? Math.round(-input.cash * OVERDRAFT_RATE) : 0;
  const income = tickets + membership + merchandise + sponsor + broadcast + prize;
  const expenses = wages + admin.maintenanceBudget + admin.youthBudget + admin.scoutingBudget + interest + amortization + overdraft;
  return {
    tickets, membership, merchandise, sponsor, broadcast, prize,
    wages, playerWages, staffWages, maintenance: admin.maintenanceBudget, youth: admin.youthBudget, scouting: admin.scoutingBudget,
    interest, amortization, overdraft,
    income, expenses, total: income - expenses, attendance,
  };
}

/** Orçamento inicial coerente com o porte do clube. */
export function defaultAdminControls(club: Club, division: Division): AdminControls {
  const eco = DIVISION_ECONOMY[division];
  const base: AdminControls = {
    ticketPrice: eco.ticketRef,
    membershipFee: eco.feeRef,
    sponsorTier: 1,
    broadcastTier: 1,
    merchandisePrice: eco.merchandiseRef,
    stadiumLevel: 1,
    maintenanceBudget: Math.round((club.stadiumCapacity * 2) / 5_000) * 5_000,
    youthBudget: division === 1 ? 150_000 : division === 2 ? 60_000 : 25_000,
    scoutingBudget: division === 1 ? 100_000 : division === 2 ? 40_000 : 15_000,
    debt: 0,
    membershipCount: 0,
  };
  base.membershipCount = membershipTarget(club, base, division);
  return base;
}
