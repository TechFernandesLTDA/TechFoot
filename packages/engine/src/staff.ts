import type { Club, Formation, PlayStyle, Position, Staff, StaffRole, StaffSkills, Tactic, YouthPlayer } from "./types.ts";
import { pickWeighted } from "./random.ts";

const STAFF_NAMES = [
  "Carlos", "Roberto", "Fernando", "Paulo", "Ricardo", "Marcelo", "Alexandre", "Rafael", "Rodrigo", "Bruno",
  "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Lucas", "Marcos", "Nathan",
  "Otávio", "Pedro", "Renan", "Samuel", "Thiago", "Vinícius", "William", "Yuri", "Zé", "André"
];

const STAFF_SURNAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Lima", "Ferreira", "Almeida", "Rodrigues", "Costa",
  "Gomes", "Martins", "Araújo", "Carvalho", "Ribeiro", "Barbosa", "Nascimento", "Monteiro", "Cardoso", "Melo",
  "Cavalcanti", "Freitas", "Correia", "Moreira", "Vieira", "Rocha", "Moraes", "Cunha", "Teixeira", "Castro"
];

const ROLE_SKILL_WEIGHTS: Record<StaffRole, Partial<Record<keyof StaffSkills, number>>> = {
  head_coach: { tactics: 10, development: 6, manManagement: 8, analysis: 5, fitness: 2 },
  assistant_coach: { tactics: 6, development: 7, manManagement: 6, analysis: 7, fitness: 3 },
  fitness_coach: { fitness: 10, medical: 4, development: 3, tactics: 2 },
  gk_coach: { goalkeeping: 10, development: 5, tactics: 3, fitness: 2 },
  scout: { scouting: 10, analysis: 6, development: 4, tactics: 2 },
  medical_director: { medical: 10, fitness: 5, development: 2 },
  physio: { medical: 8, fitness: 6, development: 1 },
  youth_coach_u20: { development: 10, tactics: 5, manManagement: 6, analysis: 3 },
  youth_coach_u17: { development: 10, tactics: 4, manManagement: 7, analysis: 2 },
};

const ROLE_BASE_SALARY: Record<StaffRole, number> = {
  head_coach: 150_000,
  assistant_coach: 80_000,
  fitness_coach: 60_000,
  gk_coach: 55_000,
  scout: 50_000,
  medical_director: 70_000,
  physio: 45_000,
  youth_coach_u20: 40_000,
  youth_coach_u17: 35_000,
};

const ROLE_REPUTATION_MULT: Record<StaffRole, number> = {
  head_coach: 1.5,
  assistant_coach: 1.0,
  fitness_coach: 0.8,
  gk_coach: 0.8,
  scout: 0.9,
  medical_director: 1.0,
  physio: 0.6,
  youth_coach_u20: 0.7,
  youth_coach_u17: 0.6,
};

export function generateStaffName(rng: () => number): string {
  return `${STAFF_NAMES[Math.floor(rng() * STAFF_NAMES.length)]} ${STAFF_SURNAMES[Math.floor(rng() * STAFF_SURNAMES.length)]}`;
}

export function createStaff(role: StaffRole, rng: () => number, clubRep: number = 50): Staff {
  const weights = ROLE_SKILL_WEIGHTS[role];
  const baseSalary = ROLE_BASE_SALARY[role];
  const repMult = ROLE_REPUTATION_MULT[role];
  
  const skills: StaffSkills = {};
  for (const skill of Object.keys(weights)) {
    const base = 30 + rng() * 40;
    const repBonus = (clubRep / 100) * 20 * repMult;
    skills[skill as keyof StaffSkills] = Math.round(Math.min(100, base + repBonus + rng() * 15));
  }
  
  const age = 30 + Math.floor(rng() * 30);
  const reputation = Math.round(30 + rng() * 40 + (clubRep / 100) * 20);
  
  return {
    id: `staff-${role}-${Date.now()}-${Math.floor(rng() * 10000)}`,
    name: generateStaffName(rng),
    nationality: "Brasil",
    role,
    age,
    skills,
    salary: Math.round(baseSalary * (0.8 + rng() * 0.4) * (1 + reputation / 200)),
    contractGames: 76 + Math.floor(rng() * 76),
    reputation,
    preferredFormation: ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"][Math.floor(rng() * 4)] as Formation,
    preferredTactic: ["balanced", "offensive", "defensive", "pressing", "counter"][Math.floor(rng() * 5)] as Tactic,
  };
}

