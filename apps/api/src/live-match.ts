import { applyCommand, applyResult, defaultStarters, initMatch, simulateMatch, sortTable, stepMinute, type MatchCommand, type MatchResult, type MatchState } from "@techfoot/engine";
import { applyCupResult, httpError, simulateRound, type Career } from "./career.ts";
import { prisma } from "./db.ts";

export const LIVE_IDLE_MS = 24 * 60 * 60 * 1000;

type OtherGame = MatchResult & { goals: { minute: number; side: "home" | "away" }[] };

type Envelope = {
  state: MatchState;
  checkpoint: MatchState;
  chunkFrom: number;
};

function toResult(state: MatchState): MatchResult {
  return {
    homeId: state.home.clubId,
    awayId: state.away.clubId,
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    events: state.events,
    shots: state.shots,
    cards: state.cards,
    injuries: state.injuries,
    seed: state.seed,
    substitutions: state.substitutions,
  };
}

function goalsOf(result: MatchResult): OtherGame["goals"] {
  return result.events.filter((event) => event.kind === "goal").map((event) => ({ minute: event.minute, side: event.side === "away" ? "away" : "home" }));
}

export function scoreAt(game: OtherGame, minute: number): { homeId: string; awayId: string; homeGoals: number; awayGoals: number } {
  let homeGoals = 0;
  let awayGoals = 0;
  for (const goal of game.goals) {
    if (goal.minute <= minute) {
      if (goal.side === "home") homeGoals += 1;
      else awayGoals += 1;
    }
  }
  return { homeId: game.homeId, awayId: game.awayId, homeGoals, awayGoals };
}

function parseEnvelope(raw: string): Envelope {
  return JSON.parse(raw) as Envelope;
}

function cardCount(events: MatchResult["events"], side: "home" | "away", minute: number) {
  return {
    yellow: events.filter((event) => event.kind === "yellow" && event.side === side && event.minute <= minute).length,
    red: events.filter((event) => event.kind === "red" && event.side === side && event.minute <= minute).length,
  };
}

function projectTable(career: Career, state: MatchState, others: OtherGame[]) {
  let table = career.table.map((row) => ({ ...row, yellows: row.yellows ?? 0, reds: row.reds ?? 0, form: [...(row.form ?? [])] }));
  const overlays: { homeId: string; awayId: string; homeGoals: number; awayGoals: number; home: { yellow: number; red: number }; away: { yellow: number; red: number } }[] = [];
  const push = (homeId: string, awayId: string, homeGoals: number, awayGoals: number, home: { yellow: number; red: number }, away: { yellow: number; red: number }) => {
    if (state.minute <= 0 || (homeGoals === 0 && awayGoals === 0)) return;
    overlays.push({ homeId, awayId, homeGoals, awayGoals, home, away });
  };
  push(state.home.clubId, state.away.clubId, state.score[0], state.score[1], cardCount(state.events, "home", state.minute), cardCount(state.events, "away", state.minute));
  for (const game of others) {
    const score = scoreAt(game, state.minute);
    push(game.homeId, game.awayId, score.homeGoals, score.awayGoals, cardCount(game.events, "home", state.minute), cardCount(game.events, "away", state.minute));
  }
  for (const overlay of overlays) table = applyResult(table, overlay.homeId, overlay.awayId, overlay.homeGoals, overlay.awayGoals, { home: overlay.home, away: overlay.away });
  const played = career.fixtures.filter((fixture) => fixture.played && fixture.result).map((fixture) => ({
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: fixture.result!.homeGoals,
    awayGoals: fixture.result!.awayGoals,
  }));
  return sortTable(table, [...played, ...overlays], career.seed);
}

