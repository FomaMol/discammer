import { test, expect } from '@playwright/test';
import fs from 'node:fs';
test('capture comparable redesign baseline', async ({ page }) => {
  test.skip(!process.env.CAPTURE_BASELINE, 'Explicit baseline capture only');
  await page.setViewportSize({width:1366,height:768});
  await page.addInitScript(() => {
    (window as any).metrics={lcp:0,cls:0};
    new PerformanceObserver(l=>l.getEntries().forEach(e=>(window as any).metrics.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(l=>l.getEntries().forEach((e:any)=>{if(!e.hadRecentInput)(window as any).metrics.cls+=e.value})).observe({type:'layout-shift',buffered:true});
  });
  await page.goto('/ru/');
  await expect(page.locator('textarea')).toBeVisible();
  await page.screenshot({path:'docs/design/2026-09-implementation/evidence/baseline-home.png',fullPage:true});
  const metrics=await page.evaluate(()=>({...((window as any).metrics),resources:performance.getEntriesByType('resource').map((r:any)=>({name:r.name,bytes:r.transferSize,decoded:r.decodedBodySize}))}));
  fs.writeFileSync('docs/design/2026-09-implementation/evidence/baseline-metrics.json',JSON.stringify(metrics,null,2));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'docs/design/2026-09-implementation/evidence/baseline-mobile.png',fullPage:true});
});
