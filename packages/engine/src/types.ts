export type Position = "GK" | "DF" | "MF" | "FW";
export type Tactic = "offensive" | "balanced" | "defensive";
export type EventKind =
  | "goal" | "saved" | "post" | "crossbar" | "miss" | "whistle"
  | "yellow" | "red" | "injury" | "foul";

export interface Player {
  id: string;
  name: string;
  nationality: string;
  position: Position;
  strength: number;
  salary: number;
  contractGames: number;
  behavior: number; // 1 muito correto .. 5 muito agressivo
  injuredGames: number;
  yellows: number;
  reds: number;
  goals: number;
  matches: number;
  suspendedGames: number;
}

export interface Club {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  colors: [string, string];
  stadiumName: string;
  stadiumCapacity: number;
  cash: number;
  morale: number; // 0-100
  division: 1 | 2 | 3;
  tactic: Tactic;
  rep: number; // reputação 0-100 (mercado)
  players: Player[];
}

export interface AdminControls {
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
}

export interface MatchEvent {
  minute: number;
  kind: EventKind;
  text: string;
  playerId?: string;
  teamId: string;
  side: "home" | "away";
}

export interface Cards {
  home: { yellow: number; red: number };
  away: { yellow: number; red: number };
}

export interface MatchResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  shots: { home: number; away: number };
  cards: Cards;
  injuries: string[];
  seed: number;
}

export interface Standing {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  result?: MatchResult;
}

export interface CupFixture {
  slot: string; // "R16" | "QF" | "SF" | "F"
  homeId: string;
  awayId: string;
  played: boolean;
  winnerId?: string;
  homeGoals?: number;
  awayGoals?: number;
  penalties?: { home: number; away: number };
}

export interface LedgerEntry {
  round?: number;
  label: string;
  amount: number;
}

export interface InboxMessage {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
}
