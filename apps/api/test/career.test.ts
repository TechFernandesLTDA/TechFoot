import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiTransferPrice, maxSponsorTier, sellPrice, type Club, type Player } from "@techfoot/engine";
import {
  buyPlayer, createCareer, normalizeCareer, renewContract, sellPlayer, setMatchPlan, simulateRound, SQUAD_MIN, stadiumUpgradeCost,
  takeLoan, updateAdmin, type Career,
} from "../src/career.ts";

function fresh(clubId = "athletico-paranaense", seed = 777): Career {
  const career = createCareer(clubId, 2026, seed);
  return career;
}

function my(career: Career): Club {
  return career.clubs.find((c) => c.id === career.clubId)!;
}

function playSeason(career: Career): Career {
  const season = career.season;
  let guard = 0;
  while (career.season === season) {
    career = simulateRound(career).career;
    if (++guard > 60) throw new Error("temporada não terminou");
  }
  return career;
}

describe("rodada", () => {
  it("jogador suspenso não joga na rodada seguinte e volta depois", () => {
    let career = fresh();
    const club = my(career);
    const star = club.players.find((p) => career.starterIds.includes(p.id) && p.position === "FW")!;
    star.suspendedGames = 1;
    const matchesBefore = star.matches;
    career = simulateRound(career).career;
    assert.equal(my(career).players.find((p) => p.id === star.id)!.matches, matchesBefore, "suspenso não entrou em campo");
    assert.equal(my(career).players.find((p) => p.id === star.id)!.suspendedGames, 0, "cumpriu a suspensão");
    // repairPlan preenche a escalação com jogadores disponíveis; se houver muitos lesionados/suspensos,
    // pode haver menos de 11, mas o importante é que o suspenso não jogou e cumpriu a punição
  });

  it("cartão vermelho gera suspensão que é cumprida (não zera antes do próximo jogo)", () => {
    let career = fresh("corinthians", 31);
    let punished: Player | undefined;
    for (let i = 0; i < 20 && !punished; i++) {
      const result = simulateRound(career);
      career = result.career;
      const red = result.userMatch?.events.find((e) => e.kind === "red" && e.teamId === career.clubId);
      if (red) punished = my(career).players.find((p) => p.id === red.playerId);
    }
    assert.ok(punished, "nenhum vermelho em 20 rodadas");
    assert.ok(punished!.suspendedGames >= 1, `suspensão pendente após a rodada (${punished!.suspendedGames})`);
    const before = punished!.matches;
    career = simulateRound(career).career;
    assert.equal(my(career).players.find((p) => p.id === punished!.id)!.matches, before, "cumpriu suspensão na rodada seguinte");
  });

  it("lesão respeita a gravidade informada pela simulação", () => {
    let career = fresh("gremio", 99);
    for (let i = 0; i < 15; i++) {
      const result = simulateRound(career);
      career = result.career;
      const match = result.userMatch;
      if (!match || !match.injuryDetails?.length) continue;
      for (const detail of match.injuryDetails) {
        const p = career.clubs.flatMap((c) => c.players).find((x) => x.id === detail.playerId);
        if (!p) continue;
        assert.equal(p.injuredGames, detail.games - 1, "primeira semana já contada");
        return;
      }
    }
    assert.fail("nenhuma lesão em 15 rodadas");
  });

  it("finanças: extrato detalhado, sócios e dívida amortizada", () => {
    let career = fresh();
    career = takeLoan(career, 1_000_000);
    const debtBefore = career.admin.debt;
    const cashBefore = my(career).cash;
    career = simulateRound(career).career;
    assert.ok(career.admin.debt < debtBefore, "amortizou parte da dívida");
    assert.ok(career.ledger.some((e) => e.label.startsWith("Bilheteria")));
    assert.ok(career.ledger.some((e) => e.label === "Folha salarial"));
    assert.ok(career.ledger.some((e) => e.label.includes("dívida")));
    assert.equal(career.finances, my(career).cash);
    const net = career.ledger.filter((e) => e.round === 1).reduce((s, e) => s + e.amount, 0);
    assert.equal(my(career).cash - cashBefore, net, "caixa bate com o extrato da rodada");
  });

  it("todos os clubes evoluem e se desgastam, não só o do usuário", () => {
    let career = fresh("amazonas", 5);
    const snapshot = new Map(career.clubs.flatMap((c) => c.players.map((p) => [p.id, { strength: p.strength, fitness: p.fitness }])));
    for (let i = 0; i < 6; i++) career = simulateRound(career).career;
    const changed = career.clubs.filter((c) => c.id !== career.clubId && c.players.some((p) => snapshot.get(p.id)!.strength !== p.strength || snapshot.get(p.id)!.fitness !== p.fitness));
    assert.ok(changed.length > 40, `apenas ${changed.length} clubes mudaram`);
  });
});

