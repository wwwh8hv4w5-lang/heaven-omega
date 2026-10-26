// Heaven Omega — tests automatiques du système de sauvegarde (Playwright, Chromium).
// Chaque test démarre dans un profil de navigateur neuf (stockage vide).
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PAGE = process.env.PAGE || 'index.html';
const SLOTS = ['s1', 's2', 's3'];

async function boot(page, opts = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(o => {
    window.__HO_DEBUG = { fast: true };
    if (o.noStorage) { // navigation privée stricte / cadre isolé : aucun stockage
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
      Object.defineProperty(window, 'indexedDB', { get() { return undefined; } });
    }
    if (o.quota) { // stockage plein
      const set = Storage.prototype.setItem; // les petites clés passent, les sauvegardes dépassent le quota
      Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('heavenOmega_slot_')) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
      Object.defineProperty(window, 'indexedDB', { get() { return undefined; } });
    }
  }, opts);
  await page.goto(PAGE);
  await page.waitForSelector('#titre [data-a=tSaves]', { state: 'attached' });
  page.__errors = errors;
  return errors;
}
// Après rechargement : le gestionnaire d'erreurs reste attaché à la page.
async function reload(page) {
  await page.reload();
  await page.waitForSelector('#titre [data-a=tSaves]', { state: 'attached' });
}
const gs = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__ho.gs())));
const clickAct = (page, a, v) => page.evaluate(([a, v]) => {
  const el = [...document.querySelectorAll('[data-a="' + a + '"]')].find(e => v == null || e.dataset.v === v);
  if (!el) throw new Error('bouton introuvable : ' + a + ' ' + v); el.click();
}, [a, v]);

// Nouvelle partie puis arrivée sur la carte (équivaut à la fin de la 1re mission ; combats sautés pour la rapidité).
async function newGameOnMap(page) {
  await page.evaluate(() => { newGame(); unlockFor(0); showWorld(); }); // comme startNew()
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
}
// Progression : écus, objets, niveaux, équipement, recrue, histoire, drapeaux, quêtes de zone, position.
async function progress(page, seed) {
  await page.evaluate(seed => {
    window.__ho.set(G => {
      G.gil = 1000 + seed * 37; G.story = 1 + (seed % 3); G.clan = 'Clan' + seed;
      G.inv.potion = 3 + seed; G.inv.epee2 = 1; G.done['s' + seed] = 1; G.vu['flag' + seed] = 1;
      G.party[0].lvl = 2 + seed; G.party[0].exp = 40 + seed; G.party[0].mast.coup = 1; G.party[1].ap.coup = 5 * seed;
      G.zq.done['pres1'] = 1; G.nodes.push('foret'); G.accepted = null;
    });
    const G = window.__ho.gs(); recruit('mira', 3);
  }, seed);
  await page.evaluate(() => travel('pres')); // déplacement sur la carte (non sauvegardé par le jeu d'origine)
  return gs(page);
}
// Retour à l'écran-titre (plus de sauvegarde auto à la fermeture) avant de modifier le stockage à la main.
async function toTitle(page) { await page.evaluate(() => { hideScr(); hideWorldUI(); showTitle(); }); }
const strip = g => { const c = JSON.parse(JSON.stringify(g)); delete c.v; return c; };

test.afterEach(async ({ page }) => { expect(page.__errors || [], 'erreurs JavaScript').toEqual([]); });

test('pas de bouton Continuer sans sauvegarde, présent après', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#titre [data-a=tCont]')).toHaveCount(0);
  await newGameOnMap(page);
  await reload(page);
  await expect(page.locator('#titre [data-a=tCont]')).toHaveCount(1);
  await expect(page.locator('#titre .etat')).toContainText('Sauvegarde locale active');
});

test('sauvegarde automatique : retour sur la carte → rechargement → Continuer = état identique', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  await progress(page, 1);
  await page.evaluate(() => showWorld()); // retour sur la carte = sauvegarde auto
  const before = await gs(page);
  await reload(page);
  await clickAct(page, 'tCont');
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  expect(strip(await gs(page))).toEqual(strip(before));
  // écrite en double : localStorage et IndexedDB
  const both = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('heavenOmega', 1); r.onsuccess = () => {
    const q = r.result.transaction('saves').objectStore('saves').get('auto'); q.onsuccess = () => res({ idb: q.result && q.result.data.gil, ls: JSON.parse(localStorage.getItem('heavenOmega_slot_auto')).data.gil }); }; }));
  expect(both.idb).toBe(before.gil); expect(both.ls).toBe(before.gil);
});

