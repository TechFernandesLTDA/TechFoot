import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agePlayer, aiTransferPrice, assignSlots, attendanceRate, completeLineup, cupBracket, defaultAdminControls, defaultStarters,
  doubleRoundRobin, effectivePowers, evolvePlayer, freeAgentFee, marketSalary, maxSponsorTier, membershipTarget, mulberry32,
  nextCupRound, playerValue, priceFactor, resolvePenalties, roundFinance, sellPrice, simulateMatch, sortTable, startersOf,
  updateCondition, type Club, type Formation, type Player, type Position, type Standing, type Tactic,
} from "../src/index.ts";

function player(id: string, position: Position, strength: number, overrides: Partial<Player> = {}): Player {
  return {
    id, name: id, nationality: "BRA", position, preferredPositions: [position], age: 26, xp: 50,
    skills: { pace: 60, finishing: 60, passing: 60, marking: 60, tackling: 60, handling: 60, stamina: 60, leadership: 50 },
    fitness: 90, morale: 70, strength, salary: 20_000, contractGames: 40,
    behavior: 3, injuredGames: 0, yellows: 0, reds: 0, goals: 0, matches: 0, suspendedGames: 0,
    ...overrides,
  };
}

const SHAPE: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];

function squad(prefix: string, strength: number, extra: Player[] = []): Player[] {
  return [...SHAPE.map((position, i) => player(`${prefix}${i}`, position, strength)), ...extra];
}

function club(id: string, players: Player[], tactic: Tactic = "balanced", overrides: Partial<Club> = {}): Club {
  return {
    id, name: id, city: "Curitiba", country: "BRA", colors: ["#0d3b2e", "#f4ead5"],
    stadiumName: "Campo", stadiumCapacity: 30_000, cash: 1_000_000, morale: 70,
    division: 1, tactic, rep: 60, state: "PR", players, ...overrides,
  };
}

function side(c: Club, formation: Formation = "4-3-3", tactic: Tactic = c.tactic) {
  return { club: c, starterIds: defaultStarters(c.players, formation), tactic, formation };
}

function series(home: Club, away: Club, games: number, homeFormation: Formation = "4-3-3", homeTactic?: Tactic) {
  let hg = 0, ag = 0, hw = 0, d = 0, aw = 0, yellow = 0, red = 0, shots = 0, injuries = 0;
  for (let seed = 1; seed <= games; seed++) {
    const r = simulateMatch(side(home, homeFormation, homeTactic ?? home.tactic), side(away), seed * 17);
    hg += r.homeGoals;
    ag += r.awayGoals;
    if (r.homeGoals > r.awayGoals) hw++;
    else if (r.homeGoals === r.awayGoals) d++;
    else aw++;
    yellow += r.cards.home.yellow + r.cards.away.yellow;
    red += r.cards.home.red + r.cards.away.red;
    shots += r.shots.home + r.shots.away;
    injuries += r.injuries.length;
  }
  return { hg, ag, hw, d, aw, yellow, red, shots, injuries, games, ppg: (hw * 3 + d) / games };
}

