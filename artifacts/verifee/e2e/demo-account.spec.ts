import { expect, test } from '@playwright/test';

test('enters the demo account and opens the seeded NTU report', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('link-try-verifee-hero').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('button-enter-demo')).toBeVisible();
  await page.getByTestId('button-enter-demo').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('text-report-count')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Start a new mapping' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Understand the context behind a credential.' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('verifee-demo-session') ?? 'null'),
    ),
  ).toEqual({ mode: 'DEMO', displayName: 'Verifee Demo' });
  expect(
    await page.evaluate(() => localStorage.getItem('verifee-demo-session')),
  ).toBeNull();

  await page.getByTestId('button-my-reports').click();
  await expect(page).toHaveURL(/\/my-reports$/);
  await expect(page.getByTestId('card-saved-report-VF-DEMO-001')).toBeVisible();
  await expect(page.getByTestId('report-status-VF-DEMO-001')).toHaveText('Ready');
  await expect(page.getByTestId('report-source-institution-VF-DEMO-001')).toHaveText(
    'Nanyang Technological University',
  );
  await expect(page.getByTestId('report-target-institution-VF-DEMO-001')).toHaveText(
    'Georgia Institute of Technology',
  );
  await expect(page.getByTestId('report-program-VF-DEMO-001')).toHaveText(
    'Master of Science in Analytics',
  );

  await page.getByTestId('button-open-report-VF-DEMO-001').click();
  await expect(page).toHaveURL(/\/saved-report\/VF-DEMO-001$/);
  await expect(page.getByRole('heading', { name: 'Report preview' })).toBeVisible();
  await expect(page.getByText('Nanyang Technological University').first()).toBeVisible();
  await expect(page.getByText('This report uses fictional coursework for demonstration')).toBeVisible();
});

test('protects mapping routes until the demo session starts and clears it on exit', async ({
  page,
}) => {
  await page.goto('/start');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByTestId('button-enter-demo').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('button-demo-log-out').click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() => ({
      account: sessionStorage.getItem('verifee-demo-session'),
      reports: sessionStorage.getItem('verifee-demo-saved-reports'),
    })),
  ).toEqual({ account: null, reports: null });

  await page.goto('/analysis');
  await expect(page).toHaveURL(/\/login$/);
});

test('starts a fresh mapping from the workspace overview card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('link-try-verifee-hero').click();
  await page.getByTestId('button-enter-demo').click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.evaluate(() => {
    sessionStorage.setItem('verifee-started', 'yes');
    sessionStorage.setItem('verifee-file-name', 'previous-transcript.pdf');
    sessionStorage.setItem('verifee-generated-report', JSON.stringify({
      reportId: 'VF-OLD1234',
      generatedAt: '2026-01-01T00:00:00.000Z',
    }));
  });

  const startMapping = page.getByRole('button', { name: 'Start a new mapping' });
  await expect(startMapping).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const cardBounds = await startMapping.boundingBox();
  expect(cardBounds).not.toBeNull();
  expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(390);
  await startMapping.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', { name: 'Upload an academic credential' })).toBeVisible();
  await expect(page.getByTestId('button-resume-analysis')).toHaveCount(0);
  expect(await page.evaluate(() => ({
    started: sessionStorage.getItem('verifee-started'),
    fileName: sessionStorage.getItem('verifee-file-name'),
    generatedReport: sessionStorage.getItem('verifee-generated-report'),
  }))).toEqual({ started: null, fileName: null, generatedReport: null });
});
