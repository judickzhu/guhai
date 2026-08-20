const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'zh-Hant-TW' });
  const page = await ctx.newPage();
  await page.goto('https://judickzhu.github.io/guhai/index.html?t=' + Date.now(), { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);
  async function ask(q) {
    await page.evaluate((qq) => window.DCSister.ask(qq), q);
    await page.waitForTimeout(3000);
    return page.evaluate(() => {
      const m = document.querySelectorAll('#dc-messages .dc-msg-bubble');
      const arr = Array.from(m).map(x => x.textContent.trim());
      return (arr[arr.length-1]||'').slice(0, 36);
    });
  }
  await ask('怎麼收費？'); await ask('休眠是什麼？');
  console.log('【線上事務 vs 認知路由】');
  const r1 = await ask('怎麼綁定OKX API？');
  console.log('事務-API綁定:', r1);
  const r2 = await ask('為什麼小虧不捨得走？');
  console.log('認知-小虧扛單:', r2);
  await browser.close();
})();
