import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const RESEARCHER_USERNAME = process.env.RESEARCHER_USERNAME ?? 'researcher';
const RESEARCHER_PASSWORD = process.env.RESEARCHER_PASSWORD ?? 'dreamlab';

interface ConfigPayload {
  version: number;
  config: Record<string, unknown> & {
    blocks: Array<Record<string, unknown> & { block_id: string; formalTrials: number }>;
  };
}

async function seedParticipant(page: Page, participantId: string, eyeMock = false) {
  await page.addInitScript(
    ({ id, mock }) => {
      localStorage.setItem('dcl.participant_id', id);
      localStorage.setItem('dcl.consent_at', new Date().toISOString());
      sessionStorage.setItem('dcl.session_participant', id);
      if (mock) {
        (window as unknown as { __DCL_EYE_MOCK__?: boolean }).__DCL_EYE_MOCK__ = true;
      }
    },
    { id: participantId, mock: eyeMock },
  );
}

/**
 * Override the served config without touching the database. `blockTrials`
 * sets each block's formal trial count; a value of 0 disables that block.
 */
async function overrideConfig(
  page: Page,
  experimentId: string,
  overrides: Record<string, unknown>,
  blockTrials?: number[],
) {
  await page.route(`**/api/experiments/${experimentId}/config`, async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as ConfigPayload;
    payload.version = 900;
    payload.config = { ...payload.config, ...overrides };
    if (blockTrials) {
      payload.config.blocks = payload.config.blocks.map((block, index) => {
        const count = blockTrials[index];
        if (count === undefined) return block;
        return { ...block, formalTrials: count, enabled: count > 0 };
      });
    }
    await route.fulfill({ response, json: payload });
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dreamy-cognitive-lab');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains('outbox')) {
      db.close();
      return 0;
    }
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const request = tx.objectStore('outbox').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
}

async function clickThroughFormalBlocks(
  page: Page,
  labels: Array<string | RegExp>,
  trialsPerBlock: number,
  answer: (trialIndex: number) => Promise<void>,
) {
  for (let blockIndex = 0; blockIndex < labels.length; blockIndex += 1) {
    await expect(page.getByRole('heading', { name: labels[blockIndex], exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`共 ${trialsPerBlock} 个正式试次`)).toBeVisible();
    await page.getByRole('button', { name: /开始本 Block/ }).click();

    for (let trial = 0; trial < trialsPerBlock; trial += 1) {
      await answer(trial);
    }

    await expect(page.getByRole('heading', { name: '本 Block 已完成' })).toBeVisible({
      timeout: 20_000,
    });
    if (blockIndex < labels.length - 1) {
      await page.getByRole('button', { name: /继续下一 Block/ }).click();
    } else {
      await page.getByRole('button', { name: /完成实验并查看结果/ }).click();
    }
  }
}

const VISUAL_BLOCK_TITLES = [
  'Block 1 · 特征搜索（颜色）',
  'Block 2 · 联合搜索（颜色 × 形状）',
  'Block 3 · 空间位置搜索',
];

const VISUAL_PROMPT = '阵列中是否存在红色 O？';

async function answerVisualSearch(page: Page, key: 'f' | 'j', settleMs = 100) {
  const prompt = page.getByText(VISUAL_PROMPT, { exact: true });
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  const stage = page.locator('.stimulus-stage');
  const box = await stage.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45, {
      steps: 4,
    });
  }
  await page.waitForTimeout(settleMs);
  await page.keyboard.press(key);
}

