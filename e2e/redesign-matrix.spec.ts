import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const routes=['','game','journal','journal/the-story-of-alex-chen','guide/phishing','course','course/threat-fundamentals','course/threat-fundamentals/attack-vectors','check','inspect','search?q=phishing','about','portfolio','__missing__'];
for(const theme of ['soft-red','graphite-silver'])for(const lang of ['en','ru'])for(const [width,height] of [[320,844],[390,844],[768,1024],[1366,768],[1440,900]]){
 test(`${theme} ${lang} ${width} all surfaces`,async({page})=>{
  test.skip(!process.env.REDESIGN_MATRIX,'Explicit full visual matrix capture');test.setTimeout(180000);
  await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(t=>localStorage.setItem('discammer.theme.v1',t),theme);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of routes){
   const response=await page.goto(`/${lang}/${route}`);expect(response?.status()).toBe(route==='__missing__'?404:200);
   await expect(page.locator('h1').first()).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   await page.evaluate(()=>document.fonts.ready);
   if(route==='')await expect(page.locator('textarea')).toBeVisible();
   if(route==='game')await expect(page.locator('[data-component="GameLauncher"] button')).toBeVisible();
   if(route==='journal')await expect(page.locator('#journal-foundation')).toBeHidden();
   if(route==='course')await expect(page.locator('#course-foundation')).toBeHidden();
   if(route==='course/threat-fundamentals')await expect(page.locator('#module-foundation')).toBeHidden();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow,`${route} overflow`).toBe(false);
   const slug=route.replace(/[^a-z-]/g,'-')||'home';
   if([390,1366].includes(width))await page.screenshot({path:`docs/design/2026-09-implementation/evidence/${theme}-${lang}-${width}-${slug}.png`,fullPage:true,animations:'disabled'});
  }
  expect(errors).toEqual([]);
 });
}
test('comparable post-redesign performance sample',async({page})=>{
 test.skip(!process.env.REDESIGN_MATRIX,'Explicit performance evidence');await page.setViewportSize({width:1366,height:768});
 await page.addInitScript(()=>{
  (window as any).metrics={lcp:0,cls:0,interactions:[]};
  new PerformanceObserver(l=>l.getEntries().forEach(e=>(window as any).metrics.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
  new PerformanceObserver(l=>l.getEntries().forEach((e:any)=>{if(!e.hadRecentInput)(window as any).metrics.cls+=e.value})).observe({type:'layout-shift',buffered:true});
  new PerformanceObserver(l=>l.getEntries().forEach((e:any)=>{if(e.interactionId)(window as any).metrics.interactions.push(e.duration)})).observe({type:'event',buffered:true,durationThreshold:16} as any);
 });
 await page.goto('/ru/');await expect(page.locator('textarea')).toBeVisible();await page.locator('textarea').pressSequentially('Учебный пример');
 const data=await page.evaluate(()=>({...((window as any).metrics),resources:performance.getEntriesByType('resource').map((r:any)=>({name:r.name,bytes:r.transferSize,decoded:r.decodedBodySize}))}));
 fs.writeFileSync('docs/design/2026-09-implementation/evidence/redesign-metrics.json',JSON.stringify(data,null,2));
});
