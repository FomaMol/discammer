import { test, expect } from '@playwright/test';
const KEY='discammer.theme.v1';
for (const lang of ['en','ru']) {
 test(`${lang} theme persists without resetting input and across routes`, async ({page,context})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto(`/${lang}/`);
  await expect(page.locator('html')).toHaveAttribute('data-theme','soft-red');
  const input=page.locator('textarea');await input.fill('Synthetic learning message');
  const button=page.getByRole('button',{name:lang==='ru'?'Оформление':'Appearance',exact:true});
  await button.click();await page.locator('input[value="graphite-silver"]').check();
  await expect(input).toHaveValue('Synthetic learning message');
  await expect(page.locator('html')).toHaveAttribute('data-theme','graphite-silver');
  await page.locator('input[value="graphite-silver"]').press('Escape');await expect(button).toBeFocused();
  const second=await context.newPage(); await second.goto(`/${lang}/course`);
  await expect(second.locator('html')).toHaveAttribute('data-theme','graphite-silver');
  await button.click();await page.locator('input[value="soft-red"]').check();
  await expect(second.locator('html')).toHaveAttribute('data-theme','soft-red');
  await page.goto(`/${lang==='ru'?'en':'ru'}/journal`);await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','soft-red');
 });
 test(`${lang} mobile theme keyboard and state`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto(`/${lang}/`);
  await page.locator('[data-component="MobileMenu"] button').click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:lang==='ru'?'Оформление':'Appearance'}).click();
  await dialog.locator('input[value="graphite-silver"]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme','graphite-silver');
  await dialog.locator('input[value="graphite-silver"]').press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('[role=dialog]')).toHaveAttribute('aria-hidden','true');
 });
}
for(const scenario of ['invalid','denied'])test(`theme ${scenario} storage fails safely`,async({page})=>{
 await page.addInitScript(({scenario,KEY})=>{
  if(scenario==='invalid')localStorage.setItem(KEY,'bogus');
  else Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}});
 },{scenario,KEY});
 await page.setViewportSize({width:1366,height:768});await page.goto('/en/');
 await expect(page.locator('html')).toHaveAttribute('data-theme','soft-red');
 await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.locator('input[value="graphite-silver"]').check();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graphite-silver');
 await expect(page.locator('textarea')).toBeVisible();
});
test('JS disabled leaves default theme and native mobile navigation',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto('/ru/game');await expect(page.locator('html')).toHaveAttribute('data-theme','soft-red');
 await page.locator('.ssr-menu summary').click();await expect(page.locator('.ssr-menu a[href="/ru/course"]')).toBeVisible();
 await page.locator('.ssr-menu summary').click();await expect(page.locator('a[href="/play/"]')).toBeVisible();await context.close();
});
test('failed islands leave usable SSR navigation and game launch link',async({page})=>{
 await page.route('**/static/js/chunks/MobileMenu-*.js',r=>r.abort());await page.route('**/static/js/chunks/GameLauncher-*.js',r=>r.abort());
 await page.setViewportSize({width:390,height:844});await page.goto('/en/game');
 await expect(page.locator('.ssr-menu summary')).toBeVisible();await expect(page.locator('a[href="/play/"]')).toBeVisible();
});
test('both themes pass role contrast on all text surfaces',async({page})=>{
 await page.goto('/en/');
 for(const theme of ['soft-red','graphite-silver']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const pairs=await page.evaluate(()=>{
   const css=getComputedStyle(document.documentElement);const lum=(role:string)=>{
    const h=css.getPropertyValue('--'+role).trim().slice(1);const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;
   };
   return ['canvas','panel','raised','input','code'].flatMap(bg=>['text','muted','text-soft','brand','warning','danger','success'].map(fg=>({bg,fg,ratio:(Math.max(lum(bg),lum(fg))+.05)/(Math.min(lum(bg),lum(fg))+.05)})));
  });
  for(const p of pairs)expect(p.ratio,`${theme} ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5);
 }
});

test('mobile menu opened before enhancement releases scroll when resized to desktop', async ({ page }) => {
  let releaseImport!: () => void;
  let markRequested!: () => void;
  const importGate = new Promise<void>((resolve) => { releaseImport = resolve; });
  const requested = new Promise<void>((resolve) => { markRequested = resolve; });
  await page.route('**/static/js/chunks/MobileMenu-*.js', async (route) => {
    markRequested();
    await importGate;
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/about', { waitUntil: 'domcontentloaded' });
  await requested;
  await page.locator('.ssr-menu summary').click();
  await expect(page.locator('.ssr-menu')).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 1440, height: 900 });
  releaseImport();
  await expect(page.locator('[data-component="MobileMenu"] button')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await expect(page.locator('nav').first().locator('a[href="/en/course"]').first()).toBeVisible();
});
