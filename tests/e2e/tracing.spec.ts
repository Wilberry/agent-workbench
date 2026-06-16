import { test, expect } from '@playwright/test';

test.describe('Tracing', () => {
  test('verify trace timeline UI updates', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL ?? 'test@example.com');
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD ?? 'Test1234!');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('/agents');

    await page.goto('/agents');
    await expect(page.locator('text=Chat with your agent')).toBeVisible();
  });
});
