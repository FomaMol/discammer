import { expect, test } from '@playwright/test';

const modules = [
  'threat-fundamentals', 'social-engineering', 'phishing',
  'passwords-mfa', 'financial-fraud', 'ai-deepfakes',
  'mobile-network', 'incident-response', 'final-assessment',
];

type Lesson = { module_slug: string; slug: string; content_revision: string | null };

for (const moduleSlug of modules) {
  test(`${moduleSlug} loads every EN/RU lesson on desktop and phone`, async ({ page, request }) => {
    test.setTimeout(90_000);
    const manifests = await Promise.all(['en', 'ru'].map(async (lang) => {
      const response = await request.get(`/api/course/lesson-manifest?lang=${lang}`);
      expect(response.ok()).toBe(true);
      return [lang, await response.json() as Lesson[]] as const;
    }));
    const routes = manifests.flatMap(([lang, lessons]) => lessons
      .filter((lesson) => lesson.module_slug === moduleSlug)
      .map((lesson) => ({ lang, lesson })));
    expect(routes.length).toBeGreaterThan(0);

    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: viewport.width < 500 ? 'reduce' : 'no-preference' });
      for (const { lang, lesson } of routes) {
        const errors: string[] = [];
        const onError = (error: Error) => errors.push(error.message);
        page.on('pageerror', onError);
        const response = await page.goto(`/${lang}/course/${moduleSlug}/${lesson.slug}?analytics=off`);
        expect(response?.status(), `${lang}/${moduleSlug}/${lesson.slug}`).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (lesson.slug === 'final-exam' && moduleSlug === 'final-assessment') {
          await expect(page.locator('input[type="radio"]').first()).toBeVisible();
          expect(await page.locator('input[type="radio"]').count()).toBeGreaterThanOrEqual(3);
        } else if (lesson.content_revision && lesson.slug !== 'defender-certificate') {
          await expect(page.locator('[data-course-version="2"]')).toBeVisible();
        }
        expect(errors, `${lang}/${moduleSlug}/${lesson.slug} script errors`).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow, `${lang}/${moduleSlug}/${lesson.slug} horizontal overflow`).toBeLessThanOrEqual(2);
        page.off('pageerror', onError);
      }
    }
  });
}
