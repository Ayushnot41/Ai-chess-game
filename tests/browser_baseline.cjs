const { chromium } = require('../.qa/node_modules/playwright');
(async () => {
    const browser = await chromium.launch({channel:'chrome',headless:true, args:['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', e => console.log('PAGE_ERROR', e.message));
    await page.goto('http://127.0.0.1:8017', {waitUntil:'networkidle'});
    await page.screenshot({path:'.qa/before-desktop.png',fullPage:true});
    console.log(await page.evaluate(() => ({loaded:!!window.app, width:document.documentElement.scrollWidth, viewport:innerWidth})));
    await browser.close();
})().catch(e => {console.error(e);process.exitCode=1});