describe("temporada", () => {
  it("copa termina com campeão, ninguém é eliminado sem jogar, e a temporada vira", () => {
    let career = fresh("america-mineiro", 2024);
    const season = career.season;
    const first = career.cup[0];
    assert.equal(new Set(first.flatMap((f) => [f.homeId, f.awayId])).size, 60);
    assert.equal(first.filter((f) => f.bye).length, 4);
    const ages = new Map(career.clubs.flatMap((c) => c.players.map((p) => [p.id, p.age])));
    career = playSeason(career);
    assert.equal(career.season, season + 1);
    assert.equal(career.round, 1);
    assert.ok(career.inbox.some((m) => m.id === `cup-champ-${season}`), "copa teve campeão");
    assert.ok(career.inbox.some((m) => m.id === `season-${season}` && m.body.includes("Série B")), "mensagem cita a divisão certa");
    assert.equal([1, 2, 3].map((d) => career.clubs.filter((c) => c.division === d).length).join("/"), "20/20/20");
    assert.ok(career.fixtures.every((f) => !f.played));
    assert.equal(career.cupRound, 0);
    for (const c of career.clubs) {
      assert.ok(c.players.length >= 14 && c.players.length <= 22, `${c.name} com ${c.players.length} jogadores`);
      for (const p of c.players) {
        const before = ages.get(p.id);
        if (before !== undefined) assert.equal(p.age, before + 1);
        assert.ok(p.age < 38);
      }
    }
    assert.ok(my(career).players.length >= SQUAD_MIN);
  });

  it("Série C tem turno único de 19 rodadas", () => {
    const career = fresh("amazonas");
    assert.equal(Math.max(...career.fixtures.map((f) => f.round)), 19);
    assert.equal(career.fixtures.length, 190);
  });
});

