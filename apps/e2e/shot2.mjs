import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:5173";
const OUT = "/var/folders/lt/061t76v168b1dlfmdkjnv50w0000gn/T/opencode/techfoot-shots";
mkdirSync(OUT, { recursive: true });

async function shot(page, tag, v) { await page.screenshot({ path: `${OUT}/${v}-${tag}.png`, fullPage: false }); }
async function shotFull(page, tag, v) { await page.screenshot({ path: `${OUT}/${v}-${tag}-full.png`, fullPage: true }); }

const browser = await chromium.launch();

async function setup(page, v) {
  const email = `shot2-${v}-${Date.now()}@test.co`;
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByLabel("Nome").fill("Auditor Visual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);
}

// TABLET missing tabs
{
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await setup(page, "tablet");
  const tabs = [["Calendário","fixtures"],["Finanças","finance"],["Mensagens","inbox"],["Tabela","league"],["Competições","competitions"],["Administração","admin"]];
  for (const [label, tag] of tabs) {
    try { await page.getByRole("button", { name: label }).first().click(); await page.waitForTimeout(450); await shot(page, tag, "tablet"); await shotFull(page, tag, "tablet"); } catch (e) { console.log("skip tablet/"+tag+": "+e.message.split("\n")[0]); }
  }
  await page.getByRole("button", { name: "Escritório" }).first().click().catch(()=>{});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Simular rodada" }).click().catch(()=>{});
  await page.waitForTimeout(1200);
  await shot(page, "report", "tablet"); await shotFull(page, "report", "tablet");
  await ctx.close();
}

// MOBILE all tabs (mobile bar has 5: home,squad,fixtures,cup,market) + auth + lobby
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const email = `shot3-m-${Date.now()}@test.co`;
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await shot(page, "auth-login", "mobile");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.waitForTimeout(300);
  await shot(page, "auth-register", "mobile");
  await page.getByLabel("Nome").fill("Auditor Visual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "lobby-empty", "mobile");
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.waitForTimeout(300);
  await shot(page, "lobby-selected", "mobile");
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "home", "mobile"); await shotFull(page, "home", "mobile");
  const tabs = [["Elenco","squad"],["Calendário","fixtures"],["Copa","cup"],["Mercado","market"]];
  for (const [label, tag] of tabs) {
    try { await page.getByRole("button", { name: label }).first().click(); await page.waitForTimeout(450); await shot(page, tag, "mobile"); await shotFull(page, tag, "mobile"); } catch (e) { console.log("skip mobile/"+tag+": "+e.message.split("\n")[0]); }
  }
  await page.getByRole("button", { name: "Escritório" }).first().click().catch(()=>{});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Simular rodada" }).click().catch(()=>{});
  await page.waitForTimeout(1200);
  await shot(page, "report", "mobile"); await shotFull(page, "report", "mobile");
  await ctx.close();
}

await browser.close();
console.log("DONE");
