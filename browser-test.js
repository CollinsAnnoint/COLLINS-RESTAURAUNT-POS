const { chromium } = require('playwright');
const fs = require('fs');
fs.mkdirSync('browser-tests', { recursive: true });
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e.stack || e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 300)); });
  const out = [];
  const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

  await p.goto('http://127.0.0.1:8000/', { waitUntil: 'load' });
  await p.waitForTimeout(4000); // let entrance animations settle

  // 1. Homepage health
  const health = await p.evaluate(() => ({
    items: document.querySelectorAll('#menu .item').length,
    toast: !!document.querySelector('.toast.show, .toast'),
    toastText: (document.querySelector('.toast') || {}).textContent || '',
    discountEditorOpen: !document.getElementById('discountEditor').hidden,
    brandOverflow: (() => { const el = document.querySelector('.sidebar .brand-copy'); return el.scrollWidth > el.clientWidth + 1; })(),
    bodyOverflowX: document.body.scrollWidth > document.documentElement.clientWidth + 1,
    clock: (document.getElementById('clock').textContent || '').trim(),
    sums: [...document.querySelectorAll('.sumrow')].map(r => r.innerText.replace(/\n/g, ' | ')),
    quickPicks: !!document.getElementById('openQuickPicks') && !document.getElementById('openQuickPicks').hidden,
    rewards: !!document.getElementById('loyaltyBox') && !document.getElementById('loyaltyBox').hidden,
    style: document.body.dataset.productDisplayStyle
  }));
  log('HEALTH ' + JSON.stringify(health, null, 1));
  await p.screenshot({ path: 'browser-tests/01-home-photos.png' });

  // 2. All seven display styles (in-memory only, no save to backend)
  for (const style of ['photos', 'minimal', 'compact', 'horizontal', 'gallery', 'board', 'feature']) {
    await p.evaluate(s => { settings.productDisplayStyle = s; applySettings(); renderMenu(); }, style);
    await p.waitForTimeout(1200);
    const info = await p.evaluate(() => ({
      items: document.querySelectorAll('#menu .item').length,
      arts: [...document.querySelectorAll('#menu .item-art')].filter(a => a.offsetParent !== null).length,
      adds: [...document.querySelectorAll('#menu .item button')].filter(x => x.offsetParent !== null).length,
      bodyStyle: document.body.dataset.productDisplayStyle
    }));
    log(`STYLE ${style}: items=${info.items} visibleArt=${info.arts} addBtns=${info.adds} body=${info.bodyStyle}`);
    await p.locator('#menu').screenshot({ path: `browser-tests/02-style-${style}.png` });
  }
  await p.evaluate(() => { settings.productDisplayStyle = 'photos'; applySettings(); renderMenu(); });

  // 3. Ordering flow + math
  await p.waitForTimeout(800);
  const names = await p.locator('#menu .item .item-name').evaluateAll(es => es.slice(0, 2).map(e => e.textContent.trim()));
  await p.locator('#menu .item button').nth(0).click({ force: true });
  await p.locator('#menu .item button').nth(0).click({ force: true });
  await p.locator('#menu .item button').nth(1).click({ force: true });
  await p.waitForTimeout(500);
  const cart1 = await p.evaluate(() => ({
    count: (document.getElementById('itemCount') || {}).textContent,
    sub: document.getElementById('subtotal').textContent,
    svc: document.getElementById('serviceCharge').textContent,
    vat: document.getElementById('vat').textContent,
    tot: document.getElementById('total').textContent
  }));
  log('CART after 2x item1 + 1x item2 (' + names.join(' / ') + '): ' + JSON.stringify(cart1));
  // discount via UI
  await p.locator('#discountControl').click();
  await p.locator('#discountPercent').fill('10');
  await p.locator('#applyDiscount').click();
  await p.waitForTimeout(400);
  const cart2 = await p.evaluate(() => ({
    row: document.getElementById('discountRow').innerText.replace(/\n/g, ' '),
    tot: document.getElementById('total').textContent
  }));
  log('CART after 10% discount: ' + JSON.stringify(cart2));
  await p.screenshot({ path: 'browser-tests/03-cart-with-discount.png' });
  // checkout modal
  await p.locator('#pay').click();
  await p.waitForTimeout(600);
  log('Checkout modal visible: ' + await p.locator('#modal').isVisible());
  await p.screenshot({ path: 'browser-tests/04-checkout.png' });
  await p.locator('#cancel').click();

  // 4. Quick picks open/close + rewards toggle
  await p.locator('#openQuickPicks').click();
  await p.waitForTimeout(800);
  log('QuickPicks open: ' + await p.locator('#quickPicks').isVisible());
  await p.screenshot({ path: 'browser-tests/05-quickpicks.png' });
  const qpClose = p.locator('#quickPicks button.close, #quickPicks [data-close], #closeQuickPicks');
  if (await qpClose.count()) { await qpClose.first().click(); } else { await p.keyboard.press('Escape'); }
  await p.waitForTimeout(400);
  log('QuickPicks closed: ' + !(await p.locator('#quickPicks').isVisible()));

  // 5. Dark appearance
  await p.evaluate(() => { applyAppearanceMode('dark'); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'browser-tests/06-dark.png' });
  await p.evaluate(() => { applyAppearanceMode('system'); });

  // 6. Guest display mode
  const guestToggle = await p.evaluate(() => {
    const t = document.querySelector('.display-toggle');
    if (t) { t.click(); return 'clicked'; }
    document.body.classList.add('guest-display'); return 'forced-class';
  });
  await p.waitForTimeout(800);
  log('Guest mode: ' + guestToggle + ', staffControlsHidden=' + await p.locator('#managerOpen').isHidden());
  await p.screenshot({ path: 'browser-tests/07-guest.png' });
  await p.evaluate(() => document.body.classList.remove('guest-display'));

  // 7. Responsive
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(800);
  log('Mobile overflowX: ' + await p.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 1));
  await p.screenshot({ path: 'browser-tests/08-mobile.png', fullPage: false });
  await p.setViewportSize({ width: 768, height: 1024 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'browser-tests/09-tablet.png' });

  log('ERRORS: ' + (errs.length ? '\n' + errs.join('\n') : 'none'));
  fs.writeFileSync('browser-tests/results.txt', out.join('\n'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