describe("mercado e contratos", () => {
  it("não há arbitragem: comprar e vender o mesmo jogador dá prejuízo", () => {
    let career = fresh();
    const target = career.market.find((m) => m.clubId && m.clubId !== career.clubId)!;
    const seller = career.clubs.find((c) => c.id === target.clubId)!;
    const player = seller.players.find((p) => p.id === target.playerId)!;
    assert.equal(target.price, aiTransferPrice(player, career.admin.scoutingBudget));
    const cashBefore = my(career).cash;
    career = buyPlayer(career, target.playerId);
    assert.equal(my(career).cash, cashBefore - target.price);
    assert.ok(!seller.players.some((p) => p.id === target.playerId));
    const bought = my(career).players.find((p) => p.id === target.playerId)!;
    assert.equal(bought.contractGames, 38);
    career.starterIds = career.starterIds.filter((id) => id !== target.playerId);
    const expectedSale = sellPrice(bought);
    career = sellPlayer(career, target.playerId);
    assert.ok(my(career).cash < cashBefore, "ciclo compra+venda perde dinheiro");
    assert.equal(my(career).cash - cashBefore, expectedSale - target.price);
    const owner = career.clubs.find((c) => c.players.some((p) => p.id === target.playerId));
    assert.ok(owner && owner.id !== career.clubId, "jogador vendido foi para outro clube");
  });

  it("agentes livres aparecem no mercado com luvas e contrato expirado libera o jogador", () => {
    let career = fresh();
    const club = my(career);
    const victim = club.players.find((p) => !career.starterIds.includes(p.id))!;
    victim.contractGames = 1;
    career = simulateRound(career).career;
    assert.ok(career.freeAgents.some((p) => p.id === victim.id), "jogador virou agente livre");
    const entry = career.market.find((m) => m.playerId === victim.id)!;
    assert.equal(entry.clubId, null);
    assert.ok(entry.price < aiTransferPrice(victim));
  });

  it("renovação ajusta salário ao mercado e cobra luvas", () => {
    let career = fresh();
    const p = my(career).players[3];
    const cash = my(career).cash;
    const { career: next, cost } = renewContract(career, p.id);
    career = next;
    assert.ok(cost > 0);
    assert.equal(my(career).cash, cash - cost);
    assert.equal(p.contractGames, 38);
  });

  it("elenco não fica abaixo do mínimo: diretoria renova em emergência", () => {
    let career = fresh("amazonas", 3);
    for (const p of my(career).players) p.contractGames = 1;
    career = simulateRound(career).career;
    assert.ok(my(career).players.length >= SQUAD_MIN);
    assert.ok(career.inbox.some((m) => m.id.startsWith("emg-")));
  });
});

describe("plano de jogo e administração", () => {
  it("escalação exige exatamente um goleiro", () => {
    const career = fresh();
    const club = my(career);
    const keepers = club.players.filter((p) => p.position === "GK").map((p) => p.id);
    const outfield = club.players.filter((p) => p.position !== "GK").map((p) => p.id);
    assert.throws(() => setMatchPlan(career, { starterIds: [...keepers.slice(0, 2), ...outfield.slice(0, 9)] }), /goleiro/);
    assert.throws(() => setMatchPlan(career, { starterIds: outfield.slice(0, 11) }), /goleiro/);
    setMatchPlan(career, { starterIds: [keepers[0], ...outfield.slice(0, 10)], formation: "4-4-2" });
    assert.equal(career.formation, "4-4-2");
    assert.equal(career.benchIds.length, 5);
  });

  it("patrocínio é limitado pela reputação e ampliação do estádio custa proporcional", () => {
    let career = fresh("amazonas");
    const club = my(career);
    career = updateAdmin(career, { sponsorTier: 5 });
    assert.equal(career.admin.sponsorTier, maxSponsorTier(club.rep));
    assert.ok(career.inbox.some((m) => m.id.startsWith("spons-")));
    const cash = club.cash;
    const cost = stadiumUpgradeCost(club, 1, 2);
    career = updateAdmin(career, { stadiumLevel: 2 });
    assert.equal(club.cash, cash - cost);
    career = updateAdmin(career, { stadiumLevel: 1 });
    assert.equal(career.admin.stadiumLevel, 2, "obra não é desfeita");
    assert.throws(() => takeLoan(career, 50_000), /Empréstimo/);
  });

  it("save antigo é normalizado sem quebrar", () => {
    const career = fresh();
    const legacy = JSON.parse(JSON.stringify(career)) as Career;
    legacy.starterIds = ["inexistente"];
    legacy.benchIds = undefined as never;
    legacy.substitutions = undefined as never;
    (legacy.admin as { membershipCount?: number }).membershipCount = undefined;
    for (const c of legacy.clubs) for (const p of c.players) (p as { fitness?: number }).fitness = undefined;
    const fixed = normalizeCareer(legacy);
    assert.equal(fixed.starterIds.length, 11);
    assert.equal(fixed.benchIds.length, 5);
    assert.ok(fixed.admin.membershipCount > 0);
    assert.ok(fixed.starterIds.includes(fixed.captainId));
    const next = simulateRound(fixed);
    assert.ok(next.userMatch);
  });
});
