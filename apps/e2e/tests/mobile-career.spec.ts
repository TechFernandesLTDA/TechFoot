import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("no celular a carreira salva continua acessível", async ({ page }) => {
  const email = `mobile-${Date.now()}@test.co`;
  await page.goto("/");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByLabel("Nome").fill("Mobile");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret12");
  await page.getByRole("checkbox", { name: /Termos de Uso/ }).check();
  await page.getByRole("checkbox", { name: /18 anos/ }).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Nenhuma carreira salva")).toBeVisible();

  await page.getByLabel("Buscar clube, cidade ou estado").fill("Flamengo");
  await page.getByRole("button", { name: "Flamengo" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await expect(page.getByRole("button", { name: "Simular rodada" })).toBeVisible();
  await expect(page.getByText("Primeira temporada deste save.")).toBeVisible();

  await page.getByRole("button", { name: "Jogos" }).click();
  await expect(page.getByRole("heading", { name: "Seus jogos" })).toBeVisible();

  await page.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("dialog", { name: "Mais seções" })).toBeVisible();
  await page.getByRole("button", { name: "Apoio" }).click();
  await expect(page.getByLabel("Chave Pix")).toHaveText("futebadosparcas@outlook.com");
  await expect(page.getByRole("button", { name: "Checkout indisponível" })).toBeDisabled();
  await expect(page.getByText("nenhuma doação libera recurso")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret12");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: /Flamengo/ }).filter({ hasText: "Salva na sua conta neste servidor" })).toBeVisible();
});
