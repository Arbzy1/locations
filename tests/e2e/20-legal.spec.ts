import { expect, test } from '@playwright/test';

for (const [path, title] of [
  ['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/cookies', 'Cookies and browser storage'],
  ['/subprocessors', 'Service providers'], ['/dpa', 'Data Processing Agreement'],
  ['/accessibility', 'Accessibility statement'], ['/impressum', 'Operator details'],
]) {
  test(`public legal route ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reject saved preferences', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Legal', exact: true }).getByRole('link')).toHaveCount(7);
    await expect(page.getByText('docs/legal/privacy.md')).toHaveCount(0);
  });
}

test('storage consent can be rejected, granted and withdrawn', async ({ page }) => {
  await page.goto('/cookies');
  await page.getByRole('button', { name: 'Reject saved preferences', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('locations-storage-consent'))).toBe('deny');
  await page.getByRole('button', { name: 'Storage choices', exact: true }).click();
  await page.getByRole('button', { name: 'Allow saved preferences', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('locations-storage-consent'))).toBe('allow');
  await page.evaluate(() => localStorage.setItem('locations-recent-places', 'private places'));
  await page.getByRole('button', { name: 'Storage choices', exact: true }).click();
  await page.getByRole('button', { name: 'Reject saved preferences', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('locations-recent-places'))).toBeNull();
});


test('legal pages fit a phone in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('locations-storage-consent', 'deny'));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
