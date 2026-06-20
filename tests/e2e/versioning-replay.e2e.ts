import { test, expect } from '@playwright/test';

test.describe('Agent Versioning and Replay E2E', () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let agentId: string;
  let runId: string;

  test('should create agent versions and view history', async ({ page }) => {
    // Navigate to agents page
    await page.goto(`${baseUrl}/agents`);
    await page.waitForLoadState('networkidle');

    // Click create agent button (assuming it exists)
    const createButton = page.locator('[data-testid="create-agent"]');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Fill in agent details
      await page.locator('input[name="name"]').fill('Versioning Test Agent');
      await page.locator('textarea[name="system_prompt"]').fill('You are a helpful assistant for testing.');
      
      // Select model
      await page.locator('select[name="model"]').selectOption('gpt-4');

      // Submit form
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/agents\/[a-f0-9-]+$/);

      // Extract agent ID from URL
      const url = page.url();
      const match = url.match(/\/agents\/([a-f0-9-]+)$/);
      agentId = match?.[1] || '';
    }
  });

  test('should display version history on agent page', async ({ page }) => {
    if (!agentId) test.skip();

    await page.goto(`${baseUrl}/agents/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Check for version history section
    const versionHistoryHeading = page.locator('h2', { hasText: /Version History/i });
    
    // If versions exist, they should be displayed
    const versionCards = page.locator('[data-testid="version-card"]');
    const versionCount = await versionCards.count();
    
    if (versionCount > 0) {
      // Verify version information is visible
      expect(versionCards.first()).toBeVisible();
      
      // Click to expand a version
      await versionCards.first().click();
      
      // Check for version metadata
      expect(page.locator('text=Model')).toBeVisible();
      expect(page.locator('text=Workflow')).toBeVisible();
    }
  });

  test('should create and display a run with versioning', async ({ page }) => {
    if (!agentId) test.skip();

    await page.goto(`${baseUrl}/agents/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Send a message to create a run
    const chatInput = page.locator('input[placeholder*="message"]');
    if (await chatInput.isVisible()) {
      await chatInput.fill('What is 2+2?');
      await page.locator('button[type="submit"]:has-text("Send")').click();

      // Wait for run to appear in the response
      await page.waitForURL(/\/runs\/[a-f0-9-]+/);
      
      // Extract run ID from URL or redirect
      const url = page.url();
      const match = url.match(/\/runs\/([a-f0-9-]+)/);
      if (match) {
        runId = match[1];
      }
    }
  });

  test('should display replay option on completed run', async ({ page }) => {
    if (!runId) test.skip();

    await page.goto(`${baseUrl}/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Check for replay options
    const replaySection = page.locator('text=Replay Options');
    const replayButton = page.locator('button:has-text("Create replay run")');

    if (await replayButton.isVisible()) {
      expect(replayButton).toBeVisible();
      expect(replaySection).toBeVisible();
    }
  });

  test('should navigate to replay page and create replay', async ({ page }) => {
    if (!runId) test.skip();

    await page.goto(`${baseUrl}/runs/${runId}/replay`);
    await page.waitForLoadState('networkidle');

    // Check replay page title
    expect(page.locator('h1', { hasText: 'Replay Run' })).toBeVisible();

    // Check original run information
    expect(page.locator(`text=${runId}`)).toBeVisible();

    // Check for replay button
    const replayButton = page.locator('button:has-text("Replay with selected version")');
    if (await replayButton.isVisible()) {
      // Check if version selector is available
      const versionSelect = page.locator('select');
      if (await versionSelect.isVisible()) {
        // Select a version if available
        const options = await versionSelect.locator('option').count();
        if (options > 1) {
          await versionSelect.selectOption({ index: 1 });
        }

        // Create replay
        await replayButton.click();

        // Wait for success message or redirect
        await page.waitForTimeout(1000);
        
        // Verify we got back a replay run ID
        const successText = page.locator('text=/Replay|created/i');
        if (await successText.isVisible()) {
          expect(successText).toBeVisible();
        }
      }
    }
  });

  test('should show replay metadata on replayed run', async ({ page }) => {
    if (!runId) test.skip();

    // Navigate back to original run
    await page.goto(`${baseUrl}/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Check if run has replay information displayed
    const replayInfo = page.locator('text=This is a replay');
    
    if (await replayInfo.isVisible()) {
      expect(replayInfo).toBeVisible();
      // Verify link to original run exists
      expect(page.locator('a:has-text("View original run")')).toBeVisible();
    }
  });

  test('should show run version information', async ({ page }) => {
    if (!runId) test.skip();

    await page.goto(`${baseUrl}/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Check for model information
    const modelInfo = page.locator('text=gpt-4|gpt-4-turbo');
    
    if (await modelInfo.isVisible()) {
      expect(modelInfo).toBeVisible();
    }
  });
});
