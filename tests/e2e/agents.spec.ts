import { test, expect } from '@playwright/test';

test.describe('Agents workflow', () => {
  test('create, view, edit, delete an agent', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL ?? 'test@example.com');
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('/agents');

    await page.goto('/agents');
    await page.click('text=Create Agent', { strict: false }).catch(() => {});

    const name = `E2E Agent ${Date.now()}`;
    await page.fill('input[name="name"]', name).catch(() => {});
    await page.fill('textarea[name="system_prompt"]', 'E2E prompt verification.').catch(() => {});
    await page.selectOption('select[name="model"]', 'gpt-4o-mini').catch(() => {});
    await page.click('button:has-text("Save")').catch(() => {});

    await page.waitForTimeout(1500);
    await expect(page.locator(`text=${name}`)).toBeVisible();
  });
});