export function createDefaultStaff(clubRep: number, rng: () => number): Staff[] {
  const roles: StaffRole[] = [
    "head_coach", "assistant_coach", "fitness_coach", "gk_coach", 
    "scout", "medical_director", "physio", "youth_coach_u20", "youth_coach_u17"
  ];
  return roles.map(role => createStaff(role, rng, clubRep));
}

export function staffSalaryTotal(staff: Staff[]): number {
  return staff.reduce((sum, s) => sum + s.salary, 0);
}

export function getStaffByRole(staff: Staff[] | undefined, role: StaffRole): Staff | undefined {
  return staff?.find(s => s.role === role);
}

export function getHeadCoach(staff: Staff[] | undefined): Staff | undefined {
  return getStaffByRole(staff, "head_coach");
}

export function getYouthCoach(staff: Staff[] | undefined, category: "u20" | "u17"): Staff | undefined {
  return getStaffByRole(staff, category === "u20" ? "youth_coach_u20" : "youth_coach_u17");
}

/** Efeito do staff no desenvolvimento dos jogadores */
export function staffDevelopmentBonus(staff: Staff[] | undefined, category: "senior" | "u20" | "u17"): number {
  if (!staff) return 0;
  let bonus = 0;
  
  if (category === "senior") {
    const headCoach = getHeadCoach(staff);
    const assistant = getStaffByRole(staff, "assistant_coach");
    const fitness = getStaffByRole(staff, "fitness_coach");
    
    if (headCoach) bonus += (headCoach.skills.development ?? 0) * 0.15;
    if (assistant) bonus += (assistant.skills.development ?? 0) * 0.1;
    if (fitness) bonus += (fitness.skills.fitness ?? 0) * 0.05;
  } else {
    const youthCoach = getYouthCoach(staff, category);
    if (youthCoach) bonus += (youthCoach.skills.development ?? 0) * 0.25;
  }
  
  return Math.min(bonus, 15);
}

/** Efeito do staff na prevenção de lesões */
export function staffInjuryPrevention(staff: Staff[] | undefined): number {
  if (!staff) return 0;
  const fitness = getStaffByRole(staff, "fitness_coach");
  const medical = getStaffByRole(staff, "medical_director");
  const physio = getStaffByRole(staff, "physio");
  
  let prevention = 0;
  if (fitness) prevention += (fitness.skills.fitness ?? 0) * 0.08;
  if (medical) prevention += (medical.skills.medical ?? 0) * 0.1;
  if (physio) prevention += (physio.skills.medical ?? 0) * 0.05;
  
  return Math.min(prevention, 20);
}

/** Efeito do staff na recuperação de lesões */
export function staffInjuryRecovery(staff: Staff[] | undefined): number {
  if (!staff) return 0;
  const medical = getStaffByRole(staff, "medical_director");
  const physio = getStaffByRole(staff, "physio");
  
  let recovery = 0;
  if (medical) recovery += (medical.skills.medical ?? 0) * 0.12;
  if (physio) recovery += (physio.skills.medical ?? 0) * 0.08;
  
  return Math.min(recovery, 25);
}

/** Efeito do staff no moral do clube */
export function staffMoraleImpact(staff: Staff[] | undefined): number {
  if (!staff) return 0;
  const headCoach = getHeadCoach(staff);
  const assistant = getStaffByRole(staff, "assistant_coach");
  
  let impact = 0;
  if (headCoach) impact += (headCoach.skills.manManagement ?? 0) * 0.1;
  if (assistant) impact += (assistant.skills.manManagement ?? 0) * 0.05;
  
  return Math.round(impact);
}

/** Qualidade do scouting para mercado */
export function staffScoutingQuality(staff: Staff[] | undefined): number {
  if (!staff) return 50;
  const scout = getStaffByRole(staff, "scout");
  const headCoach = getHeadCoach(staff);
  
  let quality = 50;
  if (scout) quality += (scout.skills.scouting ?? 0) * 0.4;
  if (headCoach) quality += (headCoach.skills.analysis ?? 0) * 0.1;
  
  return Math.min(Math.round(quality), 100);
}

