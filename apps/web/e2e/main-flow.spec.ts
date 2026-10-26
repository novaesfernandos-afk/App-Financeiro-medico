import { expect, test, type Page } from '@playwright/test';

const shots = process.env.E2E_SCREENSHOTS;
async function shot(page: Page, name: string, project: string) {
  if (shots) await page.screenshot({ path: `${shots}/${project}-${name}.png`, fullPage: true });
}

test('cadastro → assistente → plantão → dashboard → calendário → despesa', async ({ page }, info) => {
  const p = info.project.name;
  const email = `e2e${Date.now()}${p}@medfinance.test`;

  await page.goto('/cadastro');
  await page.getByLabel('Nome completo').fill('Dra. Ana Souza');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('SenhaForte123');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  // Assistente inicial
  await expect(page.getByText('Vamos configurar seu MedFinance')).toBeVisible();
  await page.getByLabel('Especialidade').fill('Anestesiologia');
  await shot(page, '01-onboarding', p);
  await page.getByTestId('onboarding-next').click();
  await page.getByLabel('Saldo hoje').fill('10000');
  await page.getByLabel('Nome do cartão').fill('Visa');
  await page.getByLabel('Dia de fechamento').fill('25');
  await page.getByLabel('Dia de vencimento').fill('5');
  await page.getByTestId('onboarding-next').click();
  await page.getByLabel('Instituição').fill('Hospital São Lucas');
  await page.getByLabel('Alíquota efetiva de imposto (%)').fill('10');
  await page.getByLabel('Valor padrão do plantão (se houver)').fill('1800');
  await page.getByLabel('Tipo de plantão padrão').selectOption('NOTURNO');
  await page.getByTestId('onboarding-next').click();

  // Dashboard vazio, sem dados fictícios
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  await expect(page.getByTestId('kpi-gross')).toContainText('R$ 0,00');

  // Registrar plantão usando a tabela de valores (sem digitar valor)
  await page.getByRole('button', { name: 'Plantão' }).first().click();
  let dlg = page.getByRole('dialog');
  await dlg.getByLabel('Instituição', { exact: true }).selectOption({ label: 'Hospital São Lucas' });
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('NOTURNO');
  await expect(page.getByTestId('shift-preview')).toContainText('1.620,00');
  await shot(page, '02-shift-form', p);
  await page.getByRole('button', { name: 'Salvar plantão' }).click();
  await expect(page.getByTestId('kpi-gross')).toContainText('1.800,00');
  await expect(page.getByTestId('kpi-net')).toContainText('1.620,00');
  await expect(page.getByTestId('kpi-taxes')).toContainText('180,00');
  await shot(page, '03-dashboard', p);

  // Despesa paga
  await page.getByRole('button', { name: 'Despesa' }).first().click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Descrição').fill('Supermercado');
  await dlg.getByLabel('Valor', { exact: true }).fill('250,50');
  await dlg.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
  await dlg.getByLabel('Já está paga').check();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByTestId('kpi-expenses')).toContainText('250,50');
  await expect(page.getByTestId('kpi-balance')).toContainText('9.749,50');

  // Calendário mostra o plantão no dia do trabalho
  await page.goto('/calendario');
  await expect(page.locator('.fc-event').filter({ hasText: 'Plantão noturno' }).first()).toBeVisible();
  await expect(page.getByTestId('day-panel')).toContainText('Plantão noturno');
  await shot(page, '04-calendar', p);

  await page.goto('/plantoes');
  await expect(page.getByTestId('shift-list')).toContainText('Hospital São Lucas');
  await shot(page, '05-shifts', p);
  await page.goto('/impostos');
  await expect(page.getByText('Carga tributária por fonte de renda')).toBeVisible();
  await shot(page, '06-taxes', p);
});