test('3 emplacements manuels : chacun survit au rechargement sans écraser les autres', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  const states = {};
  for (const [i, s] of SLOTS.entries()) {
    states[s] = await progress(page, i + 2);
    await clickAct(page, 'wSave');
    await clickAct(page, 'svSave', s);
    await expect(page.locator('#toast')).toContainText('partie sauvegardée');
    await clickAct(page, 'svX');
    await page.evaluate(() => travel('cyr'));
  }
  await reload(page);
  await page.screenshot({ path: test.info().outputPath('titre.png') });
  for (const s of SLOTS) {
    await clickAct(page, 'tSaves');
    await expect(page.locator('#scr')).toContainText('Clan' + (SLOTS.indexOf(s) + 2));
    await clickAct(page, 'svLoad', s);
    await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
    expect(strip(await gs(page)), 'emplacement ' + s).toEqual(strip(states[s]));
    await clickAct(page, 'wMenu'); await clickAct(page, 'wTitre');
    await reload(page);
  }
});

test('fermeture / arrière-plan : la position et les achats sur la carte sont gardés', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  await page.evaluate(() => { travel('pres'); window.__ho.set(G => { G.gil = 777; G.inv.potion = 9; }); });
  await page.waitForFunction(() => window.__ho.gs().node === 'pres');
  // onglet masqué (mobile)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('heavenOmega_slot_auto')).data.node)).toBe('pres');
  await page.evaluate(() => { delete document.hidden; });
  // fermeture / rechargement (pagehide)
  await page.evaluate(() => window.__ho.set(G => { G.gil = 888; }));
  await reload(page);
  await clickAct(page, 'tCont');
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  const g = await gs(page);
  expect(g.node).toBe('pres'); expect(g.gil).toBe(888); expect(g.inv.potion).toBe(9);
});

test('pas de sauvegarde automatique pendant une scène ou un combat', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  await page.evaluate(() => window.__ho.set(G => { G.gil = 50; }));
  await page.evaluate(() => showWorld());
  await page.evaluate(() => { setScene(stageScene); window.__ho.set(G => { G.gil = 99999; }); });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('heavenOmega_slot_auto')).data.gil)).toBe(50);
});

test('sauvegarde abîmée : ignorée avec message, les autres restent chargeables', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  const st = await progress(page, 5);
  await clickAct(page, 'wSave'); await clickAct(page, 'svSave', 's2');
  await toTitle(page);
  await page.evaluate(() => {
    localStorage.setItem('heavenOmega_slot_s1', '{"t":1,"data":{"party":[{"id":"x"'); // JSON tronqué
    localStorage.setItem('heavenOmega_slot_s3', JSON.stringify({ t: Date.now() + 1e7, data: { party: [{ id: 'z', job: 'inconnu' }] } })); // données invalides
  });
  await reload(page);
  await expect(page.locator('#toast')).toContainText('illisible ignorée', { timeout: 5000 });
  await clickAct(page, 'tSaves');
  const rows = page.locator('#scr .li');
  await expect(rows.nth(1)).toContainText('Vide'); await expect(rows.nth(3)).toContainText('Vide');
  await clickAct(page, 'svX');
  await clickAct(page, 'tCont'); // la plus récente lisible
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  expect(strip(await gs(page))).toEqual(strip(st));
});

test('localStorage abîmé mais copie IndexedDB intacte : la copie est utilisée', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  await page.evaluate(() => { window.__ho.set(G => { G.gil = 4242; }); showWorld(); });
  await page.waitForTimeout(300);
  await toTitle(page);
  await page.evaluate(() => localStorage.setItem('heavenOmega_slot_auto', 'pas du json'));
  await reload(page);
  await clickAct(page, 'tCont');
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  expect((await gs(page)).gil).toBe(4242);
});

