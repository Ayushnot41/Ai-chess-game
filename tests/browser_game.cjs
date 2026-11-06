/** Run after starting uvicorn on port 8017; npm install --prefix .qa playwright. */
const { chromium } = require('../.qa/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.CHESS_TEST_URL || 'http://127.0.0.1:8017';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const errors = [];
    let checks = 0;
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce', acceptDownloads:true});
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base, {waitUntil:'networkidle'});
        await page.waitForFunction(() => window.app?.cachedPrediction);
        assert.equal(await page.locator('#select-difficulty').inputValue(), '1'); checks++;
        assert.equal(await page.locator('#turn-title').textContent(), 'Your turn'); checks++;
        await page.screenshot({path:'.qa/desktop.png',fullPage:true});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks++;

        // Keyboard turn, AI response, authoritative meshes, undo and persistence.
        await page.locator('#move-input').fill('e4'); await page.locator('#submit-move').click();
        await page.waitForFunction(() => app.chess.history().length === 2 && !app.isBusy());
        assert(await page.evaluate(() => Object.keys(app.board3D.pieceMeshes).length === 32)); checks++;
        const saved = await page.evaluate(() => app.chess.fen());
        await page.reload({waitUntil:'networkidle'});
        assert.equal(await page.evaluate(() => app.chess.fen()), saved); checks++;
        await page.locator('#btn-undo').click();
        await page.waitForFunction(() => app.chess.history().length === 0);
        checks++;

        // An actual pointer click selects the requested piece and legal targets.
        const point = await page.evaluate(() => {
            const mesh = app.board3D.pieceMeshes.e2.mesh;
            const position = mesh.position.clone(); position.y += .5;
            position.project(app.board3D.camera);
            const rect = app.board3D.renderer.domElement.getBoundingClientRect();
            return {x:rect.left+(position.x+1)*rect.width/2,y:rect.top+(1-position.y)*rect.height/2};
        });
        await page.mouse.click(point.x,point.y);
        assert.equal(await page.evaluate(() => app.selectedSquare), 'e2'); checks++;
        assert.equal(await page.evaluate(() => app.board3D.indicators.length), 2); checks++;

        // Legal-special-move reconciliation without waiting for an AI reply.
        async function special(fen, move, test) {
            await page.evaluate(({fen,move}) => {
                app.invalidatePosition(); app.chess.load(fen); app.initialFen=fen; app.history=[];
                app.board3D.loadFEN(fen);
                app.specialDone = false;
                const played = app.chess.move(move, {sloppy:true});
                if (!played) throw new Error('Illegal test move');
                app.animateLegalMove(played, () => { app.specialDone=true; });
            }, {fen,move});
            await page.waitForFunction(() => app.specialDone);
            assert(await page.evaluate(test)); checks++;
        }
        await special('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1','O-O', () => !!app.board3D.pieceMeshes.f1 && !app.board3D.pieceMeshes.h1 && app.board3D.pieceMeshes.g1.type === 'k');
        await special('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1','exd6', () => !app.board3D.pieceMeshes.d5 && !!app.board3D.pieceMeshes.d6);
        await special('7k/P7/8/8/8/8/8/7K w - - 0 1','a8=N', () => app.board3D.pieceMeshes.a8.type === 'n');

        // A response from a previous game must not apply to a new board.
        await page.route('**/api/move', async route => {
            await pause(600);
            await route.fulfill({json:{best_move_uci:'e2e4',nodes:1,time_ms:1}}).catch(() => {});
        });
        await page.evaluate(() => { app.startNewGame('black'); setTimeout(() => app.startNewGame('white'), 50); });
        await pause(850);
        assert.equal(await page.evaluate(() => app.chess.history().length), 0); checks++;
        assert.equal(await page.evaluate(() => app.isAiThinking), false); checks++;
        await page.unroute('**/api/move');

        // Failed AI requests expose an actionable retry instead of a stuck game.
        await page.route('**/api/move', route => route.fulfill({status:503,json:{detail:'Engine busy'}}));
        await page.evaluate(() => app.startNewGame('black'));
        await page.waitForFunction(() => !app.isAiThinking);
        assert(await page.locator('#btn-retry-ai').isVisible()); checks++;
        await page.unroute('**/api/move');
        await page.locator('#btn-retry-ai').click();
        await page.waitForFunction(() => app.chess.history().length === 1 && !app.isBusy()); checks++;
        await page.evaluate(() => app.startNewGame('white'));

        // Export is a real PGN file, and modal keyboard focus stays contained.
        const downloaded = page.waitForEvent('download');
        await page.locator('#btn-export').click();
        const download = await downloaded;
        const content = await fs.readFile(await download.path(), 'utf8');
        assert(content.includes('[Event "Grandmaster-AI practice"]')); checks++;
        await page.locator('#btn-new-game').click();
        assert(await page.evaluate(() => document.querySelector('#modal-new-game').contains(document.activeElement))); checks++;
        await page.keyboard.press('Escape');
        assert(await page.locator('#modal-new-game').isHidden()); checks++;

        // Render both modes and all responsive widths in one inspection batch.
        await page.locator('#btn-kid-mode').click();
        await page.screenshot({path:'.qa/analysis.png',fullPage:true});
        await page.locator('#btn-kid-mode').click();
        for (const width of [1024,768,390]) {
            await page.setViewportSize({width,height:844});
            await pause(250);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`); checks++;
        }
        await page.screenshot({path:'.qa/mobile.png',fullPage:true});
        assert.equal(errors.length,0,errors.join('\n')); checks++;
        console.log(`PASS: ${checks} browser checks; desktop/mobile screenshots; no page errors.`);
        await context.close();
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1});
