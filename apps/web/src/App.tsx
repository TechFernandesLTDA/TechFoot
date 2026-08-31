import { FormEvent, useEffect, useState } from "react";
import { api } from "./api";

type User = { id: string; email: string; name: string };
type ClubLite = { id: string; name: string; city: string };
type Event = { minute: number; kind: string; text: string };
type Career = {
  clubId: string;
  round: number;
  clubs: { id: string; name: string; players: { id: string; name: string; position: string; strength: number }[] }[];
  table: { clubId: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number }[];
  inbox: { id: string; title: string; body: string }[];
};
type Save = { id: string; name: string; career: Career };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [saves, setSaves] = useState<{ id: string; name: string }[]>([]);
  const [world, setWorld] = useState<ClubLite[]>([]);
  const [save, setSave] = useState<Save | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [mode, setMode] = useState<"login" | "register">("login");

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

  if (!user) {
    return (
      <div className="app">
        <header>
          <h1>TECHFOOT</h1>
          <span className="muted">Tech Fernandes</span>
        </header>
        <form className="card grid" onSubmit={onAuth}>
          {mode === "register" ? <input name="name" placeholder="Nome" required /> : null}
          <input name="email" type="email" placeholder="E-mail" required />
          <input name="password" type="password" placeholder="Senha" required minLength={6} />
          {error ? <div className="error">{error}</div> : null}
          <div className="row">
            <button type="submit">{mode === "login" ? "Entrar" : "Criar conta"}</button>
            <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Cadastrar" : "Já tenho conta"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const myClub = save?.career.clubs.find((c) => c.id === save.career.clubId);

  return (
    <div className="app">
      <header>
        <h1>TECHFOOT</h1>
        <div className="row">
          <span>{user.name}</span>
          <button
            className="danger"
            onClick={async () => {
              await api.logout();
              setUser(null);
              setSave(null);
            }}
          >
            Sair
          </button>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}

      {!save ? (
        <div className="grid">
          <section className="card">
            <h2>Carreiras</h2>
            {saves.length === 0 ? <p className="muted">Nenhuma carreira ainda.</p> : null}
            {saves.map((s) => (
              <button key={s.id} onClick={() => api.getSave(s.id).then(setSave)}>
                {s.name}
              </button>
            ))}
          </section>
          <section className="card">
            <h2>Nova carreira</h2>
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
                  <div className="muted">{c.city}</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid">
          <section className="card">
            <div className="row">
              <strong>{myClub?.name}</strong>
              <span>Rodada {save.career.round}</span>
              <button onClick={() => setSave(null)}>Escritório</button>
              <button
                onClick={async () => {
                  const out = await api.simulate(save.id);
                  setSave({ ...save, career: out.career });
                  setEvents(out.userMatch?.events ?? []);
                }}
              >
                Simular rodada
              </button>
            </div>
          </section>
          <section className="card">
            <h2>Elenco</h2>
            <table>
              <thead>
                <tr>
                  <th>Jogador</th>
                  <th>Pos</th>
                  <th>Força</th>
                </tr>
              </thead>
              <tbody>
                {myClub?.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.position}</td>
                    <td>{p.strength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>Tabela</h2>
            <table>
              <thead>
                <tr>
                  <th>Clube</th>
                  <th>P</th>
                  <th>J</th>
                  <th>GP</th>
                  <th>GC</th>
                </tr>
              </thead>
              <tbody>
                {save.career.table.map((row) => (
                  <tr key={row.clubId}>
                    <td>{save.career.clubs.find((c) => c.id === row.clubId)?.name ?? row.clubId}</td>
                    <td>{row.points}</td>
                    <td>{row.played}</td>
                    <td>{row.gf}</td>
                    <td>{row.ga}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>Narração</h2>
            <div className="events">
              {events.length === 0 ? <p className="muted">Simule uma rodada para ouvir o rádio.</p> : null}
              {events.map((ev, i) => (
                <div key={i}>
                  {ev.minute}' — {ev.text}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
