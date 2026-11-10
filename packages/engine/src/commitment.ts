import { cupPhaseAnchor } from "./league.ts";

export type CareerPhase = "inSeason" | "cupMidweek" | "awaitingCupAfterLeague" | "seasonReview" | "preseason";

export type CommitmentFixture = {
  round?: number;
  homeId: string;
  awayId: string;
  slot?: string;
  leg?: 1 | 2;
  singleLeg?: boolean;
  date?: string;
};

export type NextCommitment = {
  kind: "league" | "cup" | "seasonReview" | "preseason";
  phase: CareerPhase;
  fixture?: CommitmentFixture;
  label: string;
};

export type CommitmentCareer = {
  clubId: string;
  season: number;
  round: number;
  cupRound: number;
  cupFinalPlayed?: boolean;
  fixtures: { round: number; homeId: string; awayId: string; played: boolean; date?: string }[];
  cup: { slot: string; leg?: 1 | 2; singleLeg?: boolean; homeId: string; awayId: string; played: boolean; date?: string }[][];
  history?: { season: number }[];
};

export function cupIsDue(career: CommitmentCareer): boolean {
  const phase = career.cup[career.cupRound];
  if (!phase || phase.every((fixture) => fixture.played) || career.cupFinalPlayed) return false;
  if (career.fixtures.length > 0 && career.fixtures.every((fixture) => fixture.played)) return true;
  return career.round > cupPhaseAnchor(phase[0].slot, phase[0].leg ?? 1);
}

function userCupFixture(career: CommitmentCareer): CommitmentCareer["cup"][number][number] | undefined {
  const phase = career.cup[career.cupRound];
  return phase?.find((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId));
}

function userLeagueFixture(career: CommitmentCareer): CommitmentCareer["fixtures"][number] | undefined {
  return career.fixtures.find((fixture) => !fixture.played && fixture.round === career.round && (fixture.homeId === career.clubId || fixture.awayId === career.clubId))
    ?? career.fixtures.find((fixture) => !fixture.played && (fixture.homeId === career.clubId || fixture.awayId === career.clubId));
}

export function careerPhase(career: CommitmentCareer): CareerPhase {
  return nextCommitment(career).phase;
}

export function nextCommitment(career: CommitmentCareer): NextCommitment {
  const cupFixture = userCupFixture(career);
  const leagueLeft = career.fixtures.some((fixture) => !fixture.played);
  const leagueFixture = userLeagueFixture(career);
  const freshSeason = (career.history ?? []).some((item) => item.season === career.season - 1)
    && career.round <= 1
    && career.fixtures.every((fixture) => !fixture.played);

  if (cupIsDue(career) && cupFixture) {
    const leg = cupFixture.singleLeg ? "" : cupFixture.leg === 2 ? " · volta" : " · ida";
    return {
      kind: "cup",
      phase: leagueLeft ? "cupMidweek" : "awaitingCupAfterLeague",
      fixture: {
        round: career.round,
        homeId: cupFixture.homeId,
        awayId: cupFixture.awayId,
        slot: cupFixture.slot,
        leg: cupFixture.leg,
        singleLeg: cupFixture.singleLeg,
        date: cupFixture.date,
      },
      label: `Copa · ${cupFixture.slot}${leg}`,
    };
  }

  if (leagueFixture) {
    return {
      kind: freshSeason ? "preseason" : "league",
      phase: freshSeason ? "preseason" : "inSeason",
      fixture: { round: leagueFixture.round, homeId: leagueFixture.homeId, awayId: leagueFixture.awayId, date: leagueFixture.date },
      label: freshSeason ? `Pré-temporada · rodada ${leagueFixture.round}` : `Rodada ${leagueFixture.round}`,
    };
  }

  return { kind: "seasonReview", phase: "seasonReview", label: "Revisão da temporada" };
}
