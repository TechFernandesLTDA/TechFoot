const json = (r: Response) => r.json();

export type Tactic = "offensive" | "balanced" | "defensive";
export type User = { id: string; email: string; name: string };
export type SubstitutionPlan = { minute: number; playerOutId: string; playerInId: string };
export type MatchPlan = { starterIds: string[]; benchIds: string[]; formation: Formation; captainId: string; substitutions: SubstitutionPlan[] };
export type AdminControls = {
  ticketPrice: number;
  membershipFee: number;
  sponsorTier: number;
  broadcastTier: number;
  merchandisePrice: number;
  stadiumLevel: number;
  maintenanceBudget: number;
  youthBudget: number;
  scoutingBudget: number;
  debt: number;
  membershipCount: number;
};

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.method && init.method !== "GET" && init.body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { credentials: "include", ...init, headers });
  const data = await json(res);
  if (!res.ok) throw new Error(data.error ?? "Erro");
  return data as T;
}

export const api = {
  me: () => req<User>("/me"),
  login: (email: string, password: string) =>
    req<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    req<User>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  world: () => req<{ name: string; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[]; clubs: { id: string; name: string; city: string; state: string; colors: string[]; division: number }[] }>("/world"),
  saves: () => req<{ id: string; name: string }[]>("/saves"),
  createSave: (clubId: string) => req<{ id: string; name: string; career: Career }>("/saves", { method: "POST", body: JSON.stringify({ clubId }) }),
  getSave: (id: string) => req<{ id: string; name: string; career: Career }>(`/saves/${id}`),
  lineup: (id: string, plan: MatchPlan | string[]) => req<{ career: Career }>(`/saves/${id}/lineup`, { method: "PUT", body: JSON.stringify(Array.isArray(plan) ? { starterIds: plan } : plan) }),
  tactic: (id: string, tactic: Tactic) => req<{ career: Career }>(`/saves/${id}/tactic`, { method: "PUT", body: JSON.stringify({ tactic }) }),
  admin: (id: string, patch: Partial<Omit<AdminControls, "membershipCount" | "debt">>) => req<{ career: Career }>(`/saves/${id}/admin`, { method: "PUT", body: JSON.stringify(patch) }),
  loan: (id: string, amount: number) => req<{ career: Career }>(`/saves/${id}/admin/loan`, { method: "POST", body: JSON.stringify({ amount }) }),
  simulate: (id: string) => req<{ career: Career; userMatch: MatchResult | null }>(`/saves/${id}/simulate-round`, { method: "POST" }),
  buy: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/market/buy`, { method: "POST", body: JSON.stringify({ playerId }) }),
  sell: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/market/sell`, { method: "POST", body: JSON.stringify({ playerId }) }),
  renew: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/renew`, { method: "POST", body: JSON.stringify({ playerId }) }),
  markRead: (id: string, msgId: string) => req<{ inbox: InboxMessage[] }>(`/saves/${id}/inbox/${msgId}/read`, { method: "POST" }),
};

export type Position = "GK" | "DF" | "MF" | "FW";
export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "5-3-2" | "4-2-3-1";
export type PlayerSkills = { pace: number; finishing: number; passing: number; marking: number; tackling: number; handling: number; stamina: number; leadership: number };
export type MatchResult = {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: { minute: number; kind: string; text: string; teamId: string; side: string; playerId?: string }[];
  shots: { home: number; away: number };
  cards: { home: { yellow: number; red: number }; away: { yellow: number; red: number } };
  injuries: string[];
  substitutions: { minute: number; teamId: string; playerOutId: string; playerInId: string }[];
};
export type Player = {
  id: string; name: string; nationality: string; position: Position; preferredPositions: Position[]; age: number; xp: number; skills: PlayerSkills; fitness: number; morale: number; strength: number;
  salary: number; contractGames: number; behavior: number; injuredGames: number;
  yellows: number; reds: number; goals: number; matches: number; suspendedGames: number;
};
export type Club = {
  id: string; name: string; city: string; state: string; colors: string[]; stadiumName: string;
  stadiumCapacity: number; cash: number; morale: number; division: 1 | 2 | 3; tactic: Tactic;
  rep: number; players: Player[];
};
export type InboxMessage = { id: string; kind: string; title: string; body: string; read: boolean };
export type Career = {
  clubId: string; division: 1 | 2 | 3; season: number; round: number; tactic: Tactic; formation: Formation; captainId: string; starterIds: string[]; benchIds: string[];
  substitutions: { minute: number; playerOutId: string; playerInId: string }[];
  admin: AdminControls;
  clubs: Club[]; table: { clubId: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number }[];
  fixtures: { round: number; homeId: string; awayId: string; played: boolean; result?: MatchResult }[];
  cup: { slot: string; homeId: string; awayId: string; played: boolean; winnerId?: string; homeGoals?: number; awayGoals?: number; penalties?: { home: number; away: number } }[][];
  cupRound: number; cupChampion?: string; cupFinalPlayed: boolean;
  finances: number;
  ledger: { round?: number; label: string; amount: number }[];
  market: { playerId: string; clubId: string | null; price: number }[];
  inbox: InboxMessage[];
  news: string[];
  lastRoundEvents: MatchResult | null;
  topScorers: { playerId: string; goals: number }[];
  seed: number;
};
