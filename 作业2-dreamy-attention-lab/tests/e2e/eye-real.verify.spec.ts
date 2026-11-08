import { expect, test, type Page } from '@playwright/test';

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  },
});

async function seedParticipant(page: Page, participantId: string) {
  await page.addInitScript(({ id }) => {
    localStorage.setItem('dcl.participant_id', id);
    localStorage.setItem('dcl.consent_at', new Date().toISOString());
    sessionStorage.setItem('dcl.session_participant', id);
  }, { id: participantId });
}

async function overrideConfig(page: Page) {
  await page.route('**/api/experiments/visual-search/config', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.version = 901;
    payload.config = {
      ...payload.config,
      practiceTrials: 2,
      fixationDurationMs: 120,
      responseTimeoutMs: 4000,
      postTrialDelayMs: 60,
      mouseTracking: false,
      eyeTrackingEnabled: true,
    };
    payload.config.blocks = payload.config.blocks.map(
      (block: Record<string, unknown>, index: number) => ({
        ...block,
        formalTrials: [4, 4, 15][index] ?? 4,
        enabled: true,
      }),
    );
    await route.fulfill({ response, json: payload });
  });
}

async function answer(page: Page, key: 'f' | 'j') {
  await expect(page.getByText('阵列中是否存在红色 O？', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(150);
  await page.keyboard.press(key);
}

// Regression for the WebGazer public-API mismatch: enabling the camera must
// reach calibration instead of failing with "showGazeDot is not a function".
test('enabling the camera reaches WebGazer calibration', async ({ page }) => {
  test.setTimeout(90_000);
  const failures: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && /showGazeDot|摄像头未启用/.test(text)) {
      failures.push(text);
    }
  });
  page.on('pageerror', (error) => failures.push(error.message));

  await seedParticipant(page, `EYE-REAL-${Date.now().toString(36).toUpperCase()}`);
  await overrideConfig(page);
  await page.goto('/experiment/visual-search');

  await page.getByRole('button', { name: /开始练习/ }).click();
  await answer(page, 'f');
  await page.waitForTimeout(1150);
  await answer(page, 'j');
  await expect(page.getByRole('heading', { name: '本 Block 练习完成' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: /开始正式试次/ }).click();

  await expect(
    page.getByRole('heading', { name: '是否启用摄像头注视估计？' }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /启用摄像头/ }).click();

  await expect(
    page.getByRole('heading', { name: '依次注视每个点并点击' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText('摄像头未启用', { exact: false }),
  ).toHaveCount(0);
  expect(failures).toEqual([]);
});
