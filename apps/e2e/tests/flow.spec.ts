import { test, expect } from "@playwright/test";

test("fluxo completo: registrar, criar carreira, simular rodada, ver tabela", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.co`;
  await page.goto("/");

  // registrar
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByPlaceholder("Nome").fill("Teste E2E");
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Senha").fill("secret1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Nova carreira" })).toBeVisible();

  // criar carreira (cai no Escritório)
  await page.getByRole("button", { name: "Atlético Solaris" }).click();
  await expect(page.getByText("Rodada 1")).toBeVisible();

  // simular
  await page.getByRole("button", { name: "Simular rodada" }).click();
  await expect(page.getByText("Jogo da rodada")).toBeVisible();

  // ir pra tabela
  await page.getByRole("button", { name: "Tabela" }).click();
  await expect(page.getByText("Classificação · Série A")).toBeVisible();
});
