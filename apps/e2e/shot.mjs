import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:5173";
const OUT = "/var/folders/lt/061t76v168b1dlfmdkjnv50w0000gn/T/opencode/techfoot-shots";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

async function shot(page, tag, viewport) {
  await page.screenshot({ path: `${OUT}/${viewport}-${tag}.png`, fullPage: false });
}
async function shotFull(page, tag, viewport) {
  await page.screenshot({ path: `${OUT}/${viewport}-${tag}-full.png`, fullPage: true });
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const v = vp.name;
  const email = `shot-${v}-${Date.now()}@test.co`;

  // AUTH (login view)
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await shot(page, "auth-login", v);
  // AUTH (register view)
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.waitForTimeout(300);
  await shot(page, "auth-register", v);

  await page.getByLabel("Nome").fill("Auditor Visual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.waitForTimeout(1200);

  // LOBBY empty (no saves)
  await shot(page, "lobby-empty", v);
  // Select a club
  await page.getByLabel("Buscar clube, cidade ou estado").fill("Flamengo").catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, "lobby-search", v);
  await page.getByLabel("Buscar clube, cidade ou estado").fill("");
  await page.waitForTimeout(200);
  // pick a Serie C club to see crest variations
  await page.getByRole("button", { name: "Série C" }).click();
  await page.waitForTimeout(300);
  await shot(page, "lobby-filter-c", v);
  await page.getByRole("button", { name: "Todos" }).click();
  await page.waitForTimeout(200);
  // select club & show confirm bar
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.waitForTimeout(300);
  await shot(page, "lobby-selected", v);
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);

  // HOME
  await shot(page, "home", v);
  await shotFull(page, "home", v);

  const tabs = [
    ["Elenco", "squad"],
    ["Calendário", "fixtures"],
    ["Copa", "cup"],
    ["Mercado", "market"],
    ["Finanças", "finance"],
    ["Mensagens", "inbox"],
    ["Tabela", "league"],
    ["Competições", "competitions"],
    ["Administração", "admin"],
  ];
  const mobileOnly = new Set(["home", "squad", "fixtures", "cup", "market"]);
  for (const [label, tag] of tabs) {
    if (v === "mobile" && !mobileOnly.has(tag)) continue;
    try {
      await page.getByRole("button", { name: label }).first().click();
      await page.waitForTimeout(450);
      await shot(page, tag, v);
      await shotFull(page, tag, v);
    } catch (e) { console.log(`skip ${v}/${tag}: ${e.message.split("\n")[0]}`); }
  }

  // simulate then report
  await page.getByRole("button", { name: "Escritório" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Simular rodada" }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "report", v);
  await shotFull(page, "report", v);

  await ctx.close();
}
await browser.close();
console.log("DONE");