async function runVisualPractice(page: Page) {
  await page.getByRole('button', { name: /开始练习/ }).click();
  await answerVisualSearch(page, 'f');
  await page.waitForTimeout(1150);
  await answerVisualSearch(page, 'j');
  await expect(page.getByRole('heading', { name: '本 Block 练习完成' })).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Run one visual-search block. Camera consent is only requested after the
 * first block's practice; `chooseCamera` handles that one-off decision.
 */
async function runVisualBlock(
  page: Page,
  blockIndex: number,
  formalTrials: number,
  chooseCamera?: () => Promise<void>,
  trialSettleMs = 100,
) {
  await expect(
    page.getByRole('heading', { name: VISUAL_BLOCK_TITLES[blockIndex], exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(`先练习 2 次（有反馈），再进入 ${formalTrials} 个无反馈正式试次。`),
  ).toBeVisible();
  await runVisualPractice(page);
  await page.getByRole('button', { name: /开始正式试次/ }).click();

  if (blockIndex === 0 && chooseCamera) {
    await chooseCamera();
  }

  await expect(
    page.getByRole('heading', { name: '正式试次即将开始', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(`本 Block 共 ${formalTrials} 个正式试次`, { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: /开始正式试次/ }).click();

  for (let trial = 0; trial < formalTrials; trial += 1) {
    await answerVisualSearch(page, trial % 2 === 0 ? 'f' : 'j', trialSettleMs);
    if (trial < formalTrials - 1) await page.waitForTimeout(140);
  }

  await expect(page.getByRole('heading', { name: '本 Block 已完成' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(`${formalTrials} / ${formalTrials} 个正式试次`),
  ).toBeVisible();
  if (blockIndex < 2) {
    await page.getByRole('button', { name: /继续下一 Block/ }).click();
  } else {
    await page.getByRole('button', { name: /完成实验并查看结果/ }).click();
  }
}

test('map alignment runs two counterbalanced cue blocks and completes', async ({ page }) => {
  const participantId = `E2E-MAP-${Date.now().toString(36).toUpperCase()}`;
  await seedParticipant(page, participantId);
  const formalPerBlock = 3;
  await overrideConfig(
    page,
    'map-alignment',
    {
      practiceTrials: 4,
      randomizeBlockOrder: false,
      fixationDurationMs: 120,
      responseTimeoutMs: 0,
      postTrialDelayMs: 60,
    },
    [formalPerBlock, formalPerBlock],
  );
  const errors = collectPageErrors(page);

  await page.goto('/experiment/map-alignment');
  await expect(page.getByRole('heading', { name: '指定建筑在你的哪个方向' })).toBeVisible();
  await page.getByRole('button', { name: /开始 Block 1/ }).click();

  const question = page.getByText(/「.+」位于你的哪个方向？/, { exact: true });

  for (let block = 0; block < 2; block += 1) {
    await expect(
      page.getByRole('heading', {
        name: new RegExp(`^Block ${block + 1} · (无人物线索|人物线索)$`),
      }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(`先完成 2 次有反馈练习，再进入 ${formalPerBlock} 个正式试次。`),
    ).toBeVisible();
    await page.getByRole('button', { name: /开始本 Block 练习/ }).click();

    for (let index = 0; index < 2; index += 1) {
      await expect(question).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(100);
      if (block === 0 && index === 0) {
        await page.screenshot({ path: 'test-results/map-question.png' });
      }
      await page.keyboard.press(['ArrowUp', 'ArrowRight'][index % 2]);
      await page.waitForTimeout(1700);
    }

    await expect(page.getByRole('heading', { name: '练习完成' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /开始本 Block 正式试次/ }).click();

    for (let trial = 0; trial < formalPerBlock; trial += 1) {
      await expect(question).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(100);
      await page.keyboard.press(
        ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'][trial % 4],
      );
      await page.waitForTimeout(160);
    }

    await expect(page.getByRole('heading', { name: '本 Block 已完成' })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole('button', {
        name: block === 0 ? /继续下一 Block/ : /完成实验并查看结果/,
      })
      .click();
  }

  await expect(page).toHaveURL(/\/results\/map-alignment/, { timeout: 25_000 });
  await expect(page.getByRole('heading', { name: '地图对齐 · 结果' })).toBeVisible();
  for (const name of [
    '自动结论',
    '对齐 vs 错位 · 正确率与反应时',
    '无人物线索 vs 人物线索',
    '线索条件 × 对齐状态的交互',
    '朝向角度 × 线索条件',
    '地图错位代价与人物线索',
    '典型错误方向',
    'Block 呈现顺序（描述性）',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: '我的数据' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});

test('home experiment cards pass through the shared participant login', async ({ page }) => {
  const participantId = `E2E-LOGIN-${Date.now().toString(36).toUpperCase()}`;

  await page.goto('/');
  await page.getByRole('link', { name: /进入地图对齐实验/ }).click();
  await expect(page).toHaveURL(/\/enter\/map-alignment$/);
  await expect(page.getByRole('heading', { name: '被试登录' })).toBeVisible();

  await page.getByLabel('Participant ID').fill(participantId);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: /登录并继续/ }).click();
  await expect(page).toHaveURL(/\/instructions\/map-alignment$/);
  await expect(page.getByRole('heading', { name: '实验说明' })).toBeVisible();

  // The second experiment reuses the same tab-level login instead of asking
  // for the participant ID again or starting immediately from the home card.
  await page.goto('/');
  await page.getByRole('link', { name: /进入视觉搜索实验/ }).click();
  await expect(page).toHaveURL(/\/instructions\/visual-search$/);
  await expect(page.getByRole('heading', { name: '实验说明' })).toBeVisible();
});

test('perceptual ordering runs original and extension blocks and completes', async ({ page }) => {
  const participantId = `E2E-ORDER-${Date.now().toString(36).toUpperCase()}`;
  await seedParticipant(page, participantId);
  await overrideConfig(
    page,
    'perceptual-ordering',
    {
      practiceTrials: 2,
      randomizeBlockOrder: false,
      responseTimeoutMs: 15_000,
      postTrialDelayMs: 60,
    },
    [4, 4],
  );
  const errors = collectPageErrors(page);

  const fillAndSubmit = async () => {
    await expect(page.getByText('按面积从小到大排列', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const rectangles = page.locator('.ordering-pool .rect-item');
    const count = await rectangles.count();
    for (let index = 0; index < count; index += 1) {
      await rectangles.first().click();
      await page.waitForTimeout(20);
      await page.locator('.ordering-slot').nth(index).click();
      await page.waitForTimeout(20);
    }
    const submit = page.getByRole('button', { name: /提交排序/ });
    await expect(submit).toBeEnabled();
    await submit.click();
  };

  await page.goto('/experiment/perceptual-ordering');
  await expect(page.getByRole('heading', { name: '按面积从小到大排序' })).toBeVisible();
  await page.getByRole('button', { name: /开始练习/ }).click();
  for (let index = 0; index < 2; index += 1) {
    await fillAndSubmit();
    await page.waitForTimeout(1900);
  }
  await expect(page.getByRole('heading', { name: '练习完成' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: /开始正式实验/ }).click();

  await clickThroughFormalBlocks(
    page,
    ['原始面积排序', '混合长宽比排序'],
    4,
    async () => {
      await fillAndSubmit();
      await page.waitForTimeout(200);
    },
  );

  await expect(page).toHaveURL(/\/results\/perceptual-ordering/, { timeout: 25_000 });
  await expect(page.getByRole('heading', { name: '图形知觉排序 · 结果' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的数据' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});

test('visual search runs three blocks, declines camera, and shows all nine result modules', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const participantId = `E2E-VS-${stamp.toUpperCase()}`;
  await seedParticipant(page, participantId);
  await overrideConfig(
    page,
    'visual-search',
    {
      practiceTrials: 2,
      randomizeBlockOrder: false,
      fixationDurationMs: 120,
      responseTimeoutMs: 4000,
      postTrialDelayMs: 60,
      mouseTracking: true,
      eyeTrackingEnabled: true,
    },
    [4, 4, 15],
  );
  const errors = collectPageErrors(page);

  await page.goto('/experiment/visual-search');

  await runVisualBlock(page, 0, 4, async () => {
    await expect(
      page.getByRole('heading', { name: '是否启用摄像头注视估计？' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /不启用，仅记录鼠标/ }).click();
    await expect(
      page.getByText('你已选择不使用摄像头。鼠标轨迹仍会记录，但不会被解释为注视。'),
    ).toBeVisible();
  });
  await runVisualBlock(page, 1, 4);
  await runVisualBlock(page, 2, 15);

  await expect(page).toHaveURL(/\/results\/visual-search/, { timeout: 25_000 });
  await expect(page.getByRole('heading', { name: '视觉搜索 · 结果' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的数据' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  for (const moduleName of [
    '三句话结论',
    '正确反应时 × Set size',
    '搜索斜率与缺失 / 存在斜率比',
    '每位参与者的联合搜索斜率',
    '眼动热图与鼠标密度',
    '九区域目标分布',
    '九个目标位置的反应时',
    '空间位置与搜索轨迹',
    '九区域搜索方向',
  ]) {
    await expect(page.getByRole('heading', { name: moduleName })).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(
    page.getByText('默认 15 个正式试次时每个区域只有 1 个计划目标', { exact: false }),
  ).toBeVisible();

  await page.getByRole('tab', { name: '全体参与者' }).click();
  await expect(page.getByText('参与者 N')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Block 群体统计')).toBeVisible();
  await expect(page.getByRole('heading', { name: '九区域目标分布' })).toBeVisible();

  await page.getByRole('tab', { name: '参考文献' }).click();
  await expect(page.getByText('文献来源与可比较性')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^暂无可比较的文献数据：/)).toBeVisible();
  await expect(page.getByText('Treisman').first()).toBeVisible();

  const login = await request.post('/api/researcher/login', {
    data: { username: RESEARCHER_USERNAME, password: RESEARCHER_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const sessions = await request.get(
    `/api/researcher/sessions?participant_id=${participantId}&experiment_id=visual-search`,
  );
  expect(sessions.status()).toBe(200);
  const body = (await sessions.json()) as {
    sessions: Array<{ session_id: string; status: string }>;
  };
  expect(body.sessions).toHaveLength(1);
  const sessionId = body.sessions[0].session_id;

  const detailResponse = await request.get(`/api/researcher/sessions/${sessionId}`);
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as {
    trials: Array<{
      trial_id: string;
      block_id: string;
      block_type: string;
      phase: string;
      eye_tracking_status: string;
      stimulus_json: {
        target_present?: boolean;
        target_region?: number | null;
        target_x?: number | null;
        target_y?: number | null;
        items?: Array<Record<string, unknown>>;
      };
    }>;
  };
  const formal = detail.trials.filter((trial) => trial.phase === 'formal');
  const practice = detail.trials.filter((trial) => trial.phase === 'practice');
  expect(practice).toHaveLength(6);
  expect(formal).toHaveLength(23);
  expect(formal.map((trial) => trial.block_id)).toEqual([
    ...Array(4).fill('vs_feature'),
    ...Array(4).fill('vs_conjunction'),
    ...Array(15).fill('vs_spatial'),
  ]);
  expect(formal.map((trial) => trial.block_type)).toEqual([
    ...Array(8).fill('original_block'),
    ...Array(15).fill('extension_block'),
  ]);
  expect(formal.every((trial) => trial.eye_tracking_status === 'declined')).toBe(true);
  expect(new Set(formal.map((trial) => trial.trial_id)).size).toBe(23);

  const spatial = formal.filter((trial) => trial.block_id === 'vs_spatial');
  const present = spatial.filter((trial) => trial.stimulus_json.target_present);
  const absent = spatial.filter((trial) => !trial.stimulus_json.target_present);
  expect(present).toHaveLength(9);
  expect(absent).toHaveLength(6);
  expect(
    present
      .map((trial) => trial.stimulus_json.target_region)
      .sort((a, b) => Number(a) - Number(b)),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const trial of present) {
    expect(typeof trial.stimulus_json.target_x).toBe('number');
    expect(typeof trial.stimulus_json.target_y).toBe('number');
    expect(trial.stimulus_json.items?.every((item) => typeof item.x_screen_px === 'number')).toBe(true);
    expect(trial.stimulus_json.items?.every((item) => typeof item.region === 'number')).toBe(true);
  }
  for (const trial of absent) {
    expect(trial.stimulus_json.target_region).toBeNull();
    expect(trial.stimulus_json.target_x).toBeNull();
    expect(trial.stimulus_json.target_y).toBeNull();
    expect(trial.stimulus_json.items?.some((item) => item.is_target === true)).toBe(false);
  }
  expect(spatial.every((trial) => trial.block_id !== 'vs_conjunction')).toBe(true);

  const sampleResponse = await request.get(
    `/api/researcher/sessions/${sessionId}/trials/${formal[0].trial_id}/samples`,
  );
  expect(sampleResponse.status()).toBe(200);
  const samples = (await sampleResponse.json()) as {
    trial_id: string;
    gaze_samples: unknown[];
    mouse_samples: Array<Record<string, unknown>>;
    note: string;
  };
  expect(samples.trial_id).toBe(formal[0].trial_id);
  expect(samples.gaze_samples).toHaveLength(0);
  expect(samples.mouse_samples.length).toBeGreaterThan(0);
  expect(samples.note).toContain('not merged');
  expect(errors).toEqual([]);
});

test('visual search restores completed formal trials after an interrupted refresh', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const participantId = `E2E-RESUME-${stamp.toUpperCase()}`;
  await seedParticipant(page, participantId);
  await overrideConfig(
    page,
    'visual-search',
    {
      practiceTrials: 2,
      randomizeBlockOrder: false,
      fixationDurationMs: 120,
      responseTimeoutMs: 4000,
      postTrialDelayMs: 60,
      mouseTracking: true,
      eyeTrackingEnabled: false,
    },
    [4, 4, 15],
  );

  await page.goto('/experiment/visual-search');
  await runVisualBlock(page, 0, 4);
  await runVisualBlock(page, 1, 4);

  await expect(
    page.getByRole('heading', { name: 'Block 3 · 空间位置搜索', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await runVisualPractice(page);
  await page.getByRole('button', { name: /开始正式试次/ }).click();
  await expect(
    page.getByRole('heading', { name: '正式试次即将开始', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /开始正式试次/ }).click();
  for (let trial = 0; trial < 3; trial += 1) {
    await answerVisualSearch(page, trial % 2 === 0 ? 'f' : 'j');
  }

  await page.waitForTimeout(250);
  await page.reload();

  await expect(
    page.getByRole('heading', { name: '已找到未完成的正式进度' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('本机保存了 11 个已完成的正式试次。')).toBeVisible();
  await page.getByRole('button', { name: /恢复并继续/ }).click();
  await expect(page.getByText('FORMAL · 4 / 15 · 空间位置搜索')).toBeVisible({
    timeout: 15_000,
  });

  for (let trial = 0; trial < 12; trial += 1) {
    await answerVisualSearch(page, trial % 2 === 0 ? 'f' : 'j');
  }
  await expect(page.getByRole('heading', { name: '本 Block 已完成' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('15 / 15 个正式试次')).toBeVisible();
  await page.getByRole('button', { name: /完成实验并查看结果/ }).click();
  await expect(page).toHaveURL(/\/results\/visual-search/, { timeout: 25_000 });
  await expect(page.getByRole('heading', { name: '视觉搜索 · 结果' })).toBeVisible();

  const login = await request.post('/api/researcher/login', {
    data: { username: RESEARCHER_USERNAME, password: RESEARCHER_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const sessions = await request.get(
    `/api/researcher/sessions?participant_id=${participantId}&experiment_id=visual-search`,
  );
  const body = (await sessions.json()) as {
    sessions: Array<{ session_id: string; status: string }>;
  };
  expect(body.sessions).toHaveLength(1);
  const detail = await request.get(
    `/api/researcher/sessions/${body.sessions[0].session_id}`,
  );
  const detailBody = (await detail.json()) as {
    trials: Array<{ trial_id: string; phase: string }>;
  };
  const formal = detailBody.trials.filter((trial) => trial.phase === 'formal');
  expect(formal).toHaveLength(23);
  expect(new Set(formal.map((trial) => trial.trial_id)).size).toBe(23);
});

test('visual search completes WebGazer mock calibration and records gaze samples', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const participantId = `E2E-EYE-${stamp.toUpperCase()}`;
  await seedParticipant(page, participantId, true);
  await overrideConfig(
    page,
    'visual-search',
    {
      practiceTrials: 2,
      randomizeBlockOrder: false,
      fixationDurationMs: 120,
      responseTimeoutMs: 4000,
      postTrialDelayMs: 60,
      mouseTracking: true,
      eyeTrackingEnabled: true,
    },
    [4, 4, 15],
  );
  const errors = collectPageErrors(page);

  await page.goto('/experiment/visual-search');

  await runVisualBlock(page, 0, 4, async () => {
    await expect(
      page.getByRole('heading', { name: '是否启用摄像头注视估计？' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /启用摄像头/ }).click();
    await expect(page.getByRole('heading', { name: '依次注视每个点并点击' })).toBeVisible({
      timeout: 15_000,
    });
    for (let point = 1; point <= 9; point += 1) {
      const dot = page.getByRole('button', { name: `校准点 ${point}` });
      for (let click = 0; click < 3; click += 1) {
        await dot.click();
      }
    }
    await page.getByRole('button', { name: /开始校准质量检查/ }).click();
    await expect(page.getByRole('heading', { name: '校准质量可用' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /进入正式实验/ }).click();
  }, 750);
  await runVisualBlock(page, 1, 4, undefined, 750);
  await runVisualBlock(page, 2, 15, undefined, 750);

  await expect(page).toHaveURL(/\/results\/visual-search/, { timeout: 25_000 });
  await expect(page.getByRole('heading', { name: '视觉搜索 · 结果' })).toBeVisible();

  const login = await request.post('/api/researcher/login', {
    data: { username: RESEARCHER_USERNAME, password: RESEARCHER_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const sessions = await request.get(
    `/api/researcher/sessions?participant_id=${participantId}&experiment_id=visual-search`,
  );
  const body = (await sessions.json()) as {
    sessions: Array<{ session_id: string }>;
  };
  expect(body.sessions).toHaveLength(1);
  const detailResponse = await request.get(
    `/api/researcher/sessions/${body.sessions[0].session_id}`,
  );
  const detail = (await detailResponse.json()) as {
    trials: Array<{
      trial_id: string;
      phase: string;
      block_id: string;
      eye_tracking_status: string;
      calibration_status: string;
      valid_gaze_ratio: number | null;
      stimulus_json: { target_present?: boolean; target_region?: number | null };
    }>;
  };
  const formal = detail.trials.filter((trial) => trial.phase === 'formal');
  expect(formal).toHaveLength(23);
  expect(formal.every((trial) => trial.eye_tracking_status === 'calibrated')).toBe(true);
  expect(formal.every((trial) => trial.calibration_status === 'passed')).toBe(true);
  expect(formal.every((trial) => (trial.valid_gaze_ratio ?? 0) > 0.5)).toBe(true);

  const spatial = formal.filter((trial) => trial.block_id === 'vs_spatial');
  expect(
    spatial
      .filter((trial) => trial.stimulus_json.target_present)
      .map((trial) => trial.stimulus_json.target_region)
      .sort((a, b) => Number(a) - Number(b)),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const samples = await request.get(
    `/api/researcher/sessions/${body.sessions[0].session_id}/trials/${formal[0].trial_id}/samples`,
  );
  expect(samples.status()).toBe(200);
  const sampleBody = (await samples.json()) as {
    gaze_samples: unknown[];
    mouse_samples: unknown[];
  };
  expect(sampleBody.gaze_samples.length).toBeGreaterThan(0);
  expect(sampleBody.mouse_samples.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('researcher can authenticate, inspect a session, and export CSV/JSON', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const participantId = `E2E-RESEARCH-${stamp.toUpperCase()}`;
  const sessionId = `e2e-research-${stamp}`;
  const startedAt = new Date().toISOString();

  const configResponse = await request.get('/api/experiments/visual-search/config');
  expect(configResponse.status()).toBe(200);
  const configPayload = (await configResponse.json()) as ConfigPayload;

  const sessionResponse = await request.post('/api/sessions', {
    data: {
      session_id: sessionId,
      participant_id: participantId,
      experiment_id: 'visual-search',
      started_at: startedAt,
      completed_at: null,
      status: 'in_progress',
      config_version: configPayload.version,
      config_snapshot: configPayload.config,
      environment: { source: 'playwright', note: 'E2E researcher fixture' },
    },
  });
  expect(sessionResponse.status()).toBe(201);

  for (const [index, presence] of [true, false].entries()) {
    const trialResponse = await request.post('/api/trials', {
      data: {
        participant_id: participantId,
        experiment_id: 'visual-search',
        session_id: sessionId,
        trial_id: `e2e-trial-${stamp}-${index + 1}`,
        block_id: 'vs_feature',
        block_type: 'original_block',
        condition_id: presence ? '12_present' : '24_absent',
        trial_index: index + 1,
        phase: 'formal',
        stimulus_onset: 100 + index,
        response_time: 512.5 + index,
        response: presence ? 'f' : 'j',
        correct: true,
        timestamp: new Date().toISOString(),
        timeout: false,
        invalid_response: false,
        eye_tracking_status: 'declined',
        calibration_status: 'declined',
        valid_gaze_ratio: null,
        valid_mouse_ratio: 1,
        stimulus: { set_size: 12, target_present: presence },
        response_data: { key: presence ? 'f' : 'j' },
        tracking: {},
        metadata: { source: 'playwright' },
      },
    });
    expect(trialResponse.status()).toBe(201);
  }

  const completionResponse = await request.post(`/api/sessions/${sessionId}/complete`, {
    data: {
      session_id: sessionId,
      completed_at: new Date().toISOString(),
      summary: {
        completed_trials: 2,
        total_trials: 2,
        accuracy: 1,
        mean_response_time_ms: 513,
        median_response_time_ms: 513,
        practice_completed: true,
        details: { source: 'playwright' },
        generated_at: new Date().toISOString(),
      },
    },
  });
  expect(completionResponse.status()).toBe(200);

  await page.goto('/researcher/login');
  await page.getByLabel('账号').fill(RESEARCHER_USERNAME);
  await page.getByLabel('密码').fill(RESEARCHER_PASSWORD);
  await page.getByRole('button', { name: /登录研究者后台/ }).click();

  await expect(page.getByRole('heading', { name: '实验数据台' })).toBeVisible();
  await page.getByRole('tab', { name: /数据与会话/ }).click();
  await page.getByLabel('被试编号').fill(participantId);
  await page.getByLabel('实验').selectOption('visual-search');
  await page.getByRole('button', { name: '应用', exact: true }).click();

  const sessionRow = page.locator('.data-table tbody tr', { hasText: participantId });
  await expect(sessionRow).toHaveCount(1);
  await expect(sessionRow.getByText('已完成')).toBeVisible();
  await sessionRow.getByTitle('查看会话详情').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('会话详情')).toBeVisible();
  await expect(dialog.getByText(sessionId)).toBeVisible();
  await expect(dialog.locator('.data-table tbody tr')).toHaveCount(2);
  await expect(dialog.getByText('12_present')).toBeVisible();
  await expect(dialog.locator('.data-table').getByText('vs_feature').first()).toBeVisible();
  await dialog.getByRole('button', { name: '关闭' }).click();

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /导出 CSV/ }).click(),
  ]);
  const csvPath = await csvDownload.path();
  expect(csvPath).not.toBeNull();
  const csv = await readFile(csvPath as string, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('participant_id');
  expect(csv).toContain('block_id');
  expect(csv).toContain(participantId);
  expect(csv).toContain('12_present');

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /导出 JSON/ }).click(),
  ]);
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const exported = JSON.parse(await readFile(jsonPath as string, 'utf8')) as {
    sessions?: Array<{ session_id?: string; trials?: unknown[] }>;
  };
  const exportedSession = exported.sessions?.find((entry) => entry.session_id === sessionId);
  expect(exportedSession).toBeTruthy();
  expect(exportedSession?.trials).toHaveLength(2);

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('heading', { name: '研究者入口' })).toBeVisible();
  const afterLogout = await page.request.get('/api/researcher/overview');
  expect(afterLogout.status()).toBe(401);
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('participant entry and ordering remain usable without horizontal overflow', async ({
    page,
  }) => {
    await seedParticipant(page, `E2E-MOBILE-${Date.now().toString(36).toUpperCase()}`);
    await overrideConfig(
      page,
      'perceptual-ordering',
      {
        practiceTrials: 2,
        randomizeBlockOrder: false,
        responseTimeoutMs: 20_000,
        postTrialDelayMs: 60,
      },
      [4, 4],
    );
    const errors = collectPageErrors(page);

    const assertNoOverflow = async (stage: string) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${stage} should not overflow horizontally`).toBeLessThanOrEqual(1);
    };

    // A participant who already completed setup goes straight to the task
    // instructions; the ID and consent are shared by all three experiments.
    await page.goto('/enter/perceptual-ordering');
    await expect(page).toHaveURL(/\/instructions\/perceptual-ordering$/);
    await expect(page.getByRole('heading', { name: '实验说明' })).toBeVisible();

    // The explicit change link still exposes the setup form.
    await page.goto('/enter/perceptual-ordering?change=1');
    await expect(page.getByRole('heading', { name: '被试登录' })).toBeVisible();
    await assertNoOverflow('entry');
    await page.screenshot({ path: 'test-results/mobile-entry.png' });

    await page.getByRole('checkbox').nth(0).check();
    await page.getByRole('checkbox').nth(1).check();
    await page.getByRole('button', { name: /登录并继续/ }).click();

    await expect(page.getByRole('heading', { name: '实验说明' })).toBeVisible();
    await assertNoOverflow('instructions');
    await expect(page.getByRole('heading', { name: '按面积从小到大排序' })).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /开始练习阶段/ }).click();

    await expect(page.getByRole('heading', { name: '按面积从小到大排序' })).toBeVisible();
    await page.getByRole('button', { name: /开始练习/ }).click();
    await expect(page.getByText('按面积从小到大排列', { exact: true })).toBeVisible();
    await assertNoOverflow('runtime');
    await page.screenshot({ path: 'test-results/mobile-ordering.png' });

    const ratios = await page.locator('.ordering-pool .rect-item').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width / rect.height;
      }),
    );
    expect(ratios).not.toHaveLength(0);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(1.6, 1);

    const fillAndSubmit = async () => {
      await expect(page.getByText('按面积从小到大排列', { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      const rectangles = page.locator('.ordering-pool .rect-item');
      const count = await rectangles.count();
      for (let index = 0; index < count; index += 1) {
        await rectangles.first().click();
        await page.locator('.ordering-slot').nth(index).click();
      }
      await page.getByRole('button', { name: /提交排序/ }).click();
    };

    for (let index = 0; index < 2; index += 1) {
      await fillAndSubmit();
      await page.waitForTimeout(1900);
    }
    await expect(page.getByRole('heading', { name: '练习完成' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /开始正式实验/ }).click();

    await clickThroughFormalBlocks(
      page,
      ['原始面积排序', '混合长宽比排序'],
      4,
      async () => {
        await fillAndSubmit();
        await page.waitForTimeout(200);
      },
    );

    await expect(page).toHaveURL(/\/results\/perceptual-ordering/, { timeout: 25_000 });
    await expect(page.getByRole('heading', { name: '图形知觉排序 · 结果' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('offline trial uploads resume without duplicates', async ({ page, request }) => {
  const stamp = Date.now().toString(36);
  const participantId = `E2E-OFFLINE-${stamp.toUpperCase()}`;
  await seedParticipant(page, participantId);
  await overrideConfig(
    page,
    'visual-search',
    {
      practiceTrials: 2,
      randomizeBlockOrder: false,
      fixationDurationMs: 120,
      responseTimeoutMs: 4000,
      postTrialDelayMs: 60,
      mouseTracking: false,
      eyeTrackingEnabled: false,
    },
    [4, 4, 15],
  );

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/trials', (route) => route.abort('failed'));

  await page.goto('/experiment/visual-search');

  await runVisualBlock(page, 0, 4);
  await runVisualBlock(page, 1, 4);
  await runVisualBlock(page, 2, 15);

  await expect(page).toHaveURL(/\/results\/visual-search/, { timeout: 25_000 });
  expect(await outboxCount(page)).toBeGreaterThan(0);

  await page.unroute('**/api/trials');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => outboxCount(page), { timeout: 30_000 }).toBe(0);

  const login = await request.post('/api/researcher/login', {
    data: { username: RESEARCHER_USERNAME, password: RESEARCHER_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const exportResponse = await request.get(
    `/api/researcher/export.json?participant_id=${participantId}&experiment_id=visual-search&phase=formal`,
  );
  expect(exportResponse.status()).toBe(200);
  const exported = (await exportResponse.json()) as {
    sessions?: Array<{ status?: string; trials?: Array<{ trial_id?: string }> }>;
  };
  expect(exported.sessions).toHaveLength(1);
  expect(exported.sessions?.[0]?.status).toBe('completed');
  const trialIds = exported.sessions?.[0]?.trials?.map((trial) => trial.trial_id) ?? [];
  expect(trialIds).toHaveLength(23);
  expect(new Set(trialIds).size).toBe(23);
  expect(pageErrors).toEqual([]);
});