describe("simulação de partida", () => {
  it("mesma seed produz o mesmo resultado", () => {
    const home = club("h", squad("h", 35));
    const away = club("a", squad("a", 28));
    const a = simulateMatch(side(home), side(away), 42);
    const b = simulateMatch(side(home), side(away), 42);
    assert.equal(a.homeGoals, b.homeGoals);
    assert.equal(a.awayGoals, b.awayGoals);
    // Eventos podem variar com novas features (escanteios, faltas, pênaltis), mas placar final deve ser determinístico
  });

  it("lado mais forte vence a maioria e marca mais", () => {
    const s = series(club("h", squad("h", 45)), club("a", squad("a", 15)), 60);
    assert.ok(s.hg > s.ag * 2, `gols ${s.hg} x ${s.ag}`);
    assert.ok(s.hw / s.games > 0.6, `vitórias ${s.hw}/${s.games}`);
  });

  it("times iguais: ~2,5 gols por jogo, vantagem do mando, poucos 7+ gols", () => {
    const s = series(club("h", squad("h", 30)), club("a", squad("a", 30)), 400);
    const goalsPerGame = (s.hg + s.ag) / s.games;
    assert.ok(goalsPerGame > 2.0 && goalsPerGame < 3.3, `gols/jogo ${goalsPerGame}`);
    assert.ok(s.hw > s.aw, `mandante ${s.hw} x visitante ${s.aw}`);
    assert.ok(s.d / s.games > 0.15 && s.d / s.games < 0.38, `empates ${s.d / s.games}`);
    assert.ok(s.shots / s.games > 15 && s.shots / s.games < 32, `finalizações ${s.shots / s.games}`);
  });

  it("cartões amarelos são muito mais comuns que vermelhos; lesões são raras", () => {
    const s = series(club("h", squad("h", 30)), club("a", squad("a", 30)), 300);
    assert.ok(s.yellow / s.games > 2.5 && s.yellow / s.games < 6.5, `amarelos/jogo ${s.yellow / s.games}`);
    assert.ok(s.red / s.games > 0.1 && s.red / s.games < 0.6, `vermelhos/jogo ${s.red / s.games}`);
    assert.ok(s.yellow > s.red * 6);
    assert.ok(s.injuries / s.games > 0.1 && s.injuries / s.games < 0.8, `lesões/jogo ${s.injuries / s.games}`);
  });

  it("lesão traz gravidade em jogos e substituição automática", () => {
    let seen = 0;
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      const home = club("h", squad("h", 30, [player("hsub1", "DF", 28), player("hsub2", "MF", 28), player("hsub3", "FW", 28)]));
      const r = simulateMatch(side(home), side(club("a", squad("a", 30))), seed);
      const homeInjury = r.events.find((e) => e.kind === "injury" && e.side === "home");
      if (!homeInjury) continue;
      seen++;
      const detail = r.injuryDetails?.find((d) => d.playerId === homeInjury.playerId);
      assert.ok(detail && detail.games >= 1 && detail.games <= 15, "gravidade entre 1 e 15 jogos");
      assert.ok(r.substitutions.some((s) => s.teamId === "h" && s.playerOutId === homeInjury.playerId), "lesionado foi substituído");
    }
    assert.ok(seen > 0, "nenhuma lesão em 200 jogos");
  });

  it("tática é um trade-off: ofensiva favorece o mais forte, defensiva ajuda o mais fraco", () => {
    const strong = club("h", squad("h", 40));
    const weakAway = club("a", squad("a", 24));
    const offensive = series(strong, weakAway, 1500, "4-3-3", "offensive");
    const defensive = series(strong, weakAway, 1500, "4-3-3", "defensive");
    assert.ok(offensive.hg > defensive.hg, "ofensiva marca mais");
    assert.ok(offensive.hg - offensive.ag > defensive.hg - defensive.ag, "favorito amplia o saldo atacando");
    assert.ok(offensive.ppg >= defensive.ppg - 0.05, `ofensiva não pode ser pior para o favorito (${offensive.ppg} vs ${defensive.ppg})`);

    const weak = club("h", squad("h", 24));
    const strongAway = club("a", squad("a", 40));
    const weakDef = series(weak, strongAway, 1500, "4-3-3", "defensive");
    const weakOff = series(weak, strongAway, 1500, "4-3-3", "offensive");
    assert.ok(weakDef.ag < weakOff.ag, "defensiva sofre menos gols");
    assert.ok(weakDef.hg - weakDef.ag > weakOff.hg - weakOff.ag, "azarão perde por menos fechado");
    assert.ok(weakDef.ppg >= weakOff.ppg - 0.05, `defensiva não pode ser pior para o azarão (${weakDef.ppg} vs ${weakOff.ppg})`);
  });

  it("formação defensiva reduz gols dos dois lados sem ser dominada", () => {
    const home = club("h", squad("h", 30, [player("hx1", "DF", 30), player("hx2", "MF", 30), player("hx3", "MF", 30)]));
    const away = club("a", squad("a", 30));
    const open = series(home, away, 500, "4-3-3");
    const closed = series(home, away, 500, "5-3-2");
    assert.ok(closed.hg + closed.ag < open.hg + open.ag, "5-3-2 tem menos gols");
    assert.ok(Math.abs(closed.ppg - open.ppg) < 0.2, `diferença de pontos ${closed.ppg - open.ppg}`);
  });

  it("segundo amarelo expulsa e o time segue com 10", () => {
    const aggressive = club("h", squad("h", 30).map((p) => ({ ...p, behavior: 5 })));
    let found = false;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const r = simulateMatch(side(aggressive), side(club("a", squad("a", 30))), seed);
      const yellows = r.events.filter((e) => e.kind === "yellow" && e.side === "home");
      const dup = yellows.find((e, i) => yellows.findIndex((o) => o.playerId === e.playerId) !== i);
      if (!dup) continue;
      found = true;
      assert.ok(r.events.some((e) => e.kind === "red" && e.playerId === dup.playerId));
      assert.ok(r.cards.home.red >= 1);
    }
    assert.ok(found, "nenhum segundo amarelo em 300 jogos");
  });
});