/** Formação preferida do técnico principal */
export function headCoachPreferredFormation(staff: Staff[] | undefined): Formation | undefined {
  return getHeadCoach(staff)?.preferredFormation;
}

/** Tática preferida do técnico principal */
export function headCoachPreferredTactic(staff: Staff[] | undefined): Tactic | undefined {
  return getHeadCoach(staff)?.preferredTactic;
}

/** Estilo de jogo baseado no técnico principal */
export function headCoachPlayStyle(staff: Staff[] | undefined): PlayStyle | undefined {
  const coach = getHeadCoach(staff);
  if (!coach) return undefined;
  
  const tactics = coach.skills.tactics ?? 50;
  const offensive = coach.preferredTactic === "offensive" || coach.preferredTactic === "pressing";
  const defensive = coach.preferredTactic === "defensive";
  
  if (tactics > 70 && offensive) return "pressing";
  if (tactics > 70 && defensive) return "counter";
  if (offensive) return "direct";
  if (defensive) return "counter";
  return "balanced";
}

/** Envelhecimento do staff */
export function ageStaff(staff: Staff, rng: () => number): { retired: boolean; strengthChange: number } {
  staff.age += 1;
  staff.contractGames -= 1;
  
  const maxAge = staff.role === "head_coach" ? 70 : staff.role === "assistant_coach" ? 68 : 65;
  
  if (staff.age >= maxAge) {
    return { retired: true, strengthChange: 0 };
  }
  
  let strengthChange = 0;
  if (staff.age < 45 && rng() < 0.3) {
    strengthChange = 1;
    staff.reputation = Math.min(100, staff.reputation + 1);
  } else if (staff.age > 55 && rng() < 0.2) {
    strengthChange = -1;
    staff.reputation = Math.max(10, staff.reputation - 1);
  }
  
  return { retired: false, strengthChange };
}

/** Cria jogadores de base para as categorias */
export function generateYouthPlayers(club: Club, category: "u20" | "u17", count: number, rng: () => number): YouthPlayer[] {
  const players: YouthPlayer[] = [];
  const maxAge = category === "u20" ? 20 : 17;
  const minAge = category === "u20" ? 17 : 15;
  
  const personalities: YouthPlayer["personality"][] = ["professional", "ambitious", "balanced", "casual", "difficult"];
  const personalityWeights = [0.15, 0.2, 0.35, 0.2, 0.1];
  
  for (let i = 0; i < count; i++) {
    const age = minAge + Math.floor(rng() * (maxAge - minAge + 1));
    const position = (["GK", "DF", "MF", "FW"] as Position[])[Math.floor(rng() * 4)];
    
    const potential = 40 + Math.floor(rng() * 55);
    const currentStrength = Math.round(potential * (0.4 + rng() * 0.3));
    
    const skill = (bonus: number) => Math.round(Math.min(100, currentStrength + bonus + rng() * 20));
    
    const secondary: Position = position === "GK" ? "GK" : position === "DF" ? "MF" : position === "FW" ? "MF" : "DF";
    
    players.push({
      id: `${club.id}-youth-${category}-${Date.now()}-${i}`,
      name: `${STAFF_NAMES[Math.floor(rng() * STAFF_NAMES.length)]} ${STAFF_SURNAMES[Math.floor(rng() * STAFF_SURNAMES.length)]}`,
      nationality: club.country,
      position,
      preferredPositions: position === "GK" ? ["GK"] : [position, secondary],
      age,
      skills: {
        pace: skill(position === "FW" || position === "MF" ? 10 : 0),
        finishing: skill(position === "FW" ? 15 : 0),
        passing: skill(position === "MF" ? 15 : 5),
        marking: skill(position === "DF" ? 15 : 0),
        tackling: skill(position === "DF" ? 12 : 0),
        handling: skill(position === "GK" ? 20 : -10),
        stamina: skill(10),
        leadership: skill(-5),
        penaltySaving: position === "GK" ? skill(0) : undefined,
        setPiece: position === "DF" || position === "FW" ? skill(5) : undefined,
        vision: position === "MF" ? skill(10) : undefined,
        composure: skill(0),
      },
      potential,
      personality: personalities[pickWeighted(rng, personalityWeights)],
      contractGames: 76,
      salary: Math.round(5000 * (1 + (potential - 40) / 100)),
    });
  }
  
  return players;
}

