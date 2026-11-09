import { FormEvent, useState } from "react";
import { api } from "./api";

export function AccountDialog({ open, onClose, onSessionEnded }: { open: boolean; onClose: () => void; onSessionEnded: () => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exported, setExported] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.changePassword(String(form.get("currentPassword")), String(form.get("nextPassword")));
      onSessionEnded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setError("");
    setBusy(true);
    try {
      const data = await api.exportData();
      setExported(JSON.stringify(data, null, 2));
      setNotice("Os dados aparecem abaixo. Copie o JSON se o navegador bloquear o download.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.deleteAccount(String(form.get("password")));
      onSessionEnded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <button type="button" className="account-dialog__backdrop" aria-label="Fechar conta" onClick={onClose} />
      <div className="account-dialog__panel">
        <div className="eyebrow">CONTA</div>
        <h2 id="account-title">Seus dados</h2>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="panel-note" role="status">{notice}</p> : null}
        <form className="account-form" onSubmit={(event) => void onPassword(event)}>
          <h3>Alterar senha</h3>
          <label className="field field--dark"><span>Senha atual</span><input name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" /></label>
          <label className="field field--dark"><span>Nova senha</span><input name="nextPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
          <button className="ghost-button" type="submit" disabled={busy}>Alterar senha</button>
        </form>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => void onExport()}>Exportar meus dados</button>
        {exported ? <pre className="export-json">{exported}</pre> : null}
        <form className="account-form" onSubmit={(event) => void onDelete(event)}>
          <h3>Excluir conta</h3>
          <p>Apaga a conta, os saves e as intenções de apoio. Confirme com a senha.</p>
          <label className="field field--dark"><span>Senha</span><input name="password" type="password" required maxLength={128} autoComplete="current-password" /></label>
          <button className="ghost-button ghost-button--danger" type="submit" disabled={busy}>Excluir conta</button>
        </form>
      </div>
    </div>
  );
}
