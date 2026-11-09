export type Lang = "pt" | "en";

const dict = {
  pt: {
    appName: "TECHFOOT",
    enter: "Entrar",
    register: "Criar conta",
    toRegister: "Cadastrar",
    toLogin: "Já tenho conta",
    name: "Nome",
    email: "E-mail",
    password: "Senha",
    logout: "Sair",
    careers: "Carreiras",
    newCareer: "Nova carreira",
    office: "Escritório",
    squad: "Elenco",
    fixtures: "Jogos",
    cup: "Copa",
    market: "Mercado",
    finance: "Financeiro",
    inbox: "Mensagens",
    table: "Tabela",
    match: "Jogo",
    simulate: "Simular rodada",
    support: "Apoio",
  },
  en: {
    appName: "TECHFOOT",
    enter: "Sign in",
    register: "Create account",
    toRegister: "Sign up",
    toLogin: "I have an account",
    name: "Name",
    email: "E-mail",
    password: "Password",
    logout: "Logout",
    careers: "Careers",
    newCareer: "New career",
    office: "Office",
    squad: "Squad",
    fixtures: "Fixtures",
    cup: "Cup",
    market: "Market",
    finance: "Finance",
    inbox: "Messages",
    table: "Standings",
    match: "Match",
    simulate: "Simulate round",
    support: "Support",
  },
} as const;

export type TKey = keyof typeof dict.pt;

export function tr(lang: Lang, key: TKey): string {
  return dict[lang][key] ?? dict.pt[key];
}
