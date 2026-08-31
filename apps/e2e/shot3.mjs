import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5173";
const OUT = "/var/folders/lt/061t76v168b1dlfmdkjnv50w0000gn/T/opencode/techfoot-shots";

const browser = await chromium.launch();

async function newCareer(page, v) {
  const email = `verify-${v}-${Date.now()}@test.co`;
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByLabel("Nome").fill("Auditor Visual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.waitForTimeout(1200);
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await newCareer(page, "d");
  await page.screenshot({ path: `${OUT}/fix-lobby.png` });
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);
  for (const [label, tag] of [["Elenco", "squad"], ["Copa", "cup"], ["Tabela", "league"], ["Administração", "admin"]]) {
    await page.getByRole("button", { name: label }).first().click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/fix-${tag}.png` });
  }
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await newCareer(page, "m");
  await page.screenshot({ path: `${OUT}/fix-mobile-lobby.png` });
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/fix-mobile-home.png` });
  await page.getByRole("button", { name: "Copa" }).first().click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/fix-mobile-cup.png` });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await newCareer(page, "t");
  await page.screenshot({ path: `${OUT}/fix-tablet-lobby.png` });
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Copa" }).first().click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/fix-tablet-cup.png` });
  await ctx.close();
}

await browser.close();
console.log("DONE");