function view(row: { id: string; kind: string; round: number; status: string; version: number; updatedAt: Date }, envelope: Envelope, others: OtherGame[], career: Career | null = null) {
  const state = envelope.state;
  const slim = (side: MatchState["home"]) => ({
    clubId: side.clubId,
    name: side.name,
    colors: side.colors,
    tactic: side.tactic,
    formation: side.formation,
    onPitch: side.onPitch,
    bench: side.bench,
    subsUsed: side.subsUsed,
    windowsUsed: side.windowsUsed,
    players: side.players.map((player) => ({ id: player.id, name: player.name, position: player.position, fit: Math.round(player.fit), off: player.off, injured: player.injured })),
  });
  return {
    id: row.id,
    kind: row.kind,
    round: row.round,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt,
    minute: state.minute,
    period: state.period,
    stoppage: state.stoppage,
    stoppagePlayed: state.stoppagePlayed,
    score: state.score,
    momentum: state.momentum,
    shots: state.shots,
    cards: state.cards,
    penalties: state.penalties ?? null,
    home: slim(state.home),
    away: slim(state.away),
    other: others.map((game) => scoreAt(game, state.minute)),
    table: career ? projectTable(career, state, others) : [],
  };
}

async function owned(saveId: string, userId: string) {
  const save = await prisma.save.findFirst({ where: { id: saveId, userId } });
  if (!save) throw httpError("Save não encontrado", 404);
  return save;
}

export async function settleIdle(saveId: string, userId: string): Promise<void> {
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (!live || (live.status !== "live" && live.status !== "halftime")) return;
  if (Date.now() - live.updatedAt.getTime() < LIVE_IDLE_MS) return;
  await finishLive(saveId, userId, true);
}

export async function liveSummary(saveId: string, userId: string) {
  await settleIdle(saveId, userId);
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (!live || live.status === "finished" || live.status === "abandoned") return null;
  const save = await owned(saveId, userId);
  if (save.id !== saveId) return null;
  const envelope = parseEnvelope(live.state);
  const mine = envelope.state.home.clubId === JSON.parse(save.payload).clubId ? envelope.state.home : envelope.state.away;
  const opponent = mine === envelope.state.home ? envelope.state.away : envelope.state.home;
  const score = envelope.state.home.clubId === mine.clubId ? envelope.state.score : [envelope.state.score[1], envelope.state.score[0]] as [number, number];
  return {
    id: live.id,
    minute: envelope.state.minute,
    period: envelope.state.period,
    status: live.status,
    score,
    opponent: opponent.name,
    club: mine.name,
  };
}

export async function startMatchday(saveId: string, userId: string) {
  await settleIdle(saveId, userId);
  const save = await owned(saveId, userId);
  const existing = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (existing && (existing.status === "live" || existing.status === "halftime")) {
    const envelope = parseEnvelope(existing.state);
    const resumedCareer = JSON.parse(save.payload) as Career;
    return { live: view(existing, envelope, JSON.parse(existing.otherGames) as OtherGame[], resumedCareer), events: envelope.state.events, career: resumedCareer };
  }
  if (existing) await prisma.liveMatch.delete({ where: { id: existing.id } });
  const career = JSON.parse(save.payload) as Career;
  const map = new Map(career.clubs.map((club) => [club.id, club]));
  const me = map.get(career.clubId);
  if (!me) throw httpError("Clube não encontrado", 404);
  if (career.cupPending) {
    const tie = career.cup[career.cupRound]?.find((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId));
    if (!tie) throw httpError("Não há jogo de copa pendente", 409);
    const home = map.get(tie.homeId);
    const away = map.get(tie.awayId);
    if (!home || !away) throw httpError("Confronto inválido", 400);
    const state = initMatch(sideFor(career, home), sideFor(career, away), career.seed + 8000 + career.cupRound, { kind: "cup", homeAi: false, awayAi: true, decider: tie.singleLeg === true });
    const envelope: Envelope = { state, checkpoint: state, chunkFrom: 0 };
    const created = await prisma.liveMatch.create({
      data: { saveId, kind: "cup", round: career.round, state: JSON.stringify(envelope), otherGames: "[]", status: "live", version: 1 },
    });
    return { live: view(created, envelope, [], career), events: [], career };
  }
  const roundGames = career.fixtures.filter((fixture) => fixture.round === career.round && !fixture.played);
  const mine = roundGames.find((fixture) => fixture.homeId === career.clubId || fixture.awayId === career.clubId);
  if (!mine) throw httpError("Rodada já simulada", 409);
  const home = map.get(mine.homeId);
  const away = map.get(mine.awayId);
  if (!home || !away) throw httpError("Confronto inválido", 400);
  const state = initMatch(sideFor(career, home), sideFor(career, away), career.seed + career.round * 1000, { kind: "league", homeAi: false, awayAi: true });
  const others: OtherGame[] = [];
  let offset = 0;
  for (const fixture of roundGames) {
    if (fixture === mine) continue;
    offset += 1;
    const otherHome = map.get(fixture.homeId);
    const otherAway = map.get(fixture.awayId);
    if (!otherHome || !otherAway) continue;
    const result = simulateMatch(
      { club: otherHome, starterIds: defaultStarters(otherHome.players), tactic: otherHome.tactic },
      { club: otherAway, starterIds: defaultStarters(otherAway.players), tactic: otherAway.tactic },
      career.seed + career.round * 1000 + offset,
    );
    others.push({ ...result, goals: goalsOf(result) });
  }
  const envelope: Envelope = { state, checkpoint: structuredClone(state), chunkFrom: 0 };
  const created = await prisma.liveMatch.create({
    data: { saveId, kind: "league", round: career.round, state: JSON.stringify(envelope), otherGames: JSON.stringify(others), status: "live", version: 1 },
  });
  return { live: view(created, envelope, others, career), events: [], career };
}

