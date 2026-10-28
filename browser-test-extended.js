const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE:' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('401')) errs.push('CONS:' + m.text().slice(0, 200)); });
  const log = (...a) => console.log(...a);
  await p.goto('http://127.0.0.1:8000/', { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  // A. Sidebar nav -> expected destinations
  const navExpect = { settings: 'managerModal', inventory: 'managerModal', orders: 'managerModal', reports: 'managerModal', kitchen: 'managerModal' };
  for (const nav of ['settings', 'inventory', 'orders', 'reports', 'kitchen']) {
    await p.locator(`.sidebar .nav[data-nav="${nav}"]`).click({ force: true }); await p.waitForTimeout(500);
    const vis = await p.locator('#managerModal').isVisible();
    const activeTab = await p.locator('#managerModal .manager-tabs .tab.active').innerText().catch(() => '?');
    log(`NAV ${nav}: modal=${vis} tab=${activeTab}`);
    await p.locator('#managerClose').click(); await p.waitForTimeout(300);
  }
  await p.locator('.sidebar .nav[data-nav="guests"]').click({ force: true }); await p.waitForTimeout(300);
  log('NAV guests: serviceSelectFocused=' + await p.evaluate(() => document.activeElement && document.activeElement.id));
  await p.locator('.sidebar .nav[data-nav="help"]').click({ force: true }); await p.waitForTimeout(300);
  log('NAV help toast: ' + await p.locator('#toast').innerText().catch(() => '?'));

  // B. Manager tabs walk
  await p.locator('#managerOpen').click({ force: true }); await p.waitForTimeout(500);
  for (const tab of ['products', 'features', 'orders', 'inventory', 'kitchen', 'analytics', 'loyalty']) {
    await p.locator(`[data-manage-tab="${tab}"]`).click(); await p.waitForTimeout(600);
    const panel = await p.evaluate(() => { const secs = [...document.querySelectorAll('#managerModal section')].filter(s => !s.hidden); return secs.map(s => s.id).join(','); });
    log(`TAB ${tab}: visible=[${panel}]`);
  }
  await p.screenshot({ path: 'browser-tests/30-loyalty-tab.png' });
  await p.locator('[data-manage-tab="inventory"]').click(); await p.waitForTimeout(400);
  await p.screenshot({ path: 'browser-tests/31-stock-tab.png' });
  await p.locator('#managerClose').click();

  // C. Search + category tabs
  await p.locator('#search').fill('samosa'); await p.waitForTimeout(600);
  log('SEARCH samosa items: ' + await p.locator('#menu .item').count());
  await p.locator('#search').fill(''); await p.waitForTimeout(400);
  await p.locator('[data-cat="Snacks"]').click(); await p.waitForTimeout(600);
  log('TAB snacks items: ' + await p.locator('#menu .item').count());
  await p.locator('[data-cat="All"]').click(); await p.waitForTimeout(400);

  // D. Loyalty member attach
  const loBox = await p.locator('#loyaltyBox').innerText();
  log('LOYALTY box: ' + loBox.slice(0, 160).replace(/\n/g, ' | '));
  await p.locator('#loyaltyBox button').first().click(); await p.waitForTimeout(500);
  log('LOYALTY expanded: ' + (await p.locator('#loyaltyBox').innerText()).slice(0, 200).replace(/\n/g, ' | '));
  const nameIn = p.locator('#customerNameInput'), phoneIn = p.locator('#customerPhoneInput');
  if (await nameIn.count() && await phoneIn.count()) {
    await nameIn.fill('Test Guest'); await phoneIn.fill('0712345678'); await p.waitForTimeout(800);
    log('LOYALTY after fill: ' + (await p.locator('#loyaltyBox').innerText()).slice(0, 200).replace(/\n/g, ' | '));
  } else log('LOYALTY inputs missing!');

  // E. Full lifecycle: add -> pay -> receipt -> history -> kitchen
  await p.locator('#menu .item button').nth(0).click({ force: true });
  await p.locator('#menu .item button').nth(5).click({ force: true });
  await p.waitForTimeout(400);
  await p.locator('#pay').click(); await p.waitForTimeout(500);
  await p.locator('#confirm').click(); await p.waitForTimeout(1200);
  log('RECEIPT visible: ' + await p.locator('#receiptModal').isVisible());
  log('RECEIPT text: ' + (await p.locator('#receiptPaper').innerText()).replace(/\n/g, ' | ').slice(0, 400));
  await p.screenshot({ path: 'browser-tests/32-receipt.png' });
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: 'browser-tests/33-receipt-print.png' });
  await p.emulateMedia({ media: 'screen' });
  await p.locator('#receiptClose').click(); await p.waitForTimeout(400);
  log('RECEIPT closed: ' + !(await p.locator('#receiptModal').isVisible()));
  // order history
  await p.locator('#managerOpen').click({ force: true }); await p.waitForTimeout(400);
  await p.locator('[data-manage-tab="orders"]').click(); await p.waitForTimeout(500);
  log('HISTORY: ' + (await p.locator('#ordersPanel').innerText()).slice(0, 200).replace(/\n/g, ' | '));
  // kitchen transitions
  await p.locator('[data-manage-tab="kitchen"]').click(); await p.waitForTimeout(500);
  const kBtns = await p.locator('#kitchenPanel button').evaluateAll(es => es.map(e => e.textContent.trim()).slice(0, 8));
  log('KITCHEN buttons: ' + JSON.stringify(kBtns));
  await p.screenshot({ path: 'browser-tests/34-kitchen.png' });
  for (let i = 0; i < 3; i++) {
    const adv = p.locator('#kitchenPanel button').filter({ hasText: /preparing|ready|serv|adv|next|done/i }).first();
    if (await adv.count()) { await adv.click(); await p.waitForTimeout(600); log('KITCHEN advance ' + (i + 1) + ' clicked'); }
    else break;
  }
  log('KITCHEN after: ' + (await p.locator('#kitchenPanel').innerText()).slice(0, 220).replace(/\n/g, ' | '));
  await p.locator('#managerClose').click();

  // F. Holiday gallery
  await p.locator('#holidayGalleryOpen').click({ force: true }); await p.waitForTimeout(800);
  const gal = await p.evaluate(() => [...document.querySelectorAll('.modal-bg')].filter(m => m.style.display === 'grid' || m.offsetParent !== null).map(m => m.id).join(','));
  log('GALLERY open modals: ' + gal);
  await p.screenshot({ path: 'browser-tests/35-holiday-gallery.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // G. Appearance + theme sanity (in-memory)
  await p.evaluate(() => applyAppearanceMode('dark')); await p.waitForTimeout(300);
  await p.evaluate(() => { document.body.dataset.theme = 'ocean'; applyThemeDecor && applyThemeDecor('ocean'); }); await p.waitForTimeout(300);
  await p.screenshot({ path: 'browser-tests/36-theme-ocean-dark.png' });
  await p.evaluate(() => { applyAppearanceMode('bright'); document.body.dataset.theme = 'orange'; applyThemeDecor && applyThemeDecor('orange'); });

  log('ERRORS: ' + (errs.length ? '\n' + errs.join('\n') : 'none'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
