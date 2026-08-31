export type Position = "GK" | "DF" | "MF" | "FW";

export type EventKind = "goal" | "saved" | "post" | "crossbar" | "miss" | "whistle";

export interface Player {
  id: string;
  name: string;
  nationality: string;
  position: Position;
  strength: number;
  salary: number;
  contractGames: number;
  behavior: number;
  injuredGames: number;
  yellows: number;
  reds: number;
}

export interface Club {
  id: string;
  name: string;
  city: string;
  country: string;
  colors: [string, string];
  stadiumName: string;
  stadiumCapacity: number;
  cash: number;
  morale: number;
  players: Player[];
}

export interface MatchEvent {
  minute: number;
  kind: EventKind;
  text: string;
  playerId?: string;
  teamId: string;
}

export interface MatchResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  shots: { home: number; away: number };
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