function sideFor(career: Career, club: Career["clubs"][number]) {
  const mine = club.id === career.clubId;
  return {
    club,
    starterIds: mine ? career.starterIds : defaultStarters(club.players),
    benchIds: mine ? career.benchIds : undefined,
    captainId: mine ? career.captainId : undefined,
    tactic: club.tactic,
    formation: mine ? career.formation : "4-3-3" as const,
    substitutions: mine ? career.substitutions : undefined,
  };
}

function stepToward(state: MatchState, toMinute: number): { state: MatchState; events: MatchState["events"] } {
  const events: MatchState["events"] = [];
  let guard = 0;
  const jump = toMinute >= 120;
  while (guard < (jump ? 80 : 20) && state.period !== "HT" && state.period !== "FT" && state.period !== "PEN") {
    const beforeMinute = state.minute;
    const stepped = stepMinute(state);
    state = stepped.state;
    events.push(...stepped.events);
    guard += 1;
    if (state.period === "HT" || state.period === "FT" || state.period === "PEN") break;
    if (!jump && toMinute <= beforeMinute) break;
    if (!jump && state.minute >= toMinute) break;
  }
  return { state, events };
}

export async function advanceLive(saveId: string, userId: string, toMinute: number, version: number) {
  const save = await owned(saveId, userId);
  const career = JSON.parse(save.payload) as Career;
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (!live || (live.status !== "live" && live.status !== "halftime")) throw httpError("Não há jogo em andamento", 409);
  if (live.version !== version) throw httpError("O jogo avançou em outro lugar. Atualize.", 409);
  const envelope = parseEnvelope(live.state);
  if (envelope.state.period === "HT" || envelope.state.period === "FT") {
    const others = JSON.parse(live.otherGames) as OtherGame[];
    return { live: view(live, envelope, others, career), events: [], replaceEvents: false };
  }
  envelope.checkpoint = structuredClone(envelope.state);
  envelope.chunkFrom = envelope.state.minute;
  const stepped = stepToward(envelope.state, toMinute);
  envelope.state = stepped.state;
  const status = envelope.state.period === "HT" ? "halftime" : "live";
  const updated = await prisma.liveMatch.update({
    where: { id: live.id },
    data: { state: JSON.stringify(envelope), status, version: { increment: 1 } },
  });
  const others = JSON.parse(updated.otherGames) as OtherGame[];
  return { live: view(updated, envelope, others, career), events: stepped.events, replaceEvents: false };
}

