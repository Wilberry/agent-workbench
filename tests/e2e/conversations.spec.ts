import { test, expect } from '@playwright/test';

test.describe('Conversations', () => {
  test('send a message and receive a response', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL ?? 'test@example.com');
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('/agents');

    await page.goto('/agents');
    const agentLink = page.locator('a[href*="/agents/"]').first();
    await agentLink.click();

    await page.waitForSelector('textarea');
    await page.fill('textarea', 'Hello from E2E conversation test.');
    await page.click('button:has-text("Send")');

    await expect(page.locator('text=Hello from E2E conversation test.')).toBeVisible();
    await expect(page.locator('text=Agent')).toBeVisible();
  });
});
