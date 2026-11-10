export type AppShellName = "boot" | "offline" | "legal" | "auth" | "publicSupport" | "saveSelect" | "career" | "live";
export type SavePresence = "none" | "selected" | "busy";

export function resolveAppShell(input: {
  legal: boolean;
  boot: "loading" | "ready" | "offline";
  user: boolean;
  publicSupport: boolean;
  save: boolean;
  playing: boolean;
}): AppShellName {
  if (input.legal) return "legal";
  if (input.boot === "loading") return "boot";
  if (input.boot === "offline") return "offline";
  if (!input.user && input.publicSupport) return "publicSupport";
  if (!input.user) return "auth";
  if (!input.save) return "saveSelect";
  if (input.playing) return "live";
  return "career";
}

export function savePresence(hasSave: boolean, busy: boolean): SavePresence {
  if (!hasSave) return "none";
  if (busy) return "busy";
  return "selected";
}