export async function commandLive(saveId: string, userId: string, atMinute: number, command: MatchCommand, version: number) {
  const save = await owned(saveId, userId);
  const career = JSON.parse(save.payload) as Career;
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (!live || (live.status !== "live" && live.status !== "halftime")) throw httpError("Não há jogo em andamento", 409);
  if (live.version !== version) throw httpError("O jogo avançou em outro lugar. Atualize.", 409);
  const envelope = parseEnvelope(live.state);
  if (command.type === "resume" || envelope.state.period === "HT") {
    envelope.state = applyCommand(envelope.state, command);
    const updated = await prisma.liveMatch.update({
      where: { id: live.id },
      data: { state: JSON.stringify(envelope), status: "live", version: { increment: 1 } },
    });
    const others = JSON.parse(updated.otherGames) as OtherGame[];
    return { live: view(updated, envelope, others, career), events: [], replaceEvents: false };
  }
  if (atMinute < envelope.chunkFrom || atMinute > envelope.state.minute) throw httpError("A substituição só vale neste trecho do jogo", 400);
  let state = structuredClone(envelope.checkpoint);
  let guard = 0;
  while (guard < 40 && state.minute < atMinute && state.period !== "HT" && state.period !== "FT") {
    state = stepMinute(state).state;
    guard += 1;
  }
  state = applyCommand(state, command);
  const targetMinute = envelope.state.minute;
  const targetStop = envelope.state.stoppagePlayed;
  guard = 0;
  while (guard < 40 && state.period !== "HT" && state.period !== "FT" && (state.minute < targetMinute || (state.minute === targetMinute && state.stoppagePlayed < targetStop))) {
    state = stepMinute(state).state;
    guard += 1;
  }
  envelope.state = state;
  const status = state.period === "HT" ? "halftime" : state.period === "FT" ? "live" : live.status;
  const updated = await prisma.liveMatch.update({
    where: { id: live.id },
    data: { state: JSON.stringify(envelope), status, version: { increment: 1 } },
  });
  const others = JSON.parse(updated.otherGames) as OtherGame[];
  return { live: view(updated, envelope, others, career), events: state.events, replaceEvents: true };
}

export async function resumeLive(saveId: string, userId: string, version: number) {
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  const minute = live ? parseEnvelope(live.state).state.minute : 0;
  return commandLive(saveId, userId, minute, { type: "resume" }, version);
}

export async function finishLive(saveId: string, userId: string, withAi = false) {
  return prisma.$transaction(async (tx) => {
    const save = await tx.save.findFirst({ where: { id: saveId, userId } });
    if (!save) throw httpError("Save não encontrado", 404);
    const live = await tx.liveMatch.findUnique({ where: { saveId } });
    const career = JSON.parse(save.payload) as Career;
    if (!live || live.status === "finished" || live.status === "abandoned") return { career, already: true, userMatch: career.lastRoundEvents };
    const envelope = parseEnvelope(live.state);
    if (withAi) envelope.state.home.ai = true;
    let guard = 0;
    while (envelope.state.period !== "FT" && guard < 160) {
      if (envelope.state.period === "HT") envelope.state = applyCommand(envelope.state, { type: "resume" });
      else envelope.state = stepMinute(envelope.state).state;
      guard += 1;
    }
    const userMatch = toResult(envelope.state);
    if (live.kind === "cup") applyCupResult(career, userMatch, envelope.state.penalties);
    else {
      const others = JSON.parse(live.otherGames) as OtherGame[];
      simulateRound(career, [userMatch, ...others].map((result) => ({ homeId: result.homeId, awayId: result.awayId, result })));
    }
    await tx.save.update({ where: { id: save.id }, data: { payload: JSON.stringify(career) } });
    await tx.liveMatch.update({ where: { id: live.id }, data: { status: "finished", state: JSON.stringify(envelope), version: { increment: 1 } } });
    return { career, already: false, userMatch };
  });
}

export async function readLive(saveId: string, userId: string) {
  await settleIdle(saveId, userId);
  const save = await owned(saveId, userId);
  const live = await prisma.liveMatch.findUnique({ where: { saveId } });
  if (!live || live.status === "finished" || live.status === "abandoned") return { live: null, career: JSON.parse(save.payload) as Career };
  const envelope = parseEnvelope(live.state);
  const career = JSON.parse(save.payload) as Career;
  return { live: view(live, envelope, JSON.parse(live.otherGames) as OtherGame[], career), events: envelope.state.events, career };
}
