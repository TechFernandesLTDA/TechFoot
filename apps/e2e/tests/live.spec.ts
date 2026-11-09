import { test, expect } from "@playwright/test";

async function startCareer(page: import("@playwright/test").Page, label: string) {
  const email = `live-${label}-${Date.now()}@test.co`;
  await page.goto("/");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByLabel("Nome").fill("Jogo Ao Vivo");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("secret12");
  await page.getByRole("checkbox", { name: /Termos de Uso/ }).check();
  await page.getByRole("checkbox", { name: /18 anos/ }).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Athletico Paranaense" }).click();
  await page.getByRole("button", { name: "Assumir este clube" }).click();
  await page.getByTestId("play-live").click();
  await expect(page.getByTestId("live-board")).toBeVisible();
}

test("jogo ao vivo no desktop: intervalo, substituição e fim", async ({ page }) => {
  await startCareer(page, "desk");
  await page.screenshot({ path: "/opt/cursor/artifacts/live-desktop.png", fullPage: true });
  await page.getByTestId("jump").click();
  await expect(page.getByTestId("half-time")).toBeVisible({ timeout: 20000 });
  if (await page.getByTestId("goal-flash").count()) {
    await page.screenshot({ path: "/opt/cursor/artifacts/goal-flash-desktop.png", fullPage: true });
  }
  await page.screenshot({ path: "/opt/cursor/artifacts/halftime-desktop.png", fullPage: true });
  await page.locator(".live-shell aside button").first().click();
  await page.getByTestId("sub-confirm").first().click();
  await expect(page.getByTestId("sub-sheet")).toHaveCount(0);
  await page.getByTestId("resume").click();
  await expect(page.getByTestId("half-time")).toHaveCount(0);
  await page.getByTestId("jump").click();
  await expect(page.getByTestId("full-time")).toBeVisible({ timeout: 20000 });
  if (await page.getByTestId("goal-flash").count()) {
    await page.screenshot({ path: "/opt/cursor/artifacts/goal-flash-desktop.png", fullPage: true });
  }
  await page.screenshot({ path: "/opt/cursor/artifacts/fulltime-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Voltar ao escritório" }).click();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await expect(page.getByText("Libertadores", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/table-desktop.png", fullPage: true });
});

test("jogo ao vivo no celular: intervalo e fim", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startCareer(page, "phone");
  await page.screenshot({ path: "/opt/cursor/artifacts/live-mobile.png", fullPage: true });
  await page.getByTestId("jump").click();
  await expect(page.getByTestId("half-time")).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: "/opt/cursor/artifacts/halftime-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Time" }).click();
  await page.locator(".live-shell aside button").first().click();
  await page.getByTestId("sub-confirm").first().click();
  await expect(page.getByTestId("sub-sheet")).toHaveCount(0);
  await page.getByTestId("resume").click();
  await page.getByTestId("jump").click();
  await expect(page.getByTestId("full-time")).toBeVisible({ timeout: 20000 });
  if (await page.getByTestId("goal-flash").count()) {
    await page.screenshot({ path: "/opt/cursor/artifacts/goal-flash-mobile.png", fullPage: true });
  }
  await page.screenshot({ path: "/opt/cursor/artifacts/fulltime-mobile.png", fullPage: true });
});
