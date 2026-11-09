export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type SaveSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

/** Identificador público de recebimento Pix do projeto. Não é segredo e não confirma pagamento. */
export const PROJECT_PIX_KEY = "futebadosparcas@outlook.com";
