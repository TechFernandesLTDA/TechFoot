export type Position = "GK" | "DF" | "MF" | "FW";
export type Tactic = "offensive" | "balanced" | "defensive" | "pressing" | "counter";
export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "5-3-2" | "4-2-3-1";
export type EventKind =
  | "goal" | "saved" | "post" | "crossbar" | "miss" | "whistle"
  | "yellow" | "red" | "injury" | "foul" | "substitution" | "corner" | "free_kick" | "penalty" | "var";
export type Weather = "clear" | "rain" | "heavy_rain" | "heat" | "cold" | "wind";
export type RefereeStyle = "lenient" | "normal" | "strict" | "home_bias";

export interface Player {
  id: string;
  name: string;
  nationality: string;
  position: Position;
  preferredPositions: Position[];
  age: number;
  xp: number;
  skills: PlayerSkills;
  fitness: number;
  morale: number;
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
  /** Carga de jogos recentes (para lesões por fadiga) */
  recentLoad?: number;
  /** Forma recente: sequencia de resultados */
  formStreak?: number; // +3 = 3 vitórias, -3 = 3 derrotas
}

export interface PlayerSkills {
  pace: number;
  finishing: number;
  passing: number;
  marking: number;
  tackling: number;
  handling: number;
  stamina: number;
  leadership: number;
  /** Habilidade em defender pênaltis (GK) */
  penaltySaving?: number;
  /** Ameaça em bolas paradas (cabeceio, posicionamento) */
  setPiece?: number;
  /** Visão para contra-ataque */
  vision?: number;
  /** Composição / calma sob pressão */
  composure?: number;
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
  /** Estilo de jogo preferido do clube (afeta IA) */
  playStyle?: "possession" | "direct" | "counter" | "pressing" | "balanced";
}

export interface MatchContext {
  weather: Weather;
  referee: RefereeStyle;
  attendance: number; // 0-100%
  importance: number; // 1-10 (final=10, amistoso=1)
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
  /** Gravidade de cada lesão (jogos fora). Ausente em partidas salvas por versões antigas. */
  injuryDetails?: { playerId: string; games: number }[];
  fouls?: { home: number; away: number };
  seed: number;
  substitutions: { minute: number; teamId: string; playerOutId: string; playerInId: string }[];
}

export interface SubstitutionPlan {
  minute: number;
  playerOutId: string;
  playerInId: string;
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
  slot: string; // rótulo da fase ("1ª fase", "Oitavas de final", "Final"...)
  homeId: string;
  awayId: string;
  played: boolean;
  /** Clube avançou sem jogar (chave com número de times que não é potência de 2). */
  bye?: boolean;
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

/** Papéis da comissão técnica */
export type StaffRole = 
  | "head_coach" 
  | "assistant_coach" 
  | "fitness_coach" 
  | "gk_coach" 
  | "scout" 
  | "medical_director" 
  | "physio" 
  | "youth_coach_u20" 
  | "youth_coach_u17";

/** Habilidades da comissão técnica */
export interface StaffSkills {
  /** Capacidade tática (treinadores) */
  tactics?: number;
  /** Desenvolvimento de jogadores jovens */
  development?: number;
  /** Preparação física / prevenção de lesões */
  fitness?: number;
  /** Treino de goleiros */
  goalkeeping?: number;
  /** Identificação de talentos */
  scouting?: number;
  /** Recuperação de lesões / medicina esportiva */
  medical?: number;
  /** Gestão de vestiário / moral */
  manManagement?: number;
  /** Análise de adversários */
  analysis?: number;
}

/** Membro da comissão técnica */
export interface Staff {
  id: string;
  name: string;
  nationality: string;
  role: StaffRole;
  age: number;
  skills: StaffSkills;
  salary: number;
  contractGames: number; // jogos restantes no contrato
  reputation: number; // 0-100
  preferredFormation?: Formation;
  preferredTactic?: Tactic;
}

/** Jogador de base (sub-20 / sub-17) */
export interface YouthPlayer {
  id: string;
  name: string;
  nationality: string;
  position: Position;
  preferredPositions: Position[];
  age: number; // 15-20
  skills: PlayerSkills;
  potential: number; // 1-100 (teto de força)
  personality: "professional" | "ambitious" | "balanced" | "casual" | "difficult";
  contractGames: number;
  salary: number; // salário de base (baixo)
}

/** Categoria de base */
export interface YouthTeam {
  category: "u20" | "u17";
  players: YouthPlayer[];
  coachId?: string; // staff ID do técnico da categoria
}

/** Estilo de jogo preferido do clube (afeta IA) */
export type PlayStyle = "possession" | "direct" | "counter" | "pressing" | "balanced";

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
  /** Comissão técnica */
  staff?: Staff[];
  /** Categorias de base */
  youthTeams?: YouthTeam[];
  /** Estilo de jogo preferido do clube (afeta IA) */
  playStyle?: PlayStyle;
}

/** Tipo de competição */
export type CompetitionType =
  | "copa_do_brasil"
  | "libertadores"
  | "sul_americana"
  | "supercopa"
  | "recopa"
  | "estadual";

/** Fase da competição */
export type CompetitionPhase = 
  | "group" 
  | "round_of_64"
  | "round_of_32"
  | "round_of_16" 
  | "quarterfinals" 
  | "semifinals" 
  | "final" 
  | "first_stage" 
  | "second_stage" 
  | "knockout";

/** Grupo da Libertadores/Sul-Americana */
export interface GroupStanding {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

/** Partida de fase de grupos */
export interface GroupFixture {
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  result?: MatchResult;
  groupId: string;
}

/** Grupo completo */
export interface CompetitionGroup {
  id: string;
  name: string;
  teams: string[]; // clubIds
  fixtures: GroupFixture[];
  standings: GroupStanding[];
}

/** Competição completa (Copa do Brasil, Libertadores, etc.) */
export interface Competition {
  id: string;
  name: string;
  type: CompetitionType;
  season: number;
  phase: CompetitionPhase;
  /** Para mata-mata: chave (como CupFixture[][]) */
  bracket?: CupFixture[][];
  /** Para fase de grupos */
  groups?: CompetitionGroup[];
  /** Rodada atual (para fase de grupos) */
  currentRound?: number;
  /** Campeão (quando finalizada) */
  champion?: string;
  /** Vice-campeão */
  runnerUp?: string;
  /** Premiações por fase */
  prizes?: Record<string, number>;
  /** Classificados para próxima competição */
  qualified?: string[];
  /** Times eliminados */
  eliminated?: string[];
}

/** Data FIFA - janela internacional */
export interface FifaWindow {
  id: string;
  name: string;
  startRound: number;
  endRound: number;
  /** Seleções que convocam jogadores */
  nationalTeams: string[]; // clubIds de jogadores convocados
}

/** Calendário da temporada */
export interface SeasonCalendar {
  season: number;
  /** Rodadas do Brasileirão (1-38) */
  brasileiraoRounds: number;
  /** Rodadas da Copa do Brasil */
  copaDoBrasilRounds: number;
  /** Rodadas Libertadores */
  libertadoresRounds: number;
  /** Rodadas Sul-Americana */
  sulAmericanaRounds: number;
  /** Estaduais */
  estaduais: { id: string; startRound: number; endRound: number }[];
  /** Janelas FIFA */
  fifaWindows: FifaWindow[];
  /** Supercopa (rodada única) */
  supercopaRound?: number;
  /** Recopa (ida/volta) */
  recopaRounds?: [number, number];
}