describe("escalação e forças", () => {
  it("escalação padrão segue a formação e tem 11 jogadores", () => {
    const players = squad("p", 20, [player("x1", "DF", 25), player("x2", "MF", 25)]);
    const ids = defaultStarters(players, "5-3-2");
    assert.equal(ids.length, 11);
    const slots = assignSlots(startersOf(players, ids), "5-3-2");
    assert.equal(slots.filter((s) => s.slot === "DF").length, 5);
    assert.equal(slots.filter((s) => s.slot === "GK").length, 1);
  });

  it("startersOf ignora lesionados e suspensos, mas não quem já foi expulso antes", () => {
    const players = squad("p", 20);
    players[1].injuredGames = 2;
    players[2].suspendedGames = 1;
    players[3].reds = 1;
    const ids = players.map((p) => p.id);
    const starters = startersOf(players, ids);
    assert.equal(starters.length, 9);
    assert.ok(starters.some((p) => p.id === "p3"));
  });

  it("completeLineup substitui titular indisponível por reserva da mesma posição", () => {
    const players = squad("p", 20, [player("resMF", "MF", 22), player("resFW", "FW", 22)]);
    players[5].injuredGames = 3; // meia titular
    const ids = completeLineup(players, SHAPE.map((_, i) => `p${i}`), "4-3-3");
    assert.equal(ids.length, 11);
    assert.ok(!ids.includes("p5"));
    assert.ok(ids.includes("resMF"));
    assert.ok(!ids.includes("resFW"));
  });

  it("jogador fora de posição rende menos; dois goleiros não somam", () => {
    const natural = effectivePowers(squad("p", 30), "BRA", "balanced", 70);
    const swapped = squad("p", 30).map((p) => (p.id === "p8" ? { ...p, position: "DF" as Position, preferredPositions: ["DF" as Position] } : p));
    const improvised = effectivePowers(swapped, "BRA", "balanced", 70);
    assert.ok(improvised.atk < natural.atk);
    const twoKeepers = squad("p", 30).map((p) => (p.id === "p10" ? { ...p, position: "GK" as Position, preferredPositions: ["GK" as Position] } : p));
    const doubled = effectivePowers(twoKeepers, "BRA", "balanced", 70);
    assert.ok(doubled.gk <= natural.gk * 1.001);
    assert.ok(doubled.atk < natural.atk);
  });

  it("tática altera ataque e defesa em sentidos opostos", () => {
    const players = squad("p", 20);
    const off = effectivePowers(players, "BRA", "offensive", 70);
    const def = effectivePowers(players, "BRA", "defensive", 70);
    assert.ok(off.atk > def.atk);
    assert.ok(off.def < def.def);
  });
});