test('ancienne sauvegarde (clé v1, champs manquants) : migrée et jouable', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.setItem('heavenOmega_save_v1', JSON.stringify({
    v: '1.0', clan: 'Ancien', gil: 321, story: 2, node: 'cyr', inv: { potion: 2, objet_disparu: 4 },
    party: [{ id: 'elio', ch: 'elio', name: 'Elio', race: 'hum', job: 'sol', lvl: 4, exp: 10, eq: { w: 'epee1', a: 'arm1' }, mast: {} },
            { id: 'u7', name: 'Recrue', job: 'arc', lvl: 2, eq: {} }] })));
  await reload(page);
  await expect(page.locator('#titre [data-a=tCont]')).toHaveCount(1);
  await clickAct(page, 'tCont');
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  const g = await gs(page);
  expect(g.clan).toBe('Ancien'); expect(g.gil).toBe(321); expect(g.party[0].lvl).toBe(4);
  expect(g.inv).toEqual({ potion: 2 });
  expect(g.zq).toEqual({ done: {}, tres: {}, enc: {}, ann: {} });
  expect(g.nodes).toEqual([]); expect(g.uid).toBe(8); expect(g.party[1].eq).toEqual({ w: null, a: null, c: null });
  // la sauvegarde ré-écrite porte le champ de format
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('heavenOmega_slot_auto')).fmt)).toBe(2);
});

test('sauvegarde d\'une version plus récente : chargée avec avertissement', async ({ page }) => {
  await boot(page);
  await newGameOnMap(page);
  await toTitle(page);
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('heavenOmega_slot_auto')); r.fmt = 99; localStorage.setItem('heavenOmega_slot_auto', JSON.stringify(r)); indexedDB.deleteDatabase('heavenOmega'); });
  await reload(page);
  await clickAct(page, 'tCont');
  await expect(page.locator('#toast')).toContainText('version plus récente', { timeout: 5000 });
});

test('stockage plein : message visible, la partie continue', async ({ page }) => {
  await boot(page, { quota: true });
  await newGameOnMap(page);
  await clickAct(page, 'wSave'); await clickAct(page, 'svSave', 's1');
  await expect(page.locator('#toast')).toContainText(/Stockage plein/);
});

test('aucun stockage (navigation privée stricte) : avertissement et export proposé, sans erreur', async ({ page }) => {
  await boot(page, { noStorage: true });
  await expect(page.locator('#titre .etat')).toContainText('ne garde pas les données');
  await newGameOnMap(page);
  await expect(page.locator('#toast')).toContainText('exportez', { timeout: 5000 });
  await clickAct(page, 'wSave');
  await expect(page.locator('#scr')).toContainText('Exporter la partie en cours');
});

test('export puis import d\'un fichier .json : état identique', async ({ page: first }) => {
  let page = first;
  await boot(page);
  await newGameOnMap(page);
  const st = await progress(page, 4);
  await clickAct(page, 'wSave');
  const [dl] = await Promise.all([page.waitForEvent('download'), clickAct(page, 'svExpCur')]);
  const file = test.info().outputPath('export.json'); await dl.saveAs(file);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).data.gil).toBe(st.gil);
  // nouveau navigateur (profil vierge) pour l'import
  const page2 = await page.context().browser().newPage(); page2.__errors = []; page2.on('pageerror', e => page2.__errors.push(e.message));
  await page2.addInitScript(() => { window.__HO_DEBUG = { fast: true }; });
  await page2.goto(new URL(PAGE, test.info().project.use.baseURL).href); await page2.waitForSelector('#titre [data-a=tSaves]', { state: 'attached' });
  page = page2;
  await expect(page.locator('#titre [data-a=tCont]')).toHaveCount(0);
  await clickAct(page, 'tSaves');
  await page.setInputFiles('#svFile', file);
  await page.waitForSelector('[data-a=svImpOk]');
  await clickAct(page, 'svImpOk');
  await expect(page.locator('#mondeBar [data-a=wSave]')).toBeVisible();
  expect(strip(await gs(page))).toEqual(strip(st));
  expect(page.__errors).toEqual([]); await page.close();
});

test('réglages (son, vitesse) gardés après rechargement', async ({ page }) => {
  await boot(page);
  await clickAct(page, 'son');
  await page.evaluate(() => ACT.vit());
  await reload(page);
  await expect(page.locator('#titre [data-a=son]')).toContainText('coupé');
  expect(await page.evaluate(() => VITESSE)).toBe(2);
});

test('vraie nouvelle partie (bouton) : pas de sauvegarde pendant le prologue, aucune erreur', async ({ page }) => {
  await boot(page);
  await clickAct(page, 'tNew');
  await page.waitForFunction(() => !!window.__ho.gs());
  await page.waitForTimeout(500);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => localStorage.getItem('heavenOmega_slot_auto'))).toBeNull();
});
