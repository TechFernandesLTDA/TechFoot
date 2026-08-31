import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const teams = [
  [1, "Athletico Paranaense", "PR"], [1, "Atlético Mineiro", "MG"], [1, "Bahia", "BA"],
  [1, "Botafogo", "RJ"], [1, "Chapecoense", "SC"], [1, "Corinthians", "SP"],
  [1, "Coritiba", "PR"], [1, "Cruzeiro", "MG"], [1, "Flamengo", "RJ"], [1, "Fluminense", "RJ"],
  [1, "Grêmio", "RS"], [1, "Internacional", "RS"], [1, "Mirassol", "SP"], [1, "Palmeiras", "SP"],
  [1, "Red Bull Bragantino", "SP"], [1, "Remo", "PA"], [1, "Santos", "SP"], [1, "São Paulo", "SP"],
  [1, "Vasco da Gama", "RJ"], [1, "Vitória", "BA"],
  [2, "América Mineiro", "MG"], [2, "Athletic", "MG"], [2, "Atlético Goianiense", "GO"], [2, "Avaí", "SC"],
  [2, "Botafogo-SP", "SP"], [2, "Ceará", "CE"], [2, "CRB", "AL"], [2, "Criciúma", "SC"],
  [2, "Cuiabá", "MT"], [2, "Fortaleza", "CE"], [2, "Goiás", "GO"], [2, "Juventude", "RS"],
  [2, "Londrina", "PR"], [2, "Náutico", "PE"], [2, "Novorizontino", "SP"], [2, "Operário Ferroviário", "PR"],
  [2, "Ponte Preta", "SP"], [2, "São Bernardo", "SP"], [2, "Sport", "PE"], [2, "Vila Nova", "GO"],
  [3, "Amazonas", "AM"], [3, "Anápolis", "GO"], [3, "Barra-SC", "SC"], [3, "Botafogo-PB", "PB"],
  [3, "Brusque", "SC"], [3, "Caxias", "RS"], [3, "Confiança", "SE"], [3, "Ferroviária", "SP"],
  [3, "Figueirense", "SC"], [3, "Floresta", "CE"], [3, "Guarani", "SP"], [3, "Inter de Limeira", "SP"],
  [3, "Itabaiana", "SE"], [3, "Ituano", "SP"], [3, "Maranhão", "MA"], [3, "Maringá", "PR"],
  [3, "Paysandu", "PA"], [3, "Santa Cruz", "PE"], [3, "Volta Redonda", "RJ"], [3, "Ypiranga", "RS"],
];

const states = {
  AC: "Acreano", AL: "Alagoano", AP: "Amapaense", AM: "Amazonense", BA: "Baiano", CE: "Cearense",
  DF: "Brasiliense", ES: "Capixaba", GO: "Goiano", MA: "Maranhense", MT: "Mato-Grossense", MS: "Sul-Mato-Grossense",
  MG: "Mineiro", PA: "Paraense", PB: "Paraibano", PR: "Paranaense", PE: "Pernambucano", PI: "Piauiense",
  RJ: "Carioca", RN: "Potiguar", RS: "Gaúcho", RO: "Rondoniense", RR: "Roraimense", SC: "Catarinense",
  SP: "Paulista", SE: "Sergipano", TO: "Tocantinense",
};

const names = ["André", "Bruno", "Caio", "Davi", "Enzo", "Fábio", "Gustavo", "Heitor", "Iago", "João", "Kaique", "Luan", "Murilo", "Natan", "Otávio", "Pedro", "Rafael", "Samuel", "Tiago", "Vitor"];
const surnames = ["Almeida", "Barros", "Cardoso", "Dantas", "Esteves", "Ferreira", "Gomes", "Henrique", "Índio", "Jardim", "Lima", "Macedo", "Nogueira", "Oliveira", "Pires", "Queiroz", "Ramos", "Silva", "Teixeira", "Viana"];
const positions = ["GK", "GK", "DF", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW", "FW", "FW"];

function slug(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function color(seed) {
  const hue = (seed * 47) % 360;
  return `hsl(${hue} 48% 35%)`;
}

function makeClub([division, name, state], index) {
  const id = slug(name);
  const base = division === 1 ? 34 : division === 2 ? 25 : 18;
  const players = positions.map((position, playerIndex) => {
    const strength = Math.min(48, base + ((index * 7 + playerIndex * 5) % 11) - 3 + (playerIndex === 0 ? 3 : 0));
    return {
      id: `${id}-p${playerIndex + 1}`,
      name: `${names[(index * 3 + playerIndex) % names.length]} ${surnames[(index * 5 + playerIndex * 2) % surnames.length]}`,
      nationality: "BRA",
      position,
      strength,
      salary: division === 1 ? 24000 + strength * 900 : division === 2 ? 12000 + strength * 500 : 7000 + strength * 350,
      contractGames: 20 + (playerIndex % 10),
      behavior: 1 + ((index + playerIndex) % 5),
      injuredGames: 0,
      yellows: 0,
      reds: 0,
      goals: 0,
      matches: 0,
      suspendedGames: 0,
    };
  });
  return {
    id,
    name,
    city: state,
    state,
    country: "BRA",
    colors: [color(index + division), "#f1ead7"],
    stadiumName: `Estádio ${name}`,
    stadiumCapacity: division === 1 ? 28000 + (index % 6) * 7000 : division === 2 ? 12000 + (index % 5) * 2500 : 6000 + (index % 5) * 1400,
    cash: division === 1 ? 18000000 - index * 250000 : division === 2 ? 7000000 - (index - 20) * 90000 : 2200000 - (index - 40) * 35000,
    morale: 70,
    division,
    tactic: "balanced",
    rep: division === 1 ? 80 - index % 10 : division === 2 ? 55 - index % 12 : 35 - index % 12,
    players,
  };
}

const stateCompetitions = Object.entries(states).map(([state, name]) => ({
  id: `estadual-${state.toLowerCase()}`,
  name: `Campeonato ${name}`,
  state,
  season: 2026,
  format: "configurable",
  stages: ["first-stage", "semifinals", "final"],
  qualification: "copa-do-brasil",
}));

const world = {
  id: "brasil-2026",
  name: "Futebol Brasileiro 2026",
  season: 2026,
  divisions: [1, 2, 3],
  clubs: teams.map(makeClub),
  stateCompetitions,
  dataPolicy: "club-names-only-no-logos-no-real-player-likeness",
};

const output = resolve(process.cwd(), "data/world/liga-br.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(world, null, 2)}\n`);
console.log(`generated ${world.clubs.length} clubs, ${world.clubs.reduce((n, club) => n + club.players.length, 0)} fictional players and ${stateCompetitions.length} state competitions`);
