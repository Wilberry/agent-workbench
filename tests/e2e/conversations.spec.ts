import { test, expect } from '@playwright/test';

test.describe('Conversations', () => {
  test('send a message and receive a response', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL ?? 'test@example.com');
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('/agents');

    await page.goto('/agents');
    await page.getByRole('link', { name: /create new agent/i }).click();

    const agentName = `E2E Conversation Agent ${Date.now()}`;
    await page.getByPlaceholder('My support agent').fill(agentName);
    await page.getByPlaceholder('You are a helpful assistant...').fill('E2E prompt verification.');
    await page.getByPlaceholder('gpt-4o-mini').fill('gpt-4o-mini');
    await page.getByRole('button', { name: /create agent/i }).click();
    await page.waitForURL(/\/agents/);

    await page.getByRole('link', { name: agentName }).first().click();

    await page.waitForSelector('textarea');
    await page.fill('textarea', 'Hello from E2E conversation test.');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText('Hello from E2E conversation test.')).toBeVisible();
    await expect(page.getByText('Agent', { exact: true })).toBeVisible();
  });
});