/** Promove jogador de base para o profissional */
export function promoteYouthPlayer(youth: YouthPlayer, _club: Club, rng: () => number): {
  player: import("./types.ts").Player;
  message: string;
} {
  const strength = Math.min(youth.potential, youth.skills.pace + youth.skills.finishing + youth.skills.passing + youth.skills.marking + youth.skills.tackling + youth.skills.handling + youth.skills.stamina) / 7;
  
  const player: import("./types.ts").Player = {
    id: youth.id.replace("youth", "pro"),
    name: youth.name,
    nationality: youth.nationality,
    position: youth.position,
    preferredPositions: youth.preferredPositions,
    age: youth.age,
    xp: 0,
    skills: youth.skills,
    fitness: 90,
    morale: 70 + Math.floor(rng() * 20),
    strength: Math.round(strength),
    salary: Math.round(10000 * (1 + (youth.potential - 40) / 100)),
    contractGames: 152,
    behavior: youth.personality === "difficult" ? 4 : youth.personality === "professional" ? 1 : 2,
    injuredGames: 0,
    yellows: 0,
    reds: 0,
    goals: 0,
    matches: 0,
    suspendedGames: 0,
    recentLoad: 0,
    formStreak: 0,
  };
  
  return {
    player,
    message: `${youth.name} (${youth.position}, ${player.strength} FOR, pot. ${youth.potential}) promovido da base ${youth.id.includes("u20") ? "Sub-20" : "Sub-17"}.`
  };
}

/** Desenvolvimento de jogadores de base */
export function developYouthPlayer(youth: YouthPlayer, staff: Staff[] | undefined, rng: () => number): void {
  const coach = getYouthCoach(staff, youth.age >= 18 ? "u20" : "u17");
  const bonus = coach ? (coach.skills.development ?? 50) / 100 : 0.5;
  
  const potentialGap = youth.potential - (youth.skills.pace + youth.skills.finishing + youth.skills.passing + youth.skills.marking + youth.skills.tackling + youth.skills.handling + youth.skills.stamina) / 7;
  const maxGrowth = Math.max(1, potentialGap * 0.15 * bonus);
  
  const skills = youth.skills;
  const growth = maxGrowth * (0.5 + rng());
  
  const relevantSkills = ["pace", "finishing", "passing", "marking", "tackling", "handling", "stamina"] as const;
  for (const skill of relevantSkills) {
    if (skills[skill] !== undefined && rng() < 0.4) {
      skills[skill] = Math.min(100, Math.round(skills[skill]! + growth));
    }
  }
  
  if (skills.penaltySaving !== undefined && rng() < 0.2) {
    skills.penaltySaving = Math.min(100, Math.round(skills.penaltySaving + growth));
  }
  if (skills.setPiece !== undefined && rng() < 0.2) {
    skills.setPiece = Math.min(100, Math.round(skills.setPiece + growth));
  }
  if (skills.vision !== undefined && rng() < 0.2) {
    skills.vision = Math.min(100, Math.round(skills.vision + growth));
  }
  if (skills.composure !== undefined && rng() < 0.2) {
    skills.composure = Math.min(100, Math.round(skills.composure + growth));
  }
  
  youth.age += 1/38;
  youth.contractGames -= 1;
}

/** Verifica se jogador de base deve ser promovido ou dispensado */
export function evaluateYouthPlayer(youth: YouthPlayer, _staff?: Staff[]): "promote" | "keep" | "release" {
  const currentStrength = (youth.skills.pace + youth.skills.finishing + youth.skills.passing + youth.skills.marking + youth.skills.tackling + youth.skills.handling + youth.skills.stamina) / 7;
  const potentialPct = currentStrength / youth.potential;
  
  if (youth.age >= 20 && potentialPct > 0.65) return "promote";
  if (youth.age >= 19 && potentialPct > 0.75) return "promote";
  if (youth.age >= 20 && potentialPct < 0.45) return "release";
  if (youth.age >= 19 && potentialPct < 0.4) return "release";
  return "keep";
}