/**
 * Micro-service Playwright pour n8n (déployé comme app Easypanel séparée).
 *
 * n8n appelle simplement :
 *   GET http://<nom-du-service-easypanel>:3000/tervuren-afspraak
 *
 * TODO principal : coller dans checkFirstAvailableDate() le code généré via
 *   npx playwright codegen https://www.tervuren.be/burgerzaken-vreemdelingen
 * pour les cases à cocher + navigation jusqu'au calendrier (voir section
 * marquée TODO ci-dessous).
 */

const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;
// Optionnel : protège l'endpoint même en réseau interne. Définis API_KEY
// dans les variables d'environnement Easypanel du service si tu veux l'activer.
const API_KEY = process.env.API_KEY || null;

async function checkFirstAvailableDate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.tervuren.be/burgerzaken-vreemdelingen', {
      waitUntil: 'networkidle',
    });

    const cookieBtn = page.getByText('Alles aanvaarden', { exact: false });
    if (await cookieBtn.isVisible().catch(() => false)) {
      await cookieBtn.click();
    }

    await page.getByText('Maak een afspraak', { exact: false }).click();
    await page.waitForLoadState('networkidle');

    // ---------- TODO : cases à cocher + navigation vers le calendrier ----------
    // Colle ici le code capturé par `npx playwright codegen`, ex. :
    // await page.getByLabel('Vreemdelingenzaken').check();
    // await page.getByRole('button', { name: 'Volgende' }).click();

    // ---------- Extraction de la première date disponible ----------
    // À ajuster une fois le vrai HTML du calendrier inspecté (clic droit ->
    // Inspecter dans le navigateur ouvert par codegen).
    const firstAvailable = page
      .locator(
        '[class*="available"]:not([class*="disabled"]), button:not([disabled])[class*="day"]'
      )
      .first();

    await firstAvailable.waitFor({ state: 'visible', timeout: 15000 });
    const firstAvailableDate =
      (await firstAvailable.getAttribute('aria-label')) ||
      (await firstAvailable.textContent());

    return { firstAvailableDate: firstAvailableDate?.trim() };
  } finally {
    await browser.close();
  }
}

app.get('/tervuren-afspraak', async (req, res) => {
  if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await checkFirstAvailableDate();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Scraper service listening on port ${PORT}`);
});