describe("liga e copa", () => {
  it("turno e returno: 38 rodadas para 20 clubes, cada time joga uma vez por rodada", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `club-${index}`);
    const fixtures = doubleRoundRobin(ids);
    assert.equal(fixtures.length, 380);
    assert.equal(Math.max(...fixtures.map((fixture) => fixture.round)), 38);
    assert.equal(fixtures.filter((fixture) => fixture.homeId === "club-0").length, 19);
    for (let round = 1; round <= 38; round++) {
      const teams = fixtures.filter((f) => f.round === round).flatMap((f) => [f.homeId, f.awayId]);
      assert.equal(new Set(teams).size, 20, `rodada ${round}`);
    }
  });

  it("desempate: pontos, vitórias, saldo, gols pró", () => {
    const rows: Standing[] = [
      { clubId: "a", played: 10, won: 5, drawn: 3, lost: 2, gf: 15, ga: 10, points: 18 },
      { clubId: "b", played: 10, won: 6, drawn: 0, lost: 4, gf: 12, ga: 10, points: 18 },
      { clubId: "c", played: 10, won: 5, drawn: 3, lost: 2, gf: 16, ga: 11, points: 18 },
    ];
    assert.deepEqual(sortTable(rows).map((r) => r.clubId), ["b", "c", "a"]);
  });

  it("chave da copa com 60 clubes: 4 byes por reputação, ninguém é descartado", () => {
    const ids = Array.from({ length: 60 }, (_, index) => `club-${index}`);
    const first = cupBracket(ids, 99, ["club-7", "club-3", "club-11", "club-0", "club-1"])[0];
    assert.deepEqual(first, cupBracket(ids, 99, ["club-7", "club-3", "club-11", "club-0", "club-1"])[0]);
    assert.equal(first.length, 32);
    const byes = first.filter((f) => f.bye).map((f) => f.homeId).sort();
    assert.deepEqual(byes, ["club-0", "club-11", "club-3", "club-7"]);
    const everyone = new Set(first.flatMap((f) => [f.homeId, f.awayId]));
    assert.equal(everyone.size, 60);
    const played = first.map((f) => (f.bye ? f : { ...f, played: true, winnerId: f.homeId }));
    const second = nextCupRound(played, 99, 1);
    assert.equal(second.length, 16);
    assert.ok(second.every((f) => !f.bye));
    assert.equal(second[0].slot, "16avos de final");
  });

  it("pênaltis: placar coerente, ~50% com goleiros iguais, goleiro forte pesa", () => {
    let homeWins = 0;
    let maxKicks = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const r = resolvePenalties(30, 30, seed);
      assert.equal(r.winner, r.home > r.away ? "home" : "away");
      assert.notEqual(r.home, r.away);
      maxKicks = Math.max(maxKicks, r.home + r.away);
      if (r.winner === "home") homeWins++;
    }
    assert.ok(homeWins > 900 && homeWins < 1100, `mandante venceu ${homeWins}/2000`);
    assert.ok(maxKicks < 40);
    let strongKeeper = 0;
    for (let seed = 0; seed < 1000; seed++) if (resolvePenalties(48, 12, seed).winner === "home") strongKeeper++;
    assert.ok(strongKeeper > 650, `goleiro forte venceu ${strongKeeper}/1000`);
  });
});

describe("desenvolvimento", () => {
  function seasonDelta(age: number, trials = 300): number {
    let total = 0;
    for (let t = 0; t < trials; t++) {
      const p = player("x", "MF", 27, { age });
      const rng = mulberry32(t + 1);
      for (let g = 0; g < 38; g++) {
        const roll = rng();
        evolvePlayer(p, roll < 0.4 ? "win" : roll < 0.7 ? "draw" : "loss", 27, rng);
      }
      total += p.strength - 27;
    }
    return total / trials;
  }

  it("jovens evoluem, veteranos regridem, meio de carreira quase estável", () => {
    const young = seasonDelta(20);
    const prime = seasonDelta(27);
    const veteran = seasonDelta(34);
    assert.ok(young > 2 && young < 6, `jovem ${young}`);
    assert.ok(prime > 0 && prime < 2.5, `auge ${prime}`);
    assert.ok(veteran < -1 && veteran > -5, `veterano ${veteran}`);
  });

  it("quem está muito acima da média evolui mais devagar", () => {
    const p = player("x", "FW", 10, { age: 22 });
    const r = evolvePlayer(p, "win", 25, () => 0);
    assert.ok(r && r.note === "evoluiu");
    assert.equal(p.strength, 11);
    let gains = 0;
    for (let t = 0; t < 400; t++) {
      const top = player("y", "FW", 45, { age: 22 });
      if (evolvePlayer(top, "win", 25, mulberry32(t))?.note === "evoluiu") gains++;
    }
    let normal = 0;
    for (let t = 0; t < 400; t++) {
      const mid = player("z", "FW", 25, { age: 22 });
      if (evolvePlayer(mid, "win", 25, mulberry32(t))?.note === "evoluiu") normal++;
    }
    assert.ok(gains < normal);
  });

  it("forma física estabiliza acima de 60 para titular absoluto e reserva recupera", () => {
    const starter = player("s", "MF", 30);
    for (let g = 0; g < 40; g++) updateCondition(starter, true, "draw");
    assert.ok(starter.fitness > 60 && starter.fitness < 90, `titular ${starter.fitness}`);
    assert.equal(starter.matches, 40);
    const bench = player("b", "MF", 30, { fitness: 50 });
    for (let g = 0; g < 6; g++) updateCondition(bench, false, null);
    assert.ok(bench.fitness > 85);
  });

  it("envelhecimento: aos 38 aposenta, aos 34+ perde força", () => {
    const old = player("o", "DF", 30, { age: 37 });
    const r = agePlayer(old, () => 0.99);
    assert.equal(old.age, 38);
    assert.ok(r.retired);
    assert.ok(old.strength < 30);
    const kid = player("k", "DF", 20, { age: 20 });
    assert.ok(!agePlayer(kid, () => 0.99).retired);
    assert.equal(kid.strength, 20);
  });
});

