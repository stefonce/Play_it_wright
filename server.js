/**
 * Micro-service Playwright pour n8n (déployé comme app Easypanel séparée).
 *
 * n8n appelle simplement :
 *   GET http://webscrap:3000/tervuren-afspraak
 *
 * Parcours automatisé (basé sur le flux réel du formulaire) :
 *   Stap 1 : "Verblijf in België regelen"
 *   Stap 2 : "niet-Belg"
 *   Stap 3 : "Ik ben nieuw in België..."
 *   Stap 4 : "Ik kom in België werken, studeren of bij mijn familie wonen..."
 *   Stap 5 : Aantal personen = 1 (valeur par défaut, inchangée)
 *   Stap 6 : page informative, on continue simplement
 *   Stap 7 : le champ "Dag" est pré-rempli automatiquement avec la
 *            première date disponible -> c'est ce qu'on extrait.
 *   -> on s'arrête ICI, sans jamais cliquer sur "Ga verder naar stap 8"
 *      (ça finaliserait un vrai rendez-vous).
 */

const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;

async function checkFirstAvailableDate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://tervuren.mijnafspraakmaken.be/?link=a374', {
      waitUntil: 'networkidle',
    });

    // Stap 1 - Type de rendez-vous
    await page.getByText('Verblijf in België regelen', { exact: true }).click();
    await page.getByRole('button', { name: 'Ga verder naar stap 2' }).click();

    // Stap 2 - Nationaliteit
    await page.getByText('niet-Belg', { exact: true }).click();
    await page.getByRole('button', { name: 'Ga verder naar stap 3' }).click();

    // Stap 3 - Situatie
    await page.getByText('Ik ben nieuw in België', { exact: false }).click();
    await page.getByRole('button', { name: 'Ga verder naar stap 4' }).click();

    // Stap 4 - Situatie précise
    await page.getByText('Ik kom in België werken', { exact: false }).click();
    await page.getByRole('button', { name: 'Ga verder naar stap 5' }).click();

    // Stap 5 - Activiteit(en) : Aantal personen reste à 1 (défaut)
    await page.getByRole('button', { name: 'Ga verder naar stap 6' }).click();

    // Stap 6 - Benodigdheden (informatif) : on continue simplement
    await page.getByRole('button', { name: 'Ga verder naar stap 7' }).click();

    // Stap 7 - Locatie, datum en tijd
    // Le champ "Dag" se pré-remplit après un court chargement JS.
    await page.waitForSelector(
      'text=De eerste mogelijkheid is al voor u ingesteld',
      { timeout: 20000 }
    );
    // Petite marge pour laisser le champ finir de se peupler
    await page.waitForTimeout(1000);

    // On scanne toutes les valeurs d'input et on repère celle qui a la
    // forme d'une date ("Ma, 5 oktober 2026") et celle d'une heure ("16:30").
    const allValues = await page.$$eval('input, select', (els) =>
      els.map((el) => el.value).filter(Boolean)
    );

    const dateRegex = /\d{1,2}\s+\p{L}+\s+\d{4}/u;
    const timeRegex = /^\d{1,2}:\d{2}$/;

    const firstAvailableDate = allValues.find((v) => dateRegex.test(v)) || null;
    const firstAvailableTime = allValues.find((v) => timeRegex.test(v)) || null;

    if (!firstAvailableDate) {
      // Rien trouvé : on renvoie toutes les valeurs de champs pour debug
      return { error: 'date non trouvée', debugValues: allValues };
    }

    return { firstAvailableDate, firstAvailableTime };
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
