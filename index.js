const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const urls = [
  'https://www.twickets.live/en/event/1828748486091218944',
  'https://www.twickets.live/en/event/1841424726103166976',
];

const POLL_INTERVAL_MS = 60 * 1000; // every 1 minute
const MAX_ATTEMPTS = 3;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL,
    pass: process.env.ALERT_PASS,
  },
});

async function checkPage(browser, url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`\n[${new Date().toISOString()}] Checking: ${url} (attempt ${attempt})`);
      const page = await browser.newPage();
      await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      );

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 🟡 Handle Cookiebot banner directly in DOM (non-iframe)
      try {
        await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', {
          timeout: 5000,
        });
        await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
        console.log('✅ Cookie consent accepted');
        await page.waitForTimeout(500); // let the page settle
      } catch {
        console.log('ℹ️ Cookie banner not found or already dismissed');
      }

      // 🌀 Optional spinner wait
      try {
        await page.waitForSelector('.spinner', { timeout: 5000 });
        await page.waitForSelector('.spinner', { hidden: true, timeout: 10000 });
      } catch {
        console.warn('⚠️ Spinner did not appear or took too long – continuing...');
      }

      // 📖 Check text content
      const pageText = await page.evaluate(() => document.body.innerText);
      console.log(`📝 Page Text Preview: ${pageText.slice(0, 300)}\n`);

      if (pageText.includes("Sorry, we don't currently have any tickets")) {
        await page.close();
        return false;
      }

      const buyButton = await page.$('.buy-button.button.dark');
      if (buyButton) {
        console.log(`🎟️ Ticket found for ${url}`);
        await sendNotification(url);
        await page.close();
        return true;
      }

      await page.close();
    } catch (err) {
      console.error(`❌ Error at ${url}: ${err.message}`);
    }
  }

  console.warn(`⚠️ Timeout or unrecognised page state at ${url}`);
  return false;
}

async function sendNotification(url) {
  try {
    await transporter.sendMail({
      from: `"Ticket Watcher" <${process.env.ALERT_EMAIL}>`,
      to: process.env.ALERT_TO,
      subject: '🎟️ Ticket Available!',
      text: `A ticket is now available at: ${url}`,
    });
    console.log(`📧 Notification sent for ${url}`);
  } catch (err) {
    console.error(`❌ Email error: ${err.message}`);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: process.env.CHROME_PATH || undefined,
  });

  console.log('🚀 Ticket Watcher started');

  while (true) {
    for (const url of urls) {
      await checkPage(browser, url);
    }
    await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
  }
})();
