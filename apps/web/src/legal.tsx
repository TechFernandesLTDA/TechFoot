export type LegalPage = "privacy" | "terms";

export function legalPath(pathname: string): LegalPage | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/privacidade") return "privacy";
  if (path === "/termos") return "terms";
  return null;
}

export function LegalScreen({ page }: { page: LegalPage }) {
  return (
    <div className="app legal-screen">
      <main className="panel legal-panel" id="conteudo">
        <a className="text-button" href="/">Voltar ao TechFoot</a>
        {page === "privacy" ? <Privacy /> : <Terms />}
        <footer className="site-footer">
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/termos">Termos de Uso</a>
        </footer>
      </main>
    </div>
  );
}

function OperatorTodo() {
  return (
    <p className="legal-todo">
      <strong>TODO para Renan:</strong> confirmar se futebadosparcas@outlook.com continua sendo o contato de privacidade e completar o CNPJ e o endereço da R L Fernandes LTDA / TECHFERNANDES. Esses dados não estão neste texto de propósito.
    </p>
  );
}

function Privacy() {
  return (
    <>
      <div className="eyebrow">LGPD</div>
      <h1>Política de Privacidade</h1>
      <OperatorTodo />
      <p>Controlador: R L Fernandes LTDA / TECHFERNANDES.</p>
      <p>Contato (placeholder a confirmar): futebadosparcas@outlook.com.</p>
      <h2>O que é guardado</h2>
      <p>A conta guarda nome, e-mail e uma senha com scrypt. O save é o JSON da carreira neste servidor. Uma intenção de apoio guarda valor e nota, se você informar, e fica sem confirmação de pagamento. Não pedimos CPF, cartão nem a chave Pix de quem apoia.</p>
      <h2>Para que serve</h2>
      <p>Os dados existem para autenticar a conta, manter a carreira e registrar uma intenção de apoio voluntário. Não vendemos dados e não há analytics de terceiros nesta versão.</p>
      <h2>Quanto tempo</h2>
      <p>A conta e os saves ficam até você excluir a conta. A exclusão apaga o usuário, os saves e as intenções de apoio. A sessão é um cookie httpOnly de 7 dias e deixa de valer no logout ou na troca de senha.</p>
      <h2>Seus pedidos</h2>
      <p>Na conta autenticada dá para exportar um JSON com os dados e excluir a conta confirmando a senha. Para outro pedido, use o contato acima depois que o controlador confirmar esse canal.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <div className="eyebrow">CONTA</div>
      <h1>Termos de Uso</h1>
      <OperatorTodo />
      <p>O TechFoot é um jogo singleplayer de gerenciamento, operado por R L Fernandes LTDA / TECHFERNANDES. Contato (placeholder a confirmar): futebadosparcas@outlook.com.</p>
      <h2>Idade</h2>
      <p>A conta exige declaração de 18 anos ou mais. O jogo pode exibir uma chave Pix para apoio voluntário, então não é oferecido como serviço para menores.</p>
      <h2>O que o jogo não promete</h2>
      <p>Não há prêmio em dinheiro, aposta, pagamento confirmado pelo navegador nem recurso pago. Copiar a chave Pix não confirma transferência e não libera nada na carreira. Não há ganho garantido.</p>
      <h2>Conta e saves</h2>
      <p>A senha nova tem de 8 a 128 caracteres. Você pode exportar seus dados e excluir a conta. O controlador pode interromper o serviço. Os nomes de clubes reais ainda precisam de revisão comercial antes de uma divulgação ampla.</p>
    </>
  );
}
