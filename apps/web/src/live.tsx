import { useEffect, useMemo, useState } from "react";
import { api, type Career, type LiveEvent, type LivePayload, type LiveView } from "./api";

const SPEEDS = [1, 2, 4] as const;

function clock(live: LiveView): string {
  if (live.period === "HT") return "INTERVALO";
  if (live.period === "FT") return "FIM";
  if (live.stoppage > 0 && live.minute >= 45) return `${live.minute}+${live.stoppagePlayed || live.stoppage}`;
  return `${live.minute}'`;
}

function playerName(live: LiveView, id?: string): string {
  return [...live.home.players, ...live.away.players].find((player) => player.id === id)?.name ?? "Jogador";
}

export function LiveMatch({ initial, onCareer, onClose }: { initial: LivePayload; onCareer: (career: Career) => void; onClose: () => void }) {
  const [live, setLive] = useState(initial.live);
  const [log, setLog] = useState<LiveEvent[]>(initial.events);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number] | "jump">(1);
  const [paused, setPaused] = useState(false);
  const [autoPause, setAutoPause] = useState(true);
  const [goal, setGoal] = useState<LiveEvent | null>(null);
  const [tab, setTab] = useState<"narracao" | "estatisticas" | "rodada" | "time">("narracao");
  const [outId, setOutId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [talk, setTalk] = useState<"calma" | "cobrar" | "motivar" | null>(null);
  const [finished, setFinished] = useState<Career | null>(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const ticket = useMemo(() => ({ current: 0 }), []);

  const names = useMemo(() => new Map(initial.career.clubs.map((club) => [club.id, club.name])), [initial.career.clubs]);
  const rounds = Math.max(...initial.career.fixtures.map((fixture) => fixture.round));

  async function applyStep(step: { live: LiveView; events: LiveEvent[]; replaceEvents: boolean }) {
    setLive(step.live);
    setLog((current) => step.replaceEvents ? step.events : [...current, ...step.events]);
    const scored = [...step.events].reverse().find((event) => event.kind === "goal");
    if (scored) setGoal(scored);
    if (step.events.some((event) => event.big)) setSpeed(1);
    const mineIsHome = step.live.home.clubId === initial.career.clubId;
    const conceded = step.events.some((event) => event.kind === "goal" && event.teamId !== initial.career.clubId);
    const bad = step.events.some((event) => event.kind === "injury" || event.kind === "red");
    const losing = mineIsHome ? step.live.score[0] < step.live.score[1] : step.live.score[1] < step.live.score[0];
    if (autoPause && (conceded || bad || (step.live.minute >= 75 && losing && step.live.period === "2T"))) setPaused(true);
    if (step.live.period === "FT") {
      const done = await api.finish(step.live.id, step.live.version);
      setFinished(done.career);
      onCareer(done.career);
      setPaused(true);
    }
  }

  useEffect(() => {
    if (paused || acting || live.period === "HT" || live.period === "FT" || finished) return;
    const mine = ++ticket.current;
    const delay = speed === "jump" ? 40 : speed === 4 ? 300 : speed === 2 ? 600 : 1200;
    const timer = window.setTimeout(() => {
      const target = speed === "jump" ? 200 : live.minute + 1;
      void api.advance(live.id, target, live.version).then((step) => {
        if (mine === ticket.current) return applyStep(step);
      }).catch((err: Error) => setError(err.message));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [paused, acting, speed, live.period, live.minute, live.version, live.id, finished]);

  async function substitute(inId: string) {
    if (!outId || acting) return;
    const mine = ++ticket.current;
    setActing(true);
    try {
      const step = await api.command(live.id, live.minute, live.version, { type: "sub", outId, inId });
      if (mine !== ticket.current) return;
      setOutId(null);
      setSheet(false);
      await applyStep(step);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(false);
    }
  }

  async function resume() {
    if (acting) return;
    const mine = ++ticket.current;
    setActing(true);
    try {
      let version = live.version;
      if (talk) {
        const talked = await api.command(live.id, live.minute, version, { type: "talk", talk });
        version = talked.live.version;
      }
      const step = await api.resume(live.id, version);
      if (mine !== ticket.current) return;
      setTalk(null);
      await applyStep(step);
      setPaused(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(false);
    }
  }

  const homeColor = live.home.colors[0] ?? "#1f7a4d";
  const awayColor = live.away.colors[0] ?? "#a33b3b";
  const momentum = Math.max(0, Math.min(100, 50 + live.momentum / 2));
  const before = initial.career.table.findIndex((row) => row.clubId === initial.career.clubId);
  const after = finished?.table.findIndex((row) => row.clubId === finished.clubId) ?? before;
  const ratings = [...live.home.players, ...live.away.players].filter((player) => live.home.onPitch.includes(player.id) || live.away.onPitch.includes(player.id) || player.off);
  const motm = [...live.home.players, ...live.away.players].slice().sort((a, b) => b.fit - a.fit)[0];

  return (
    <div className={`live-shell ${sheet ? "is-sheet" : ""}`} data-testid="live-board">
      <header className="live-board">
        <div className="live-side"><i className="live-crest" style={{ background: homeColor }} />{live.home.name}</div>
        <div className="live-score"><strong>{live.score[0]} × {live.score[1]}</strong><span>{clock(live)}</span></div>
        <div className="live-side live-side--away"><i className="live-crest" style={{ background: awayColor }} />{live.away.name}</div>
      </header>
      <div className="momentum" aria-label="Momento"><i style={{ width: `${momentum}%` }} /></div>
      <div className="live-controls">
        <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Continuar" : "Pausar"}</button>
        {SPEEDS.map((value) => <button key={value} type="button" className={speed === value ? "is-selected" : ""} onClick={() => setSpeed(value)}>{value}x</button>)}
        <button type="button" data-testid="jump" className={speed === "jump" ? "is-selected" : ""} onClick={() => { setSpeed("jump"); setPaused(false); }}>Até a parada</button>
        <label><input type="checkbox" checked={autoPause} onChange={(event) => setAutoPause(event.target.checked)} /> Pausar nos lances</label>
      </div>
      {live.stoppage > 0 && live.stoppagePlayed === 0 ? <p className="stoppage-board" data-testid="stoppage">Placa: +{live.stoppage}</p> : null}
      {goal ? <button className="goal-flash" data-testid="goal-flash" type="button" onClick={() => setGoal(null)}>GOOOL! {goal.minute}' {playerName(live, goal.playerId)} – {names.get(goal.teamId) ?? ""} {live.score[0]}x{live.score[1]}</button> : null}
      <div className="live-layout">
        <aside className={tab === "time" ? "is-active" : ""}>
          <h3>Seu time</h3>
          {live.home.players.filter((player) => live.home.onPitch.includes(player.id)).map((player) => (
            <button key={player.id} type="button" className={outId === player.id ? "is-selected" : ""} onClick={() => { setOutId(player.id); setSheet(true); }}>
              {player.name}<small>{player.fit}%</small>
              <i className="fit-bar"><b style={{ width: `${player.fit}%` }} /></i>
            </button>
          ))}
          <h3>Banco · {live.home.subsUsed}/5</h3>
          {live.home.players.filter((player) => live.home.bench.includes(player.id)).map((player) => (
            <button key={player.id} type="button" disabled={!outId} onClick={() => void substitute(player.id)}>{player.name}<small>{player.fit}%</small></button>
          ))}
        </aside>
        <section className={tab === "narracao" ? "is-active" : ""}>
          <ol className="commentary">{log.slice(-12).map((event, index) => <li key={`${event.minute}-${event.kind}-${index}`}>{event.minute}' {event.text}</li>)}</ol>
        </section>
        <aside className={tab === "rodada" ? "is-active" : ""}>
          <h3>Rodada {live.round} de {rounds}</h3>
          {live.other.map((game) => <p key={`${game.homeId}-${game.awayId}`}>{names.get(game.homeId)} {game.homeGoals} × {game.awayGoals} {names.get(game.awayId)}</p>)}
          <div className="mini-table live-table">{live.table.slice(0, 10).map((row, index) => <div key={row.clubId} className={`mini-table__row ${row.clubId === initial.career.clubId ? "is-current" : ""}`}><b>{index + 1}</b><span>{names.get(row.clubId)}</span><strong>{row.points}</strong></div>)}</div>
        </aside>
      </div>
      <nav className="live-tabs">
        {(["narracao", "estatisticas", "rodada", "time"] as const).map((item) => <button key={item} type="button" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "narracao" ? "Narração" : item === "estatisticas" ? "Estatísticas" : item === "rodada" ? "Rodada" : "Time"}</button>)}
      </nav>
      {tab === "estatisticas" ? <p className="live-stats">Chutes {live.shots.home}–{live.shots.away} · Amarelos {live.cards.home.yellow}–{live.cards.away.yellow} · Vermelhos {live.cards.home.red}–{live.cards.away.red}</p> : null}
      {sheet && outId ? <div className="sub-sheet" data-testid="sub-sheet"><p>Sai {playerName(live, outId)}. Escolha quem entra.</p>{live.home.players.filter((player) => live.home.bench.includes(player.id)).map((player) => <button key={player.id} type="button" data-testid="sub-confirm" onClick={() => void substitute(player.id)}>{player.name} · {player.fit}%</button>)}</div> : null}
      {live.period === "HT" && !finished ? (
        <section className="half-time" data-testid="half-time">
          <h2>Intervalo</h2>
          <p>Chutes {live.shots.home} a {live.shots.away}. Melhor momento: {motm?.name}.</p>
          <p>Cansados: {live.home.players.filter((player) => live.home.onPitch.includes(player.id) && player.fit < 70).map((player) => player.name).join(", ") || "ninguém abaixo de 70%."}</p>
          <div className="talks">
            {(["calma", "cobrar", "motivar"] as const).map((item) => <button key={item} type="button" className={talk === item ? "is-selected" : ""} onClick={() => setTalk(item)}>{item}</button>)}
          </div>
          <button type="button" className="primary-cta" data-testid="resume" disabled={acting} onClick={() => void resume()}>Voltar para o 2º tempo</button>
        </section>
      ) : null}
      {finished ? (
        <section className="full-time" data-testid="full-time">
          <h2>{live.score[0] === live.score[1] ? "Empate" : (live.home.clubId === initial.career.clubId ? live.score[0] > live.score[1] : live.score[1] > live.score[0]) ? "Vitória" : "Derrota"}</h2>
          <p>Tabela {before + 1}º → {after + 1}º ({after - before > 0 ? `-${after - before}` : `+${before - after}`})</p>
          {live.penalties ? <p data-testid="penalties">Pênaltis {live.penalties.home} a {live.penalties.away}</p> : null}
          <p>Homem do jogo: {motm?.name}. Notas de quem terminou em campo: {ratings.slice(0, 6).map((player) => `${player.name} ${Math.max(5, Math.round(player.fit / 12))}`).join(" · ")}</p>
          <button type="button" onClick={onClose}>Voltar ao escritório</button>
        </section>
      ) : null}
      {error ? <p className="live-error">{error}</p> : null}
    </div>
  );
}
