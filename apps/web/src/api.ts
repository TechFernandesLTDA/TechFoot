const json = (r: Response) => r.json();

async function req(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await json(res);
  if (!res.ok) throw new Error(data.error ?? "Erro");
  return data;
}

export const api = {
  me: () => req("/me"),
  login: (email: string, password: string) => req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  world: () => req("/world"),
  saves: () => req("/saves"),
  createSave: (clubId: string) => req("/saves", { method: "POST", body: JSON.stringify({ clubId }) }),
  getSave: (id: string) => req(`/saves/${id}`),
  simulate: (id: string) => req(`/saves/${id}/simulate-round`, { method: "POST" }),
};
