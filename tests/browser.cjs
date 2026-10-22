// Optional browser verification: npm package playwright + a local Chrome/Edge.
// The game itself needs neither Node nor Playwright.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let playwright;
try { playwright=require('playwright'); }
catch { playwright=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const {chromium}=playwright;
const url=process.env.GAME_URL || 'http://127.0.0.1:8000';
const results=path.resolve(__dirname,'../test-results');
fs.mkdirSync(results,{recursive:true});

(async()=>{
  const executable=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser=await chromium.launch({headless:true,executablePath:executable});
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const realNow=Date.now.bind(Date);
    window.__clockOffset=0;
    Date.now=()=>realNow()+window.__clockOffset;
  });
  const cell=(x,y)=>page.locator(`.hit-target[data-x="${x}"][data-y="${y}"]`);
  const click=async(x,y)=>cell(x,y).click();
  const submit=()=>page.locator('#primary-action').click();
  const history=()=>page.locator('.history-row').count();
  const waitHistory=n=>page.waitForFunction(n=>document.querySelectorAll('.history-row').length===n,n);
  const move=async(points)=>{for(const [x,y] of points) await click(x,y); await submit();};
  const confirmDialog=()=>page.locator('#confirm-dialog button[value="confirm"]').click();
  try {
    await page.goto(url); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#black-clock').textContent(),'10:00');
    assert.equal(await page.locator('.hit-target').count(),225);
    await page.screenshot({path:path.join(results,'desktop-ready.png'),fullPage:true});

    await submit(); await move([[0,0]]);
    await page.waitForFunction(()=>!document.getElementById('ai-error').hidden);
    assert.equal(await history(),1);
    assert.match(await page.locator('#ai-error').textContent(),/非法落点/);
    await page.locator('#undo-action').click(); assert.equal(await history(),0);
    await move([[7,7]]); await waitHistory(2);
    assert.equal(await page.locator('#ai-error').isVisible(),false);
    await page.locator('#undo-action').click(); assert.equal(await history(),0);
    await page.locator('[data-color="-1"]').click(); await confirmDialog();
    await submit(); await waitHistory(1);
    await move([[6,7],[7,6]]); await waitHistory(3);
    await page.screenshot({path:path.join(results,'desktop-game.png'),fullPage:true});
    await page.locator('#undo-action').click(); assert.equal(await history(),1);
    console.log('PASS original AI both colors, corner error reporting, regular opening and undo');

    await page.locator('[data-mode="local"]').click(); await confirmDialog(); await submit();
    for(const points of [[[0,0]],[[0,14],[2,14]],[[1,0],[2,0]],[[4,14],[6,14]],[[3,0],[4,0]],[[8,14],[10,14]],[[5,0]]]) await move(points);
    assert.match(await page.locator('#status-title').textContent(),/黑方获胜/);
    assert.equal(await page.locator('.winning-path').count(),1);
    assert.equal(await page.locator('#undo-action').isDisabled(),true);
    const stopped=await page.locator('#black-clock').textContent();
    await page.evaluate(()=>{window.__clockOffset+=10000;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('#black-clock').textContent(),stopped);
    await page.screenshot({path:path.join(results,'local-win.png'),fullPage:true});
    console.log('PASS local game, one-stone victory, line highlight and stopped clocks');

    await page.locator('#restart-action').click(); await confirmDialog(); await submit(); await click(7,7);
    // Same task: expire and submit before the refresh interval can update the button.
    await page.evaluate(()=>{window.__clockOffset+=600001;document.querySelector('#primary-action').click();});
    assert.match(await page.locator('#status-title').textContent(),/白方获胜/);
    assert.equal(await history(),0);
    assert.equal(await page.locator('#black-clock').textContent(),'00:00');
    console.log('PASS timeout wins race with confirmation');

    await page.locator('#restart-action').click(); await confirmDialog(); await submit();
    await page.locator('#restart-action').click();
    await page.evaluate(()=>{window.__clockOffset+=10000;document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await page.locator('#black-clock').textContent(),/09:4\d|09:50/);
    await page.locator('#confirm-dialog button[value="cancel"]').click();
    assert.match(await page.locator('#status-title').textContent(),/黑方，请落子/);
    console.log('PASS confirmation dialog does not pause time');

    // Delay AI responses at the network boundary, then reset/expire before release.
    await page.locator('[data-mode="single"]').click(); await confirmDialog();
    let release,requested,finished;
    let gate=new Promise(resolve=>{release=resolve;});
    let ready=new Promise(resolve=>{requested=resolve;});
    let done=new Promise(resolve=>{finished=resolve;});
    await page.route('**/api/ai',async route=>{
      requested(); await gate;
      try {await route.fulfill({json:{stones:[[7,7]]}});} catch {}
      finished();
    });
    await submit(); await ready;
    await page.locator('#restart-action').click(); await confirmDialog();
    release(); await done;
    assert.equal(await history(),0); assert.equal(await page.locator('#black-clock').textContent(),'10:00');
    assert.equal(await page.locator('#primary-action').textContent(),'开始对局');

    gate=new Promise(resolve=>{release=resolve;}); ready=new Promise(resolve=>{requested=resolve;}); done=new Promise(resolve=>{finished=resolve;});
    await submit(); await ready;
    await page.evaluate(()=>{window.__clockOffset+=600001;document.dispatchEvent(new Event('visibilitychange'));});
    release(); await done;
    assert.equal(await history(),0); assert.match(await page.locator('#status-title').textContent(),/白方获胜/);
    await page.unroute('**/api/ai');
    console.log('PASS late AI response discarded after restart and timeout');

    await page.route('**/api/ai',route=>route.fulfill({status:502,json:{error:'测试：本次 AI 请求失败，请重试。'}}),{times:1});
    await submit();
    await page.waitForFunction(()=>!document.getElementById('ai-error').hidden);
    assert.match(await page.locator('#primary-action').textContent(),/重试 AI/);
    await submit(); await waitHistory(1);
    assert.equal(await page.locator('#ai-error').isVisible(),false);
    await cell(5,5).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    assert.equal(await cell(6,5).getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Escape'); assert.equal(await cell(6,5).getAttribute('aria-pressed'),'false');
    await move([[6,7],[7,6]]); await waitHistory(3);
    console.log('PASS AI failure/retry and keyboard preselection');

    const invalid=await page.request.post(url+'/api/ai',{data:{history:[],aiColor:-1}});
    assert.equal(invalid.status(),400);
    const origin=await page.request.post(url+'/api/ai',{data:{history:[],aiColor:1},headers:{Origin:'http://example.invalid'}});
    assert.equal(origin.status(),403);
    const source=await page.request.get(url+'/FinalVersion.cpp'); assert.equal(source.status(),404);
    console.log('PASS HTTP validation, origin checks and static file boundary');

    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(results,'mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('PASS 390px layout and no browser JavaScript errors');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
