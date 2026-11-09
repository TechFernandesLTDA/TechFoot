import { FormEvent, useEffect, useState } from "react";
import { PROJECT_PIX_KEY } from "@techfoot/shared";
import { api, type SupportInfo, type SupportIntent } from "./api";
import type { Lang } from "./i18n";

const copy = {
  pt: {
    eyebrow: "APOIO VOLUNTÁRIO",
    title: "Apoio voluntário.",
    premiumTitle: "Checkout premium",
    premiumBody: "Indisponível nesta versão. Um checkout só existe com provedor real e confirmação no servidor. Não há preço, compra nem liberação automática.",
    checkout: "Checkout indisponível",
    copy: "Copiar chave Pix",
    copied: "Chave copiada para a área de transferência. Isso não confirma pagamento.",
    copyFail: "Não foi possível copiar. Selecione a chave e copie manualmente.",
    brTitle: "Pix copia e cola",
    intentTitle: "Registrar intenção",
    intentHelp: "Opcional e só para a sua conta. Não cobra, não gera Pix automático e não muda a carreira.",
    amount: "Valor pretendido em reais (opcional)",
    note: "Nota (opcional)",
    submit: "Registrar intenção não confirmada",
    empty: "Nenhuma intenção registrada. Uma intenção não é um pagamento.",
    unverified: "Não confirmado",
    verified: "Verificado pelo provedor — nenhum recurso liberado",
    login: "Entre na conta para registrar uma intenção. A chave já pode ser copiada.",
    offline: "Servidor indisponível. A chave abaixo é o identificador público do repositório, não uma confirmação ao vivo.",
    privacy: "Não pedimos CPF, a sua chave Pix nem dados de cartão. Doação não vende dado e não desbloqueia o jogo.",
    back: "Voltar",
  },
  en: {
    eyebrow: "VOLUNTARY SUPPORT",
    title: "Voluntary support.",
    premiumTitle: "Premium checkout",
    premiumBody: "Unavailable in this version. Checkout requires a real provider and server confirmation. There is no price, purchase, or automatic unlock.",
    checkout: "Checkout unavailable",
    copy: "Copy Pix key",
    copied: "Key copied to the clipboard. This does not confirm a payment.",
    copyFail: "Could not copy. Select the key and copy it manually.",
    brTitle: "Pix copy-and-paste",
    intentTitle: "Record an intention",
    intentHelp: "Optional and private to your account. It does not charge, create a Pix charge, or change the career.",
    amount: "Intended amount in BRL (optional)",
    note: "Note (optional)",
    submit: "Record unconfirmed intention",
    empty: "No intention recorded. An intention is not a payment.",
    unverified: "Unconfirmed",
    verified: "Verified by provider — nothing unlocked",
    login: "Sign in to record an intention. The key can already be copied.",
    offline: "Server unavailable. The key below is the repository's public identifier, not a live confirmation.",
    privacy: "We do not ask for a tax id, your Pix key, or card data. A donation does not sell data or unlock the game.",
    back: "Back",
  },
} as const;

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "true");
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function SupportPanel({ lang, authed, offlineFallback = false, onBack }: { lang: Lang; authed: boolean; offlineFallback?: boolean; onBack?: () => void }) {
  const text = copy[lang];
  const [info, setInfo] = useState<SupportInfo | null>(null);
  const [intents, setIntents] = useState<SupportIntent[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(!offlineFallback);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (offlineFallback) return;
    let active = true;
    setLoading(true);
    api.support()
      .then((next) => { if (active) setInfo(next); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offlineFallback]);

  useEffect(() => {
    if (!authed || offlineFallback) return;
    let active = true;
    api.supportIntents()
      .then((next) => { if (active) setIntents(next.intents); })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [authed, offlineFallback]);

  const pixKey = info?.pixKey ?? PROJECT_PIX_KEY;
  const offline = offlineFallback || (!loading && !info);

  async function onCopy() {
    const ok = await copyText(pixKey);
    setStatus(ok ? text.copied : text.copyFail);
  }

  async function onIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const rawAmount = String(form.get("amount") ?? "").trim().replace(",", ".");
    const note = String(form.get("note") ?? "").trim();
    const amountCents = rawAmount ? Math.round(Number(rawAmount) * 100) : undefined;
    if (rawAmount && (!Number.isFinite(amountCents) || (amountCents ?? 0) < 100)) {
      setError(lang === "pt" ? "O valor mínimo de uma intenção é R$ 1,00." : "The minimum intention is BRL 1.00.");
      setBusy(false);
      return;
    }
    try {
      const created = await api.createSupportIntent(amountCents, note || undefined);
      setIntents((current) => [created.intent, ...current]);
      setStatus(lang === "pt" ? "Intenção registrada como não confirmada." : "Intention recorded as unconfirmed.");
      event.currentTarget.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page support-page" aria-labelledby="support-title">
      <div className="page-intro">
        <div>
          <div className="eyebrow">{text.eyebrow}</div>
          <h2 id="support-title">{text.title}</h2>
          <p>{info?.notice ?? "Apoio voluntário. Copiar a chave, exibir um código ou registrar uma intenção não confirma Pix e não libera nada no jogo."}</p>
        </div>
        {onBack ? <button type="button" className="ghost-button" onClick={onBack}>{text.back}</button> : null}
      </div>
      {error ? <div className="alert" role="alert">{error}</div> : null}
      {offline ? <p className="panel-note" role="status">{text.offline}</p> : null}
      <div className="support-grid">
        <article className="panel">
          <div className="eyebrow">PIX</div>
          <h3>Chave Pix</h3>
          {loading ? <p>Carregando...</p> : <p className="pix-key" aria-label="Chave Pix">{pixKey}</p>}
          <button type="button" className="primary-cta primary-cta--compact" onClick={() => void onCopy()}>{text.copy}</button>
          <p className="panel-note" role="status" aria-live="polite">{status}</p>
          <h3>{text.brTitle}</h3>
          {info?.brCode ? <pre className="br-code">{info.brCode}</pre> : <p>{info?.brCodeUnavailableReason ?? "QR Code e BR Code Pix não são gerados sem nome e cidade reais do recebedor."}</p>}
          <p className="panel-note">{text.privacy}</p>
          <h3>Para receber de verdade</h3>
          <ul className="readiness-list">{(info?.readiness.missing ?? ["Nome e cidade reais do recebedor", "Provedor com confirmação no servidor", "Nenhuma doação libera recurso nesta versão"]).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="panel">
          <div className="eyebrow">PREMIUM</div>
          <h3>{text.premiumTitle}</h3>
          <p>{text.premiumBody}</p>
          <button type="button" className="ghost-button" disabled>{text.checkout}</button>
          {authed ? (
            <form className="support-form" onSubmit={(event) => void onIntent(event)}>
              <div className="eyebrow">{text.intentTitle}</div>
              <p>{text.intentHelp}</p>
              <label className="field field--dark"><span>{text.amount}</span><input name="amount" inputMode="decimal" placeholder="" /></label>
              <label className="field field--dark"><span>{text.note}</span><input name="note" maxLength={140} /></label>
              <button className="ghost-button" type="submit" disabled={busy}>{text.submit}</button>
            </form>
          ) : <p>{text.login}</p>}
          <div className="intent-list">
            {authed && intents.length === 0 ? <p className="panel-note">{text.empty}</p> : intents.map((intent) => (
              <article className="intent-row" key={intent.id}>
                <strong>{intent.amountCents ? `R$ ${(intent.amountCents / 100).toFixed(2)}` : "Sem valor"}</strong>
                <span>{intent.status === "verified" ? text.verified : text.unverified}</span>
                {intent.note ? <small>{intent.note}</small> : null}
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