describe("economia", () => {
  it("valor cresce com força e cai com idade; venda < compra; agente livre é mais barato", () => {
    const weak = player("w", "FW", 10);
    const strong = player("s", "FW", 40);
    assert.ok(playerValue(strong) > playerValue(weak) * 8);
    assert.ok(playerValue(player("y", "FW", 30, { age: 21 })) > playerValue(player("o", "FW", 30, { age: 33 })));
    assert.ok(sellPrice(strong) < aiTransferPrice(strong));
    assert.ok(sellPrice(strong) < aiTransferPrice(strong, 2_000_000), "mesmo com scouting máximo não há arbitragem");
    assert.ok(freeAgentFee(strong) < playerValue(strong));
    assert.ok(marketSalary(40, 1) > marketSalary(20, 1));
    assert.ok(marketSalary(30, 1) > marketSalary(30, 3));
  });

  it("preço de ingresso no teto não maximiza receita", () => {
    const c = club("c", squad("c", 30), "balanced", { rep: 70, stadiumCapacity: 40_000 });
    const admin = defaultAdminControls(c, 1);
    const revenueAt = (price: number) => roundFinance(c, { ...admin, ticketPrice: price }, { division: 1, homeGames: 1, wins: 0, draws: 0, losses: 0, cash: 0 }).tickets;
    const ref = revenueAt(admin.ticketPrice);
    assert.ok(revenueAt(300) < ref, "preço máximo rende menos que a referência");
    assert.ok(revenueAt(10) < ref, "preço mínimo rende menos que a referência");
    assert.ok(priceFactor(70, 35) < priceFactor(35, 35));
    assert.ok(attendanceRate(c, { ...admin, ticketPrice: 300 }, 1) < attendanceRate(c, admin, 1));
  });

  it("sócios reagem a mensalidade e reputação", () => {
    const c = club("c", squad("c", 30), "balanced", { rep: 70 });
    const admin = defaultAdminControls(c, 1);
    const base = membershipTarget(c, admin, 1);
    assert.ok(membershipTarget(c, { ...admin, membershipFee: 500 }, 1) < base);
    assert.ok(membershipTarget({ ...c, rep: 30 }, admin, 1) < base);
  });

  it("patrocínio é limitado pela reputação e o balanço fecha", () => {
    assert.equal(maxSponsorTier(30), 1);
    assert.equal(maxSponsorTier(80), 5);
    const c = club("c", squad("c", 30), "balanced", { rep: 40 });
    const admin = { ...defaultAdminControls(c, 2), sponsorTier: 5, debt: 1_000_000 };
    const f = roundFinance(c, admin, { division: 2, homeGames: 1, wins: 1, draws: 0, losses: 0, cash: -100_000 });
    const capped = roundFinance(c, { ...admin, sponsorTier: 2 }, { division: 2, homeGames: 1, wins: 1, draws: 0, losses: 0, cash: -100_000 });
    assert.equal(f.sponsor, capped.sponsor);
    assert.equal(f.total, f.income - f.expenses);
    assert.equal(f.income, f.tickets + f.membership + f.merchandise + f.sponsor + f.broadcast + f.prize);
    assert.equal(f.interest, 10_000);
    assert.equal(f.amortization, 25_000);
    assert.equal(f.overdraft, 1_000);
    assert.ok(f.prize > 0);
  });
});
