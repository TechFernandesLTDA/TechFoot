import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { api, type AdminControls, type Career, type Club, type MatchResult, type Player, type Tactic, type User } from "./api";
import { tr, type Lang, type TKey } from "./i18n";

type Tab = "home" | "squad" | "fixtures" | "cup" | "market" | "finance" | "inbox" | "league" | "competitions" | "admin" | "report";
type IconName = "home" | "users" | "calendar" | "trophy" | "market" | "wallet" | "mail" | "table" | "play" | "arrow";

const POS_ORDER: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
const TACTIC_LABEL: Record<Tactic, string> = { offensive: "Ofensivo", balanced: "Equilibrado", defensive: "Defensivo" };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [saves, setSaves] = useState<{ id: string; name: string }[]>([]);
  const [world, setWorld] = useState<{ id: string; name: string; city: string; state: string; division: number }[]>([]);
  const [stateCompetitions, setStateCompetitions] = useState<{ id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[]>([]);
  const [save, setSave] = useState<{ id: string; name: string; career: Career } | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [lang, setLang] = useState<Lang>("pt");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.saves(), api.world()])
      .then(([nextSaves, nextWorld]) => {
        setSaves(nextSaves);
        setWorld(nextWorld.clubs);
        setStateCompetitions(nextWorld.stateCompetitions);
      })
      .catch((err: Error) => setError(err.message));
  }, [user]);

  async function onAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const next = mode === "login"
        ? await api.login(String(fd.get("email")), String(fd.get("password")))
        : await api.register(String(fd.get("name")), String(fd.get("email")), String(fd.get("password")));
      setUser(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSave(id: string) {
    setBusy(true);
    try {
      setSave(await api.getSave(id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createCareer(clubId: string) {
    setBusy(true);
    try {
      const created = await api.createSave(clubId);
      setSave(created);
      setSaves((prev) => [{ id: created.id, name: created.name }, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withSave(fn: () => Promise<{ career: Career }>) {
    setError("");
    setBusy(true);
    try {
      const out = await fn();
      setSave((current) => current ? { ...current, career: out.career } : current);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!save) return;
    setError("");
    setBusy(true);
    try {
      const out = await api.simulate(save.id);
      setSave({ ...save, career: out.career });
      setTab("report");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateCareer(career: Career) {
    setSave((current) => current ? { ...current, career } : current);
  }

  if (!user) {
    return <AuthScreen lang={lang} mode={mode} busy={busy} error={error} setLang={setLang} setMode={setMode} onSubmit={onAuth} />;
  }

  if (!save) {
    return (
      <div className="app app--lobby">
        <Header user={user} lang={lang} setLang={setLang} onLogout={async () => { await api.logout(); setUser(null); }} />
        {error ? <Alert message={error} /> : null}
        <main className="lobby-grid">
          <section className="panel panel--dark lobby-welcome">
            <div className="eyebrow">TEMPORADA 2026 / CENTRAL DE CARREIRAS</div>
            <h2>Seu próximo capítulo começa no banco.</h2>
            <p>Escolha um projeto, monte seu elenco e transforme uma equipe fictícia em uma potência nacional.</p>
            <div className="feature-row">
              <Stat label="Clubes" value="16" />
              <Stat label="Divisões" value="02" />
              <Stat label="Jogadores" value="256" />
            </div>
          </section>
          <section className="panel lobby-saves" aria-label={tr(lang, "careers")}>
            <SectionHeading eyebrow="ARQUIVO" title={tr(lang, "careers")} />
            {saves.length === 0 ? <EmptyState icon="mail" title="Nenhuma carreira salva" text="Escolha um clube ao lado para abrir seu primeiro arquivo." /> : (
              <div className="save-list">
                {saves.map((item) => <button className="save-row" key={item.id} onClick={() => openSave(item.id)} disabled={busy}>
                  <span className="save-mark"><Icon name="arrow" /></span><span><strong>{item.name}</strong><small>Carreira salva na nuvem</small></span><Icon name="arrow" />
                </button>)}
              </div>
            )}
          </section>
          <section className="panel panel--cream club-picker" aria-label={tr(lang, "newCareer")}>
            <SectionHeading eyebrow="NOVO ARQUIVO" title={tr(lang, "newCareer")} />
            <p className="panel-lead">Selecione seu desafio. A camisa é fictícia, a pressão é real.</p>
            <div className="club-grid">
              {world.map((club) => <button className="club-choice" key={club.id} onClick={() => createCareer(club.id)} disabled={busy}>
                <span className={`club-crest crest--${club.division}`}><span>{abbr(club.name)}</span></span>
                <span className="club-choice__copy"><strong>{club.name}</strong><small>{club.city} · {divisionLabel(club.division)}</small></span>
                <Icon name="arrow" />
              </button>)}
            </div>
          </section>
        </main>
      </div>
    );
  }

  const unread = save.career.inbox.filter((message) => !message.read).length;
  return (
    <div className="app">
      <Header user={user} lang={lang} setLang={setLang} club={myClub(save.career)} onLogout={async () => { await api.logout(); setUser(null); setSave(null); }} />
      {error ? <Alert message={error} /> : null}
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar__label">COMANDO</div>
          <nav aria-label="Navegação principal">
            {navItems.map((item) => <button key={item.tab} className={`nav-item ${tab === item.tab ? "is-active" : ""}`} aria-current={tab === item.tab ? "page" : undefined} onClick={() => setTab(item.tab)}>
              <Icon name={item.icon} /><span>{label(item.tab, lang)}</span>{item.tab === "inbox" && unread > 0 ? <b>{unread}</b> : null}
            </button>)}
          </nav>
          <div className="sidebar__season"><span>SEASON STATUS</span><strong>{save.career.season}</strong><small>Rodada {save.career.round} de 14</small><div className="progress"><i style={{ width: `${Math.min(100, (save.career.round / 14) * 100)}%` }} /></div></div>
        </aside>
        <main className="main-content">
          <div className="mobile-tabs" aria-label="Navegação móvel">
            {navItems.slice(0, 5).map((item) => <button key={item.tab} className={tab === item.tab ? "is-active" : ""} aria-current={tab === item.tab ? "page" : undefined} onClick={() => setTab(item.tab)}><Icon name={item.icon} /><span>{label(item.tab, lang)}</span></button>)}
          </div>
          {tab === "home" && <Home save={save} onSetTab={setTab} onSimulate={simulate} busy={busy} />}
          {tab === "squad" && <Squad save={save} withSave={withSave} busy={busy} />}
          {tab === "fixtures" && <Fixtures save={save} />}
          {tab === "cup" && <Cup save={save} />}
          {tab === "market" && <Market save={save} withSave={withSave} busy={busy} />}
          {tab === "finance" && <Finance save={save} />}
          {tab === "inbox" && <Inbox save={save} updateCareer={updateCareer} setError={setError} />}
          {tab === "league" && <League save={save} />}
          {tab === "competitions" && <Competitions save={save} stateCompetitions={stateCompetitions} />}
          {tab === "admin" && <Administration save={save} withSave={withSave} busy={busy} />}
          {tab === "report" && <Report save={save} />}
        </main>
      </div>
    </div>
  );
}

const navItems: { tab: Tab; icon: IconName }[] = [
  { tab: "home", icon: "home" }, { tab: "squad", icon: "users" }, { tab: "fixtures", icon: "calendar" },
  { tab: "cup", icon: "trophy" }, { tab: "market", icon: "market" }, { tab: "finance", icon: "wallet" },
  { tab: "inbox", icon: "mail" }, { tab: "league", icon: "table" }, { tab: "competitions", icon: "calendar" }, { tab: "admin", icon: "wallet" },
];

function AuthScreen({ lang, mode, busy, error, setLang, setMode, onSubmit }: { lang: Lang; mode: "login" | "register"; busy: boolean; error: string; setLang: (lang: Lang) => void; setMode: (mode: "login" | "register") => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="auth-screen"><div className="auth-art"><div className="auth-art__grid" /><div className="auth-art__ball">TF</div><div className="auth-art__copy"><span>TECHFOOT / 01</span><h1>Gerencie.<br /><em>Compita.</em><br />Evolua.</h1><p>Uma liga inteira nas suas mãos.</p></div></div><div className="auth-card"><div className="auth-card__top"><div className="brand-lockup"><span className="brand-mark">TF</span><strong>TECHFOOT</strong></div><button className="lang-switch" onClick={() => setLang(lang === "pt" ? "en" : "pt")}>{lang === "pt" ? "EN" : "PT"}</button></div><div className="eyebrow">{mode === "login" ? "ÁREA RESTRITA" : "NOVO MANAGER"}</div><h2>{mode === "login" ? "Bem-vindo de volta." : "Comece sua carreira."}</h2><p className="auth-subtitle">{mode === "login" ? "Acesse seu centro de comando." : "Seu clube precisa de um novo líder."}</p><form className="auth-form" onSubmit={onSubmit}>{mode === "register" ? <Field name="name" label={tr(lang, "name")} placeholder="Como devemos chamar você?" /> : null}<Field name="email" label={tr(lang, "email")} type="email" placeholder="manager@techfoot.com" /><Field name="password" label={tr(lang, "password")} type="password" placeholder="Mínimo de 6 caracteres" minLength={6} />{error ? <Alert message={error} /> : null}<button className="primary-cta" disabled={busy}>{busy ? "Carregando..." : mode === "login" ? tr(lang, "enter") : tr(lang, "register")}<Icon name="arrow" /></button></form><button className="auth-toggle" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Ainda não tem uma conta? " : "Já possui uma conta? "}<strong>{mode === "login" ? tr(lang, "toRegister") : tr(lang, "toLogin")}</strong></button><div className="auth-footer"><span>CONTA SEGURA</span><span>•</span><span>SINGLEPLAYER</span><span>•</span><span>MIT OPEN SOURCE</span></div></div></div>;
}

function Field({ name, label, type = "text", placeholder, minLength }: { name: string; label: string; type?: string; placeholder: string; minLength?: number }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} required minLength={minLength} /></label>;
}

function Header({ user, club, lang, setLang, onLogout }: { user: User; club?: Club; lang: Lang; setLang: (lang: Lang) => void; onLogout: () => void }) {
  return <header className="topbar"><div className="brand-lockup"><span className="brand-mark">TF</span><strong>TECHFOOT</strong><small>MANAGER CONSOLE</small></div>{club ? <div className="topbar-club"><span className={`club-crest crest--${club.division}`}><span>{abbr(club.name)}</span></span><div><strong>{club.name}</strong><small>{club.city} · {divisionLabel(club.division)}</small></div></div> : null}<div className="topbar-actions"><span className="online-dot">ONLINE</span><span className="user-name">{user.name}</span><button className="icon-button" title="Trocar idioma" aria-label="Trocar idioma" onClick={() => setLang(lang === "pt" ? "en" : "pt")}>{lang === "pt" ? "EN" : "PT"}</button><button className="logout-button" onClick={onLogout}>{tr(lang, "logout")}</button></div></header>;
}

function Home({ save, onSetTab, onSimulate, busy }: { save: { id: string; career: Career }; onSetTab: (tab: Tab) => void; onSimulate: () => void; busy: boolean }) {
  const c = myClub(save.career);
  const next = save.career.fixtures.find((fixture) => !fixture.played && (fixture.homeId === c.id || fixture.awayId === c.id));
  const opponent = next ? (next.homeId === c.id ? clubName(save.career, next.awayId) : clubName(save.career, next.homeId)) : "Calendário encerrado";
  const recent = save.career.fixtures.filter((fixture) => fixture.played && fixture.result && (fixture.homeId === c.id || fixture.awayId === c.id)).slice(-5);
  return <div className="page page--home"><PageIntro eyebrow="CENTRO DE COMANDO" title={`Bom dia, ${c.name}.`} subtitle="Tudo que importa para sua próxima decisão está aqui." action={<button className="primary-cta primary-cta--compact" onClick={onSimulate} disabled={busy}><Icon name="play" />{busy ? "SIMULANDO..." : "SIMULAR RODADA"}</button>} /><div className="metric-grid"><Metric icon="table" label="Posição na liga" value={`${positionOf(save.career)}º`} detail={`${save.career.table.find((row) => row.clubId === c.id)?.points ?? 0} pontos`} tone="gold" /><Metric icon="wallet" label="Caixa disponível" value={`R$ ${(save.career.finances / 1e6).toFixed(1)}M`} detail="balanço atual" /><Metric icon="users" label="Moral do clube" value={`${c.morale}`} detail={mood(c.morale)} tone="green" /><Metric icon="trophy" label="Próximo adversário" value={abbreviated(opponent)} detail={next ? `Rodada ${next.round}` : "fim da temporada"} /></div><div className="home-grid"><section className="panel next-match"><div className="panel-kicker">PRÓXIMO COMPROMISSO <span>RODADA {next?.round ?? "—"}</span></div><div className="matchup"><div className="match-team"><span className="club-crest club-crest--large crest--1"><span>{abbr(c.name)}</span></span><strong>{c.name}</strong><small>MANDANTE</small></div><div className="match-vs"><span>VS</span><small>{next ? "EM 2 DIAS" : "—"}</small></div><div className="match-team match-team--away"><span className="club-crest club-crest--large crest--2"><span>{abbr(opponent)}</span></span><strong>{opponent}</strong><small>VISITANTE</small></div></div><div className="match-actions"><button className="ghost-button" onClick={() => onSetTab("squad")}>Ajustar escalação <Icon name="arrow" /></button><button className="ghost-button" onClick={() => onSetTab("fixtures")}>Ver calendário <Icon name="arrow" /></button></div></section><section className="panel form-panel"><SectionHeading eyebrow="MOMENTO" title="Últimos resultados" /><div className="form-strip">{recent.length === 0 ? <span className="muted">Sua temporada começa agora.</span> : recent.map((fixture, index) => <span className={`form-pill ${resultClass(fixture.result!, c.id)}`} key={index}>{resultLetter(fixture.result!, c.id)}</span>)}</div><p className="panel-note">{recent.length ? "A forma recente influencia a confiança do vestiário." : "Uma boa estreia muda o humor do clube."}</p></section><section className="panel news-panel"><SectionHeading eyebrow="MURAL DO CLUBE" title="Últimas notícias" action={<button className="text-button" onClick={() => onSetTab("inbox")}>Ver inbox <Icon name="arrow" /></button>} />{save.career.news.slice(0, 4).map((news, index) => <div className="news-row" key={`${news}-${index}`}><span className={`news-dot news-dot--${index % 3}`} /><div><strong>{news}</strong><small>Atualização do centro de comando</small></div><span className="news-time">agora</span></div>)}</section><section className="panel table-panel"><SectionHeading eyebrow={c.division === 1 ? "SÉRIE A" : "SÉRIE B"} title="Classificação" action={<button className="text-button" onClick={() => onSetTab("league")}>Tabela completa <Icon name="arrow" /></button>} /><MiniTable save={save} /></section></div></div>;
}

function Squad({ save, withSave, busy }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void; busy: boolean }) {
  const c = myClub(save.career);
  const [sel, setSel] = useState<string[]>(save.career.starterIds);
  useEffect(() => setSel(save.career.starterIds), [save.career.starterIds]);
  const players = [...c.players].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position]);
  function toggle(id: string) {
    if (sel.includes(id)) { setSel(sel.filter((item) => item !== id)); return; }
    if (sel.length >= 11) return;
    const player = c.players.find((item) => item.id === id);
    if (!player || player.injuredGames > 0 || player.suspendedGames > 0) return;
    setSel([...sel, id]);
  }
  return <div className="page"><PageIntro eyebrow="GESTÃO DO ELENCO" title="O time começa aqui." subtitle={`${sel.length}/11 titulares selecionados · tática define o risco.`} action={<button className="primary-cta primary-cta--compact" disabled={busy || sel.length !== 11} onClick={() => withSave(() => api.lineup(save.id, sel))}>Salvar escalação <Icon name="arrow" /></button>} /><div className="squad-layout"><section className="panel pitch-panel"><div className="panel-kicker">CAMPO TÁTICO <span>{TACTIC_LABEL[save.career.tactic].toUpperCase()}</span></div><div className="tactic-select"><span>Instrução</span><select value={save.career.tactic} onChange={(e) => withSave(() => api.tactic(save.id, e.target.value as Tactic))}><option value="balanced">Equilibrado</option><option value="offensive">Ofensivo</option><option value="defensive">Defensivo</option></select></div><div className="pitch"><div className="pitch-line pitch-line--top" /><div className="pitch-circle" /><div className="pitch-box pitch-box--top" /><div className="pitch-box pitch-box--bottom" /><div className="pitch-players pitch-players--attack">{sel.filter((id) => c.players.find((p) => p.id === id)?.position === "FW").map((id) => <PlayerToken key={id} player={c.players.find((p) => p.id === id)!} />)}</div><div className="pitch-players pitch-players--mid">{sel.filter((id) => c.players.find((p) => p.id === id)?.position === "MF").map((id) => <PlayerToken key={id} player={c.players.find((p) => p.id === id)!} />)}</div><div className="pitch-players pitch-players--def">{sel.filter((id) => c.players.find((p) => p.id === id)?.position === "DF").map((id) => <PlayerToken key={id} player={c.players.find((p) => p.id === id)!} />)}</div><div className="pitch-players pitch-players--keeper">{sel.filter((id) => c.players.find((p) => p.id === id)?.position === "GK").map((id) => <PlayerToken key={id} player={c.players.find((p) => p.id === id)!} />)}</div></div><div className="pitch-legend"><span><i className="legend-dot legend-dot--first" />Titular</span><span><i className="legend-dot legend-dot--second" />Posição</span></div></section><section className="panel squad-list-panel"><div className="panel-kicker">PLANTEL PRINCIPAL <span>{c.players.length} ATLETAS</span></div><div className="squad-filter"><span>ESCALAÇÃO ATUAL</span><strong>{sel.length === 11 ? "PRONTA PARA JOGAR" : "INCOMPLETA"}</strong></div><div className="player-list">{players.map((player) => { const selected = sel.includes(player.id); return <button className={`player-row ${selected ? "is-selected" : ""}`} key={player.id} onClick={() => toggle(player.id)} disabled={player.injuredGames > 0 || player.suspendedGames > 0}><span className="player-number">{positionLabel(player.position)}</span><span className="player-avatar">{initials(player.name)}</span><span className="player-main"><strong>{player.name}</strong><small>{selected ? "TITULAR" : "RESERVA"} · {condition(player)}</small></span><span className="player-rating">{player.strength}<small>FOR</small></span><span className={`status-dot ${selected ? "status-dot--active" : ""}`} /></button>; })}</div></section></div></div>;
}

function PlayerToken({ player }: { player: Player }) { return <span className="pitch-token" title={player.name}><b>{positionLabel(player.position)}</b><small>{lastName(player.name)}</small></span>; }

function Fixtures({ save }: { save: { id: string; career: Career } }) { const c = myClub(save.career); return <div className="page"><PageIntro eyebrow="CALENDÁRIO" title="A temporada não espera." subtitle="Planeje cada rodada, casa ou fora." /><section className="panel table-panel"><div className="table-toolbar"><SectionHeading eyebrow="LIGA NACIONAL TECHFOOT" title="Todos os jogos" /><span className="table-count">{save.career.fixtures.filter((f) => f.played).length} jogados</span></div><div className="responsive-table"><table><thead><tr><th>RODADA</th><th>MANDANTE</th><th></th><th>VISITANTE</th><th>PLACAR</th><th>STATUS</th></tr></thead><tbody>{save.career.fixtures.map((fixture, index) => { const mine = fixture.homeId === c.id || fixture.awayId === c.id; return <tr className={mine ? "is-highlighted" : ""} key={index}><td><span className="round-tag">R{fixture.round}</span></td><td>{clubName(save.career, fixture.homeId)}</td><td className="versus-cell">×</td><td>{clubName(save.career, fixture.awayId)}</td><td className="score-cell">{fixture.result ? `${fixture.result.homeGoals} — ${fixture.result.awayGoals}` : "—"}</td><td><span className={`status-badge ${fixture.played ? "status-badge--done" : "status-badge--next"}`}>{fixture.played ? "ENCERRADO" : "AGENDADO"}</span></td></tr>; })}</tbody></table></div></section></div>; }

function Cup({ save }: { save: { id: string; career: Career } }) { return <div className="page"><PageIntro eyebrow="COMPETIÇÃO NACIONAL" title="Uma copa, quatro noites." subtitle="Mata-mata, pressão e pênaltis." /><section className="panel bracket-panel"><div className="bracket-header"><SectionHeading eyebrow="COPA BRASIL TECHFOOT" title={save.career.cupChampion ? `Campeão: ${clubName(save.career, save.career.cupChampion)}` : "Chave em andamento"} /><span className="trophy-mark"><Icon name="trophy" /></span></div><div className="bracket">{save.career.cup.map((round, ri) => <div className="bracket-round" key={ri}><h4>{round[0]?.slot ?? "FASE"}</h4>{round.map((fixture, fi) => <div className={`bracket-match ${fixture.played ? "is-played" : ""}`} key={fi}><span>{clubName(save.career, fixture.homeId)}</span><b>{fixture.played ? fixture.homeGoals : "·"}</b><span>{clubName(save.career, fixture.awayId)}</span><b>{fixture.played ? fixture.awayGoals : "·"}</b>{fixture.penalties ? <small>PÊN {fixture.penalties.home} — {fixture.penalties.away}</small> : null}</div>)}</div>)}</div></section></div>; }

function Market({ save, withSave, busy }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void; busy: boolean }) { const c = myClub(save.career); const myIds = new Set(c.players.map((p) => p.id)); const buyable = save.career.market.filter((m) => !myIds.has(m.playerId)).slice(0, 18); return <div className="page"><PageIntro eyebrow="MERCADO DE TRANSFERÊNCIAS" title="Encontre a peça certa." subtitle="Talento custa dinheiro. O erro custa pontos." /><section className="panel market-summary"><div><span className="eyebrow">CAIXA DISPONÍVEL</span><strong>R$ {(save.career.finances / 1e6).toFixed(1)}M</strong></div><div><span className="eyebrow">ELENCO</span><strong>{c.players.length}<small>/22</small></strong></div><div><span className="eyebrow">LISTADOS</span><strong>{buyable.length}</strong></div></section><section className="market-grid">{buyable.map((entry) => { const owner = save.career.clubs.find((club) => club.id === entry.clubId); const player = owner?.players.find((item) => item.id === entry.playerId); if (!player) return null; return <article className="market-card" key={entry.playerId}><div className="market-card__top"><span className="player-avatar player-avatar--large">{initials(player.name)}</span><span className="market-price">R$ {(entry.price / 1e6).toFixed(1)}M</span></div><span className="eyebrow">{positionLabel(player.position)} · {owner?.name}</span><h3>{player.name}</h3><div className="market-card__stats"><span><b>{player.strength}</b><small>FORÇA</small></span><span><b>{player.contractGames}</b><small>JOGOS</small></span><span><b>{player.goals}</b><small>GOLS</small></span></div><button className="ghost-button ghost-button--full" disabled={busy} onClick={() => withSave(() => api.buy(save.id, player.id))}>Contratar <Icon name="arrow" /></button></article>; })}</section><section className="panel table-panel"><SectionHeading eyebrow="MEU ELENCO" title="Contratos e saídas" /><div className="responsive-table"><table><thead><tr><th>JOGADOR</th><th>POS</th><th>FORÇA</th><th>CONTRATO</th><th>GOLS</th><th></th></tr></thead><tbody>{c.players.map((player) => <tr key={player.id}><td><span className="table-player"><span className="player-avatar">{initials(player.name)}</span><strong>{player.name}</strong></span></td><td>{positionLabel(player.position)}</td><td className="score-cell">{player.strength}</td><td><span className={player.contractGames <= 5 ? "contract-warning" : ""}>{player.contractGames} jogos</span></td><td>{player.goals}</td><td><span className="action-pair"><button className="mini-button" disabled={busy} onClick={() => withSave(() => api.renew(save.id, player.id))}>Renovar</button><button className="mini-button mini-button--danger" disabled={busy} onClick={() => withSave(() => api.sell(save.id, player.id))}>Vender</button></span></td></tr>)}</tbody></table></div></section></div>; }

function Finance({ save }: { save: { id: string; career: Career } }) { const income = save.career.ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0); const expenses = Math.abs(save.career.ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)); return <div className="page"><PageIntro eyebrow="GESTÃO FINANCEIRA" title="O caixa também joga." subtitle="Sustente o projeto para chegar ao fim da temporada." /><div className="finance-cards"><Metric icon="wallet" label="Caixa atual" value={`R$ ${(save.career.finances / 1e6).toFixed(1)}M`} detail="saldo disponível" tone="gold" /><Metric icon="arrow" label="Receitas acumuladas" value={`R$ ${(income / 1e6).toFixed(1)}M`} detail="bilheteria e prêmios" tone="green" /><Metric icon="users" label="Despesas acumuladas" value={`R$ ${(expenses / 1e6).toFixed(1)}M`} detail="folha e contratações" tone="red" /></div><section className="panel table-panel"><SectionHeading eyebrow="EXTRATO DA CARREIRA" title="Movimentações recentes" /><div className="ledger">{save.career.ledger.map((entry, index) => <div className="ledger-row" key={`${entry.label}-${index}`}><span className="ledger-icon"><Icon name={entry.amount >= 0 ? "arrow" : "wallet"} /></span><span><strong>{entry.label}</strong><small>{entry.round ? `Rodada ${entry.round}` : "Início da carreira"}</small></span><b className={entry.amount >= 0 ? "amount-positive" : "amount-negative"}>{entry.amount >= 0 ? "+" : "−"} R$ {(Math.abs(entry.amount) / 1e3).toFixed(1)}k</b></div>)}</div></section></div>; }

function Inbox({ save, updateCareer, setError }: { save: { id: string; career: Career }; updateCareer: (career: Career) => void; setError: (message: string) => void }) { return <div className="page"><PageIntro eyebrow="CENTRO DE MENSAGENS" title="Tudo chega primeiro aqui." subtitle="Decisões, alertas e sinais do vestiário." /><section className="panel inbox-panel"><div className="inbox-toolbar"><div><span className="eyebrow">CAIXA DE ENTRADA</span><strong>{save.career.inbox.filter((message) => !message.read).length} não lidas</strong></div><span className="inbox-filter">TODAS <Icon name="arrow" /></span></div>{save.career.inbox.length === 0 ? <EmptyState icon="mail" title="Nenhuma mensagem" text="As notícias do clube aparecerão aqui." /> : save.career.inbox.map((message) => <article className={`message-row ${message.read ? "is-read" : "is-unread"}`} key={message.id}><span className={`message-icon message-icon--${message.kind}`}><Icon name={message.kind === "market" ? "market" : message.kind === "season" || message.kind === "cup" ? "trophy" : "mail"} /></span><div><div className="message-title"><strong>{message.title}</strong>{!message.read ? <span className="unread-label">NOVA</span> : null}</div><p>{message.body}</p></div>{!message.read ? <button className="mini-button" onClick={async () => { try { const result = await api.markRead(save.id, message.id); updateCareer({ ...save.career, inbox: result.inbox }); } catch (err) { setError((err as Error).message); } }}>Marcar lida</button> : null}</article>)}</section></div>; }

function League({ save }: { save: { id: string; career: Career } }) { const c = myClub(save.career); return <div className="page"><PageIntro eyebrow={divisionLabel(c.division).toUpperCase()} title="A tabela conta a história." subtitle="Pontos, saldo e consistência ao longo da temporada." /><div className="league-layout"><section className="panel table-panel"><SectionHeading eyebrow="CLASSIFICAÇÃO" title={`${divisionLabel(c.division)} · ${save.career.season}`} /><MiniTable save={save} expanded /></section><section className="panel scorers-panel"><SectionHeading eyebrow="ARTILHARIA" title="Quem decide" />{save.career.topScorers.length === 0 ? <EmptyState icon="trophy" title="Sem gols registrados" text="A artilharia ganha forma após a primeira rodada." /> : save.career.topScorers.slice(0, 8).map((scorer, index) => { const club = save.career.clubs.find((item) => item.players.some((player) => player.id === scorer.playerId)); const player = club?.players.find((item) => item.id === scorer.playerId); return <div className="scorer-row" key={scorer.playerId}><span>{String(index + 1).padStart(2, "0")}</span><span className="player-avatar">{initials(player?.name ?? "?")}</span><div><strong>{player?.name ?? scorer.playerId}</strong><small>{club?.name}</small></div><b>{scorer.goals}<small>GOLS</small></b></div>; })}</section></div></div>; }

function Competitions({ save, stateCompetitions }: { save: { id: string; career: Career }; stateCompetitions: { id: string; name: string; state: string; season: number; format: string; stages: string[]; qualification: string }[] }) {
  const position = positionOf(save.career);
  const scenarios = [
    { label: "Vitória", text: position <= 4 ? "Mantém o clube na zona de classificação." : "Pode subir até duas posições." },
    { label: "Empate", text: position <= 8 ? "Pontua, mas depende dos concorrentes diretos." : "Precisa melhorar o saldo na próxima rodada." },
    { label: "Derrota", text: position >= save.career.table.length - 2 ? "Risco imediato de zona de queda." : "A pressão aumenta no próximo jogo." },
  ];
  return <div className="page"><PageIntro eyebrow="CALENDÁRIO BRASILEIRO" title="Uma temporada, vários caminhos." subtitle="Brasileirão, Copa do Brasil e estaduais convivem no mesmo calendário." /><section className="competition-grid"><article className="panel competition-hero"><div className="eyebrow">SORTEIO DA TEMPORADA</div><h3>Próximo sorteio auditável</h3><p>Seed <strong>{save.career.seed}</strong> · combinação gerada para a temporada {save.career.season}.</p><div className="draw-chip"><Icon name="calendar" /><span>Rodada {save.career.round}</span><b>{save.career.division === 1 ? "BRASILEIRÃO A" : save.career.division === 2 ? "BRASILEIRÃO B" : "BRASILEIRÃO C"}</b></div></article><article className="panel scenario-panel"><SectionHeading eyebrow="COMBINAÇÕES" title="O que está em jogo" />{scenarios.map((scenario) => <div className="scenario-row" key={scenario.label}><span className={`scenario-mark scenario-mark--${scenario.label.toLowerCase() === "vitória" ? "win" : scenario.label.toLowerCase() === "empate" ? "draw" : "loss"}`}>{scenario.label.slice(0, 1)}</span><div><strong>Se houver {scenario.label.toLowerCase()}</strong><small>{scenario.text}</small></div></div>)}</article></section><section className="panel competition-catalog"><SectionHeading eyebrow="COMPETIÇÕES ATIVAS" title="Mapa do futebol" /><div className="catalog-grid"><CompetitionCard title="Campeonato Brasileiro Série A" format="20 clubes · 38 rodadas" detail="4 rebaixados" tone="gold" /><CompetitionCard title="Campeonato Brasileiro Série B" format="20 clubes · acesso + playoff" detail="4 rebaixados" tone="blue" /><CompetitionCard title="Campeonato Brasileiro Série C" format="20 clubes · fase + grupos" detail="4 acessos" tone="green" /><CompetitionCard title="Copa do Brasil" format="126 clubes · sorteio por fases" detail="final única" tone="red" /></div></section><section className="panel state-panel"><SectionHeading eyebrow="27 FEDERAÇÕES" title="Campeonatos estaduais" /><div className="state-grid">{stateCompetitions.map((competition) => <div className="state-card" key={competition.id}><span>{competition.state}</span><strong>{competition.name.replace("Campeonato ", "")}</strong><small>{competition.qualification === "copa-do-brasil" ? "classifica para Copa do Brasil" : "formato configurável"}</small></div>)}</div></section></div>;
}

function CompetitionCard({ title, format, detail, tone }: { title: string; format: string; detail: string; tone: string }) { return <article className={`catalog-card catalog-card--${tone}`}><span className="catalog-card__line" /><Icon name="calendar" /><h3>{title}</h3><p>{format}</p><small>{detail}</small></article>; }

function Administration({ save, withSave, busy }: { save: { id: string; career: Career }; withSave: (fn: () => Promise<{ career: Career }>) => void; busy: boolean }) {
  const [draft, setDraft] = useState<AdminControls>(save.career.admin);
  const [loanAmount, setLoanAmount] = useState(500000);
  useEffect(() => setDraft(save.career.admin), [save.career.admin]);
  const update = (key: keyof AdminControls, value: number) => setDraft((current) => ({ ...current, [key]: value }));
  const controls: { key: keyof AdminControls; label: string; min: number; max: number; step: number; suffix: string }[] = [
    { key: "ticketPrice", label: "Preço do ingresso", min: 10, max: 300, step: 5, suffix: "R$" },
    { key: "membershipFee", label: "Mensalidade do sócio", min: 10, max: 1000, step: 10, suffix: "R$" },
    { key: "sponsorTier", label: "Nível de patrocínio", min: 1, max: 5, step: 1, suffix: "/5" },
    { key: "broadcastTier", label: "Pacote de transmissão", min: 1, max: 3, step: 1, suffix: "/3" },
    { key: "merchandisePrice", label: "Preço de produtos", min: 30, max: 500, step: 10, suffix: "R$" },
    { key: "stadiumLevel", label: "Nível do estádio", min: 1, max: 5, step: 1, suffix: "/5" },
    { key: "maintenanceBudget", label: "Manutenção", min: 0, max: 1000000, step: 25000, suffix: "R$" },
    { key: "youthBudget", label: "Categorias de base", min: 0, max: 2000000, step: 50000, suffix: "R$" },
    { key: "scoutingBudget", label: "Scouting", min: 0, max: 2000000, step: 50000, suffix: "R$" },
  ];
  return <div className="page"><PageIntro eyebrow="ADMINISTRAÇÃO DO CLUBE" title="Você decide o orçamento." subtitle="Cada controle altera a renda, o risco e a capacidade de competir." action={<button className="primary-cta primary-cta--compact" disabled={busy} onClick={() => withSave(() => api.admin(save.id, draft))}>Aplicar plano <Icon name="arrow" /></button>} /><div className="admin-overview"><Metric icon="wallet" label="Caixa" value={`R$ ${(save.career.finances / 1e6).toFixed(1)}M`} detail="disponível" tone="gold" /><Metric icon="users" label="Sócios" value={String(save.career.admin.membershipCount)} detail={`R$ ${save.career.admin.membershipFee}/mês`} tone="green" /><Metric icon="market" label="Dívida" value={`R$ ${(save.career.admin.debt / 1e6).toFixed(1)}M`} detail="juros de 1% / rodada" tone="red" /></div><div className="admin-layout"><section className="panel controls-panel"><SectionHeading eyebrow="10 CONTROLES" title="Alavancas do clube" /><div className="control-grid">{controls.map((control) => <label className="range-control" key={control.key}><span><strong>{control.label}</strong><output>{formatControlValue(control.key, draft[control.key])} {control.suffix}</output></span><input type="range" min={control.min} max={control.max} step={control.step} value={draft[control.key] as number} onChange={(event) => update(control.key, Number(event.target.value))} /></label>)}</div></section><section className="panel loan-panel"><SectionHeading eyebrow="CRÉDITO" title="Fôlego de caixa" /><p>Empréstimos ajudam numa crise, mas comprometem as próximas rodadas.</p><label className="field field--dark"><span>Valor</span><input type="number" min={100000} max={10000000} step={100000} value={loanAmount} onChange={(event) => setLoanAmount(Number(event.target.value))} /></label><button className="ghost-button ghost-button--full" disabled={busy} onClick={() => withSave(() => api.loan(save.id, loanAmount))}>Solicitar empréstimo <Icon name="arrow" /></button><div className="loan-warning"><span>ATENÇÃO</span><small>O juros de 1% é debitado por rodada.</small></div></section></div></div>;
}

function formatControlValue(key: keyof AdminControls, value: number): string { if (key === "sponsorTier" || key === "broadcastTier" || key === "stadiumLevel") return String(value); return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value); }

function Report({ save }: { save: { id: string; career: Career } }) { const match = save.career.lastRoundEvents; if (!match) return <div className="page"><EmptyState icon="play" title="Nenhum jogo simulado" text="Simule uma rodada no escritório para ver o relatório." /></div>; return <div className="page"><PageIntro eyebrow="RELATÓRIO DE PARTIDA" title="O jogo terminou. A análise começa." subtitle="Cada lance fica registrado para sua próxima decisão." /><section className="panel report-score"><div className="report-side"><span className="club-crest club-crest--large crest--1"><span>{abbr(clubName(save.career, match.homeId))}</span></span><strong>{clubName(save.career, match.homeId)}</strong></div><div className="report-result"><span>{match.homeGoals}</span><b>—</b><span>{match.awayGoals}</span><small>FINAL</small></div><div className="report-side"><span className="club-crest club-crest--large crest--2"><span>{abbr(clubName(save.career, match.awayId))}</span></span><strong>{clubName(save.career, match.awayId)}</strong></div><div className="report-meta"><span>CHUTES <b>{match.shots.home} × {match.shots.away}</b></span><span>CARTÕES <b>{match.cards.home.yellow + match.cards.home.red} × {match.cards.away.yellow + match.cards.away.red}</b></span><span>LESÕES <b>{match.injuries.length}</b></span></div></section><section className="panel timeline-panel"><SectionHeading eyebrow="NARRAÇÃO AO VIVO" title="Linha do tempo" /><div className="timeline">{match.events.map((event, index) => <div className={`timeline-event timeline-event--${event.kind}`} key={`${event.minute}-${index}`}><span className="timeline-minute">{event.minute}'</span><span className="timeline-marker"><Icon name={event.kind === "goal" ? "trophy" : event.kind === "whistle" ? "play" : "arrow"} /></span><div><strong>{event.text}</strong><small>{clubName(save.career, event.teamId)}{event.playerId ? ` · ${playerShort(save.career, event.playerId)}` : ""}</small></div></div>)}</div></section></div>; }

function MiniTable({ save, expanded = false }: { save: { id: string; career: Career }; expanded?: boolean }) { const rows = expanded ? save.career.table : save.career.table.slice(0, 5); return <div className="mini-table"><div className="mini-table__head"><span>#</span><span>CLUBE</span><span>P</span><span>J</span><span>SG</span></div>{rows.map((row, index) => <div className={`mini-table__row ${row.clubId === save.career.clubId ? "is-current" : ""}`} key={row.clubId}><b>{String(index + 1).padStart(2, "0")}</b><span><i className={`club-dot club-dot--${index % 4}`} />{clubName(save.career, row.clubId)}</span><strong>{row.points}</strong><span>{row.played}</span><span>{row.gf - row.ga > 0 ? "+" : ""}{row.gf - row.ga}</span></div>)}</div>; }

function PageIntro({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) { return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) { return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div>{action}</div>; }
function Metric({ icon, label, value, detail, tone = "neutral" }: { icon: IconName; label: string; value: string; detail: string; tone?: string }) { return <article className={`metric-card metric-card--${tone}`}><span className="metric-icon"><Icon name={icon} /></span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Stat({ label, value }: { label: string; value: string }) { return <span className="stat"><strong>{value}</strong><small>{label}</small></span>; }
function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) { return <div className="empty-state"><span><Icon name={icon} /></span><strong>{title}</strong><p>{text}</p></div>; }
function Alert({ message }: { message: string }) { return <div className="alert" role="alert"><Icon name="arrow" />{message}</div>; }
function Icon({ name }: { name: IconName }) { const paths: Record<IconName, ReactNode> = { home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>, users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2-5 6-5s6 2 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 15c2.5.3 4 2 4 5" /></>, calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 9h18" /></>, trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" /><path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4" /></>, market: <><path d="M4 7h16l-1 13H5L4 7Z" /><path d="M8 10V5a4 4 0 0 1 8 0v5" /></>, wallet: <><path d="M3 6a2 2 0 0 1 2-2h14v16H5a2 2 0 0 1-2-2V6Z" /><path d="M3 7h16M15 13h2" /></>, mail: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="m4 7 8 6 8-6" /></>, table: <><path d="M4 5h16v15H4zM4 10h16M10 5v15" /></>, play: <><path d="m8 5 11 7-11 7V5Z" /></>, arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></> }; return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>; }

function label(t: Tab, lang: Lang): string { if (t === "competitions") return "Competições"; if (t === "admin") return "Administração"; const labels: Record<Exclude<Tab, "competitions" | "admin">, TKey> = { home: "office", squad: "squad", fixtures: "fixtures", cup: "cup", market: "market", finance: "finance", inbox: "inbox", league: "table", report: "match" }; return tr(lang, labels[t as Exclude<Tab, "competitions" | "admin">]); }
function myClub(career: Career): Club { return career.clubs.find((club) => club.id === career.clubId)!; }
function clubName(career: Career, id?: string | null): string { return career.clubs.find((club) => club.id === id)?.name ?? id ?? "?"; }
function divisionLabel(division: number): string { return division === 1 ? "Série A" : division === 2 ? "Série B" : "Série C"; }
function playerShort(career: Career, id: string): string { for (const club of career.clubs) { const player = club.players.find((item) => item.id === id); if (player) return player.name; } return id; }
function abbr(value: string): string { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase().slice(0, 3); }
function abbreviated(value: string): string { return value.length > 19 ? `${value.slice(0, 17)}…` : value; }
function initials(value: string): string { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function lastName(value: string): string { return value.split(/\s+/).at(-1) ?? value; }
function positionLabel(position: string): string { return position === "GK" ? "GOL" : position; }
function condition(player: Player): string { return player.injuredGames > 0 ? `Lesionado · ${player.injuredGames}j` : player.suspendedGames > 0 ? `Suspenso · ${player.suspendedGames}j` : "Disponível"; }
function mood(value: number): string { return value >= 80 ? "vestiário confiante" : value >= 60 ? "ambiente estável" : "atenção ao ambiente"; }
function positionOf(career: Career): number { const index = career.table.findIndex((row) => row.clubId === career.clubId); return index >= 0 ? index + 1 : career.table.length; }
function resultClass(result: MatchResult, clubId: string): string { const won = result.homeId === clubId ? result.homeGoals > result.awayGoals : result.awayGoals > result.homeGoals; const draw = result.homeGoals === result.awayGoals; return won ? "form-pill--win" : draw ? "form-pill--draw" : "form-pill--loss"; }
function resultLetter(result: MatchResult, clubId: string): string { const kind = resultClass(result, clubId); return kind.includes("win") ? "V" : kind.includes("draw") ? "E" : "D"; }
