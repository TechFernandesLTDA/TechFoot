import { FormEvent, useEffect, useState } from "react";
import { api, type Career, type Club, type Player, type Tactic } from "./api";
import { tr, type Lang } from "./i18n";

type User = { id: string; email: string; name: string };
type Tab = "home" | "squad" | "fixtures" | "cup" | "market" | "finance" | "inbox" | "league" | "report";

const POS_ORDER: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [saves, setSaves] = useState<{ id: string; name: string }[]>([]);
  const [world, setWorld] = useState<{ id: string; name: string; city: string; division: number }[]>([]);
  const [save, setSave] = useState<{ id: string; name: string; career: Career } | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [lang, setLang] = useState<Lang>("pt");

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    api.saves().then(setSaves).catch((e) => setError(e.message));
    api.world().then((w) => setWorld(w.clubs)).catch((e) => setError(e.message));
  }, [user]);

  async function onAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const next =
        mode === "login"
          ? await api.login(String(fd.get("email")), String(fd.get("password")))
          : await api.register(String(fd.get("name")), String(fd.get("email")), String(fd.get("password")));
      setUser(next);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function withSave(fn: () => Promise<{ career: Career }>) {
    try {
      const out = await fn();
      setSave((s) => (s ? { ...s, career: out.career } : s));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!user) {
    return (
      <div className="app">
        <header>
          <h1>{tr(lang, "appName")}</h1>
          <div className="row">
            <span className="muted">Tech Fernandes</span>
            <button onClick={() => setLang(lang === "pt" ? "en" : "pt")}>{lang === "pt" ? "EN" : "PT"}</button>
          </div>
        </header>
        <form className="card grid" onSubmit={onAuth}>
          {mode === "register" ? <input name="name" placeholder={tr(lang, "name")} required aria-label={tr(lang, "name")} /> : null}
          <input name="email" type="email" placeholder={tr(lang, "email")} required aria-label={tr(lang, "email")} />
          <input name="password" type="password" placeholder={tr(lang, "password")} required minLength={6} aria-label={tr(lang, "password")} />
          {error ? <div className="error">{error}</div> : null}
          <div className="row">
            <button type="submit">{mode === "login" ? tr(lang, "enter") : tr(lang, "register")}</button>
            <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? tr(lang, "toRegister") : tr(lang, "toLogin")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!save) {
    return (
      <div className="app">
        <header>
          <h1>{tr(lang, "appName")}</h1>
          <div className="row">
            <span>{user.name}</span>
            <button onClick={() => setLang(lang === "pt" ? "en" : "pt")}>{lang === "pt" ? "EN" : "PT"}</button>
            <button className="danger" onClick={async () => { await api.logout(); setUser(null); }}>{tr(lang, "logout")}</button>
          </div>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="grid">
          <section className="card" aria-label="Carreiras">
            <h2>Carreiras</h2>
            {saves.length === 0 ? <p className="muted">Nenhuma carreira ainda.</p> : null}
            {saves.map((s) => (
              <button key={s.id} onClick={() => api.getSave(s.id).then(setSave)}>
                {s.name}
              </button>
            ))}
          </section>
          <section className="card" aria-label="Nova carreira">
            <h2>Nova carreira</h2>
            <p className="muted">Série A e B — escolha o clube.</p>
            <div className="row">
              {world.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    const created = await api.createSave(c.id);
                    setSave(created);
                    setSaves((prev) => [{ id: created.id, name: created.name }, ...prev]);
                  }}
                >
                  {c.name}
                  <div className="muted">{c.city} · {c.division === 1 ? "Série A" : "Série B"}</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const tabCount = (t: Tab) => (t === "inbox" ? save.career.inbox.filter((m) => !m.read).length : 0);

  return (
    <div className="app">
      <header>
        <h1>{tr(lang, "appName")}</h1>
        <div className="row">
          <span>{user.name}</span>
          <button onClick={() => setLang(lang === "pt" ? "en" : "pt")}>{lang === "pt" ? "EN" : "PT"}</button>
          <button className="danger" onClick={async () => { await api.logout(); setUser(null); setSave(null); }}>{tr(lang, "logout")}</button>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <nav className="row tabs" aria-label="Navegação">
        {(["home", "squad", "fixtures", "cup", "market", "finance", "inbox", "league"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {label(t, lang)}{tabCount(t) > 0 && t === "inbox" ? ` (${tabCount(t)})` : ""}
          </button>
        ))}
      </nav>
      {tab === "home" && <Home save={save} onSetTab={setTab} onSimulate={async () => {
        const out = await api.simulate(save.id);
        setSave({ ...save, career: out.career });
        setTab("report");
        if (out.userMatch) setError("");
      }} />}
      {tab === "squad" && <Squad save={save} withSave={withSave} />}
      {tab === "fixtures" && <Fixtures save={save} />}
      {tab === "cup" && <Cup save={save} />}
      {tab === "market" && <Market save={save} withSave={withSave} />}
      {tab === "finance" && <Finance save={save} />}
      {tab === "inbox" && <Inbox save={save} withSave={withSave} />}
      {tab === "league" && <League save={save} />}
      {tab === "report" && save.career.lastRoundEvents ? <Report save={save} /> : null}
    </div>
  );
}

function label(t: Tab, lang: Lang): string {
  switch (t) {
    case "home": return tr(lang, "office");
    case "squad": return tr(lang, "squad");
    case "fixtures": return tr(lang, "fixtures");
    case "cup": return tr(lang, "cup");
    case "market": return tr(lang, "market");
    case "finance": return tr(lang, "finance");
    case "inbox": return tr(lang, "inbox");
    case "league": return tr(lang, "table");
    case "report": return tr(lang, "match");
  }
}

function myClub(career: Career): Club {
  return career.clubs.find((c) => c.id === career.clubId)!;
}

function clubName(career: Career, id?: string | null): string {
  return career.clubs.find((c) => c.id === id)?.name ?? id ?? "?";
}

function Home({ save, onSetTab, onSimulate }: { save: { id: string; career: Career }; onSetTab: (t: Tab) => void; onSimulate: () => void }) {
  const c = myClub(save.career);
  const unread = save.career.inbox.filter((m) => !m.read).length;
  return (
    <div className="grid">
      <section className="card">
        <div className="row spread">
          <div>
            <h2>{c.name}</h2>
            <span className="muted">{c.city} · {c.division === 1 ? "Série A" : "Série B"} · Temporada {save.career.season}</span>
          </div>
          <div className="row">
            <span>Rodada {save.career.round}</span>
            <span>Tática: {c.tactic}</span>
            <span>Caixa: R$ {(save.career.finances / 1e6).toFixed(1)}M</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={onSimulate}>Simular rodada</button>
          <button onClick={() => onSetTab("squad")}>Elenco</button>
          <button onClick={() => onSetTab("market")}>Mercado</button>
          <button onClick={() => onSetTab("inbox")}>Inbox{unread ? ` (${unread})` : ""}</button>
          <button onClick={() => onSetTab("finance")}>Financeiro</button>
        </div>
      </section>
      <section className="card">
        <h3>Notícias</h3>
        {save.career.news.length === 0 ? <p className="muted">Nenhuma notícia ainda.</p> : null}
        <ul className="news">
          {save.career.news.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </section>
      <section className="card">
        <h3>Próximos jogos</h3>
        <table>
          <tbody>
            {save.career.fixtures.filter((f) => !f.played && (f.homeId === c.id || f.awayId === c.id)).slice(0, 5).map((f, i) => (
              <tr key={i}>
                <td>R{f.round}</td>
                <td>{clubName(save.career, f.homeId)}</td>
                <td>vs</td>
                <td>{clubName(save.career, f.awayId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Squad({ save, withSave }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void }) {
  const c = myClub(save.career);
  const [sel, setSel] = useState<string[]>(save.career.starterIds);

  useEffect(() => setSel(save.career.starterIds), [save.career.starterIds]);

  const starters = changeablePlayers(c).sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position]);

  function toggle(id: string) {
    const status = sel.includes(id) ? "out" : "in";
    const filtered = sel.filter((x) => x !== id);
    if (status === "in") {
      const playersOfPos = c.players.filter((p) => p.position === c.players.find((p) => p.id === id)?.position);
      const count = filtered.filter((x) => playersOfPos.some((p) => p.id === x)).length;
      if (count >= maxFor(posOf(c, id))) return;
      setSel([...filtered, id]);
    } else {
      setSel(filtered);
    }
  }

  const canSave = sel.length === 11;

  return (
    <div className="grid">
      <section className="card">
        <div className="row spread">
          <h3>Escalação (cap. {sel.length}/11)</h3>
          <div className="row">
            <select value={save.career.tactic} onChange={(e) => withSave(() => api.tactic(save.id, e.target.value as Tactic))}>
              <option value="balanced">Equilibrado</option>
              <option value="offensive">Ofensivo</option>
              <option value="defensive">Defensivo</option>
            </select>
            <button disabled={!canSave} onClick={() => withSave(() => api.lineup(save.id, sel))}>
              Salvar escalação
            </button>
          </div>
        </div>
        <table>
          <thead><tr><th>Status</th><th>Jogador</th><th>Pos</th><th>Força</th><th>Condição</th></tr></thead>
          <tbody>
            {starters.map((p) => {
              const isIn = sel.includes(p.id);
              return (
                <tr key={p.id}>
                  <td>{isIn ? "Titular" : "Reserva"}</td>
                  <td>{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.strength}</td>
                  <td>{p.injuredGames > 0 ? `Lesionado (${p.injuredGames}j)` : p.suspendedGames > 0 ? `Suspenso (${p.suspendedGames}j)` : "OK"}</td>
                  <td><button onClick={() => toggle(p.id)} disabled={p.injuredGames > 0 || p.suspendedGames > 0}>{isIn ? "Tirar" : "Meter"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function posOf(c: Club, id: string): keyof typeof POS_ORDER {
  return c.players.find((p) => p.id === id)?.position as keyof typeof POS_ORDER;
}

function maxFor(pos: string): number {
  if (pos === "GK") return 1;
  if (pos === "DF") return 5;
  if (pos === "FW") return 3;
  return 5;
}

function changeablePlayers(c: Club): Player[] {
  return c.players.filter((p) => POS_ORDER[p.position] !== undefined);
}

function Fixtures({ save }: { save: { id: string; career: Career } }) {
  const c = myClub(save.career);
  const all = [...save.career.fixtures].sort((a, b) => a.round - b.round);
  return (
    <section className="card">
      <h3>Calendário</h3>
      <table>
        <thead><tr><th>R</th><th>Mandante</th><th>x</th><th>Visitante</th><th>Resultado</th></tr></thead>
        <tbody>
          {all.map((f, i) => {
            const mine = f.homeId === c.id || f.awayId === c.id;
            return (
              <tr key={i} className={mine ? "mine" : ""}>
                <td>{f.round}</td>
                <td>{clubName(save.career, f.homeId)}</td>
                <td>x</td>
                <td>{clubName(save.career, f.awayId)}</td>
                <td>{f.played && f.result ? `${f.result.homeGoals} x ${f.result.awayGoals}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Cup({ save }: { save: { id: string; career: Career } }) {
  const c = myClub(save.career);
  return (
    <div className="grid">
      <section className="card">
        <h3>Copa Brasil TechFoot</h3>
        {save.career.cupChampion ? <p className="good">Campeão: {clubName(save.career, save.career.cupChampion)}</p> : <p className="muted">Em andamento</p>}
        {save.career.cup.flatMap((round, ri) => round.map((f, fi) => {
          if (!f.played) return null;
          const mine = f.homeId === c.id || f.awayId === c.id;
          return (
            <div key={`${ri}-${fi}`} className={mine ? "mine" : ""}>
              <span className="muted">{f.slot}: </span>
              {f.homeGoals} x {f.awayGoals} — {clubName(save.career, f.homeId)} vs {clubName(save.career, f.awayId)}
              {f.penalties ? ` (pên: ${f.penalties.home}-${f.penalties.away})` : ""} · Avança: {clubName(save.career, f.winnerId)}
            </div>
          );
        }))}
        {save.career.cup.flat().every((f) => !f.played && save.career.cupRound === 0) ? <p className="muted">A copa começa no 4º jogo de liga.</p> : null}
      </section>
    </div>
  );
}

function Market({ save, withSave }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void }) {
  const c = myClub(save.career);
  const myIds = new Set(c.players.map((p) => p.id));
  const buyable = save.career.market.filter((m) => !myIds.has(m.playerId)).slice(0, 40);
  const mine = c.players;
  return (
    <div className="grid">
      <section className="card">
        <h3>Mercado (caixa: R$ {(save.career.finances / 1e6).toFixed(1)}M)</h3>
        <p className="muted">Contrate rumo ao título — gerencie o elenco (máx 22).</p>
        <table>
          <thead><tr><th>Jogador</th><th>Pos</th><th>Força</th><th>Preço</th><th>Clube</th><th></th></tr></thead>
          <tbody>
            {buyable.map((m) => {
              const owner = save.career.clubs.find((x) => x.id === m.clubId);
              const p = owner?.players.find((x) => x.id === m.playerId);
              return (
                <tr key={m.playerId}>
                  <td>{p?.name ?? m.playerId}</td>
                  <td>{p?.position ?? "?"}</td>
                  <td>{p?.strength ?? "?"}</td>
                  <td>R$ {(m.price / 1e6).toFixed(1)}M</td>
                  <td>{clubName(save.career, m.clubId)}</td>
                  <td><button onClick={() => withSave(() => api.buy(save.id, m.playerId))}>Contratar</button></td>
                </tr>
              );
            })}
            {buyable.length === 0 ? <tr><td colSpan={6} className="muted">Mercado vazio.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h3>Meu elenco</h3>
        <table>
          <thead><tr><th>Jogador</th><th>Pos</th><th>Força</th><th>Contrato</th><th>Gols</th><th></th></tr></thead>
          <tbody>
            {mine.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.position}</td>
                <td>{p.strength}</td>
                <td>{p.contractGames}j</td>
                <td>{p.goals}</td>
                <td className="row">
                  <button onClick={() => withSave(() => api.renew(save.id, p.id))}>Renovar</button>
                  <button className="danger" onClick={() => withSave(() => api.sell(save.id, p.id))}>Vender</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Finance({ save }: { save: { id: string; career: Career } }) {
  return (
    <div className="grid">
      <section className="card">
        <h3>Financeiro</h3>
        <p>Caixa atual: <strong>R$ {(save.career.finances / 1e6).toFixed(1)}M</strong></p>
        <table>
          <thead><tr><th>Rodada</th><th>Descrição</th><th>Valor</th></tr></thead>
          <tbody>
            {save.career.ledger.map((l, i) => (
              <tr key={i}>
                <td>{l.round ?? "—"}</td>
                <td>{l.label}</td>
                <td className={l.amount >= 0 ? "good" : "bad"}>
                  {l.amount >= 0 ? "+" : ""}R$ {(l.amount / 1e3).toFixed(1)}k
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Inbox({ save, withSave }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void }) {
  const msgs = save.career.inbox;
  return (
    <div className="card">
      <h3>Inbox</h3>
      {msgs.length === 0 ? <p className="muted">Sem mensagens.</p> : null}
      {msgs.map((m) => (
        <div key={m.id} className={m.read ? "msg read" : "msg unread"}>
          <div className="row spread">
            <strong>{m.title}</strong>
            {!m.read ? <button onClick={() => withSave(() => api.markRead(save.id, m.id).then(() => ({ career: save.career })))}>Marcar lida</button> : null}
          </div>
          <p className="muted">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

function League({ save }: { save: { id: string; career: Career } }) {
  return (
    <div className="grid">
      <section className="card">
        <h3>Classificação · {save.career.division === 1 ? "Série A" : "Série B"}</h3>
        <table>
          <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th></tr></thead>
          <tbody>
            {save.career.table.map((row, i) => (
              <tr key={row.clubId} className={row.clubId === save.career.clubId ? "mine" : ""}>
                <td>{i + 1}</td>
                <td>{clubName(save.career, row.clubId)}</td>
                <td>{row.points}</td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.gf}</td>
                <td>{row.ga}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h3>Artilharia</h3>
        <table>
          <thead><tr><th>Jogador</th><th>Gols</th></tr></thead>
          <tbody>
            {save.career.topScorers.map((t) => {
              const club = save.career.clubs.find((x) => x.players.some((p) => p.id === t.playerId));
              const p = club?.players.find((x) => x.id === t.playerId);
              return (
                <tr key={t.playerId} className={club?.id === save.career.clubId ? "mine" : ""}>
                  <td>{p?.name ?? t.playerId} <span className="muted">({club?.name})</span></td>
                  <td>{t.goals}</td>
                </tr>
              );
            })}
            {save.career.topScorers.length === 0 ? <tr><td colSpan={2} className="muted">Sem gols ainda.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Report({ save }: { save: { id: string; career: Career } }) {
  const m = save.career.lastRoundEvents;
  if (!m) return <section className="card"><p className="muted">Nenhum jogo simulado.</p></section>;
  const mineName = clubName(save.career, save.career.clubId);
  return (
    <div className="grid">
      <section className="card">
        <h3>Jogo da rodada</h3>
        <p className="bigscore">
          {clubName(save.career, m.homeId)} <strong>{m.homeGoals}</strong> x <strong>{m.awayGoals}</strong> {clubName(save.career, m.awayId)}
        </p>
        <p className="muted">Chutes: {m.shots.home} x {m.shots.away} · Cartões: {m.cards.home.yellow}a/{m.cards.home.red}v x {m.cards.away.yellow}a/{m.cards.away.red}v</p>
        {m.injuries.length > 0 ? <p className="bad">Lesionados: {m.injuries.map((pid) => playerShort(save.career, pid)).join(", ")}</p> : null}
      </section>
      <section className="card">
        <h3>Narração</h3>
        <div className="events">
          {m.events.map((ev, i) => (
            <div key={i} className={ev.kind === "goal" ? "goal" : ""}>
              {ev.minute}' — {ev.text} <span className="muted">({clubName(save.career, ev.teamId)}{ev.playerId ? " · " + playerShort(save.career, ev.playerId) : ""})</span>
            </div>
          ))}
        </div>
      </section>
      <p className="muted">Time: {mineName} — siga para a próxima rodada.</p>
    </div>
  );
}

function playerShort(career: Career, playerId: string): string {
  for (const club of career.clubs) {
    const p = club.players.find((x) => x.id === playerId);
    if (p) return p.name;
  }
  return playerId;
}