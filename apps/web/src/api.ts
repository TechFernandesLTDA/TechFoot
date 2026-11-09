export function isOfflineError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Servidor indisponível");
}

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

const API_ROOT = "/api";

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (init?.method && init.method !== "GET" && init.body) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_ROOT}${path}`, { credentials: "include", ...init, headers });
  } catch {
    throw new Error("Servidor indisponível. Confira se a API está no ar e tente de novo.");
  }
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new Error(`Erro ${res.status}`);
  }
  if (!res.ok) throw new Error(data.error ?? "Erro");
  return data as T;
}

export const api = {
  me: () => req<User>("/me"),
  login: (email: string, password: string) =>
    req<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string, acceptTerms: boolean, age18: boolean) =>
    req<User>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password, acceptTerms, age18 }) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  exportData: () => req<unknown>("/me/export"),
  changePassword: (currentPassword: string, nextPassword: string) =>
    req("/me/password", { method: "POST", body: JSON.stringify({ currentPassword, nextPassword }) }),
  deleteAccount: (password: string) => req("/me", { method: "DELETE", body: JSON.stringify({ password }) }),
  world: () => req<{ name: string; stats: { clubs: number; divisions: number; players: number; stateCompetitions: number }; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[]; clubs: { id: string; name: string; city: string; state: string; colors: string[]; division: number }[] }>("/world"),
  saves: () => req<{ id: string; name: string }[]>("/saves"),
  createSave: (clubId: string) => req<{ id: string; name: string; career: Career; live?: { id: string; minute: number; period: string; status: string; score: number[]; opponent: string; club: string } | null }>("/saves", { method: "POST", body: JSON.stringify({ clubId }) }),
  getSave: (id: string) => req<{ id: string; name: string; career: Career; live?: { id: string; minute: number; period: string; status: string; score: number[]; opponent: string; club: string } | null }>(`/saves/${id}`),
  lineup: (id: string, plan: MatchPlan | string[]) => req<{ career: Career }>(`/saves/${id}/lineup`, { method: "PUT", body: JSON.stringify(Array.isArray(plan) ? { starterIds: plan } : plan) }),
  tactic: (id: string, tactic: Tactic) => req<{ career: Career }>(`/saves/${id}/tactic`, { method: "PUT", body: JSON.stringify({ tactic }) }),
  admin: (id: string, patch: Partial<Omit<AdminControls, "membershipCount" | "debt">>) => req<{ career: Career }>(`/saves/${id}/admin`, { method: "PUT", body: JSON.stringify(patch) }),
  loan: (id: string, amount: number) => req<{ career: Career }>(`/saves/${id}/admin/loan`, { method: "POST", body: JSON.stringify({ amount }) }),
  simulate: (id: string) => req<{ career: Career; userMatch: MatchResult | null }>(`/saves/${id}/simulate-round`, { method: "POST" }),
  matchday: (id: string) => req<LivePayload>(`/saves/${id}/matchday`, { method: "POST" }),
  advance: (id: string, toMinute: number, version: number) => req<LiveStep>(`/live/${id}/advance`, { method: "POST", body: JSON.stringify({ toMinute, version }) }),
  command: (id: string, atMinute: number, version: number, cmd: LiveCommand) => req<LiveStep>(`/live/${id}/command`, { method: "POST", body: JSON.stringify({ atMinute, version, cmd }) }),
  resume: (id: string, version: number) => req<LiveStep>(`/live/${id}/resume`, { method: "POST", body: JSON.stringify({ version }) }),
  finish: (id: string, version: number, rest = false) => req<{ career: Career; already: boolean; userMatch: MatchResult | null }>(`/live/${id}/finish`, { method: "POST", body: JSON.stringify({ version, rest }) }),
  live: (id: string) => req<LivePayload>(`/saves/${id}/live`),
  buy: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/market/buy`, { method: "POST", body: JSON.stringify({ playerId }) }),
  sell: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/market/sell`, { method: "POST", body: JSON.stringify({ playerId }) }),
  renew: (id: string, playerId: string) => req<{ career: Career }>(`/saves/${id}/renew`, { method: "POST", body: JSON.stringify({ playerId }) }),
  markRead: (id: string, msgId: string) => req<{ inbox: InboxMessage[] }>(`/saves/${id}/inbox/${msgId}/read`, { method: "POST" }),
  markAllRead: (id: string) => req<{ inbox: InboxMessage[] }>(`/saves/${id}/inbox/read-all`, { method: "POST" }),
  support: () => req<SupportInfo>("/support"),
  supportIntents: () => req<{ intents: SupportIntent[]; confirmed: false; unlocked: false }>("/support/intents"),
  createSupportIntent: (amountCents?: number, note?: string) => req<{ intent: SupportIntent; confirmed: false; unlocked: false }>("/support/intents", { method: "POST", body: JSON.stringify({ amountCents, note }) }),
};

export type SupportInfo = {
  pixKey: string;
  pixKeyType: string;
  brCode: string | null;
  brCodeAvailable: boolean;
  brCodeUnavailableReason: string | null;
  premiumCheckout: "unavailable";
  providerConfigured: boolean;
  donationsUnlockFeatures: false;
  notice: string;
  readiness: { copyKey: true; brCode: boolean; premiumCheckout: "unavailable"; missing: string[] };
};

export type SupportIntent = {
  id: string;
  amountCents: number | null;
  note: string | null;
  status: "unverified" | "verified";
  createdAt: string;
  unlocksFeatures: false;
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
  clubs: Club[]; table: { clubId: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number; yellows?: number; reds?: number; form?: ("W" | "D" | "L")[] }[];
  fixtures: { round: number; homeId: string; awayId: string; played: boolean; result?: MatchResult; date?: string }[];
  cup: { slot: string; homeId: string; awayId: string; played: boolean; winnerId?: string; homeGoals?: number; awayGoals?: number; penalties?: { home: number; away: number; winner?: "home" | "away" }; leg?: 1 | 2; singleLeg?: boolean; tieId?: string; date?: string }[][];
  cupRound: number; cupChampion?: string; cupFinalPlayed: boolean;
  finances: number;
  ledger: { round?: number; label: string; amount: number }[];
  market: { playerId: string; clubId: string | null; price: number }[];
  freeAgents: Player[];
  inbox: InboxMessage[];
  news: string[];
  lastRoundEvents: MatchResult | null;
  topScorers: { playerId: string; goals: number }[];
  history: SeasonRecord[];
  userMatches: UserMatchSummary[];
  seed: number;
};
export type SeasonRecord = { season: number; division: 1 | 2 | 3; position: number; points: number; played: number; cupChampionId?: string; prize: number; championId?: string; bestXi?: { name: string; position: string }[]; qualified?: { clubId: string; zone: string }[] };
export type LivePlayer = { id: string; name: string; position: Position; fit: number; off: boolean; injured: boolean };
export type LiveSide = { clubId: string; name: string; colors: string[]; tactic: Tactic; formation: Formation; onPitch: string[]; bench: string[]; subsUsed: number; windowsUsed: number; players: LivePlayer[] };
export type LiveView = {
  id: string; kind: string; round: number; status: string; version: number; minute: number; period: string;
  stoppage: number; stoppagePlayed: number; score: [number, number]; momentum: number;
  shots: { home: number; away: number }; cards: { home: { yellow: number; red: number }; away: { yellow: number; red: number } };
  penalties: { home: number; away: number; winner: "home" | "away" } | null;
  home: LiveSide; away: LiveSide;
  other: { homeId: string; awayId: string; homeGoals: number; awayGoals: number }[];
  table: Career["table"];
};
export type LiveEvent = { minute: number; kind: string; text: string; teamId: string; side: string; playerId?: string; big?: boolean; stoppage?: number };
export type LiveCommand = { type: "sub"; outId: string; inId: string } | { type: "tactic"; tactic: Tactic } | { type: "formation"; formation: Formation } | { type: "talk"; talk: "calma" | "cobrar" | "motivar" } | { type: "resume" };
export type LivePayload = { live: LiveView; events: LiveEvent[]; career: Career };
export type LiveStep = { live: LiveView; events: LiveEvent[]; replaceEvents: boolean };
export type UserMatchSummary = { season: number; round: number; homeId: string; awayId: string; homeGoals: number; awayGoals: number };
