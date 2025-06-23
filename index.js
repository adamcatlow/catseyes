const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const CHECK_INTERVAL = 60 * 1000; // every 1 minute
const MAX_ATTEMPTS = 3;
const URLS_TO_WATCH = [
  'https://www.twickets.live/en/event/1828748486091218944',
  'https://www.twickets.live/en/event/1841424726103166976'
];

const log = (msg) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${msg}`);
};

async function dismissCookieBanner(page) {
  try {
    await page.evaluate(() => {
      const dismissBtn = document.querySelector('[data-cookiebanner="accept-button"]');
      if (dismissBtn) dismissBtn.click();
    });
    log('✅ Cookie banner dismissed');
  } catch {
    log('ℹ️ No cookie banner found (or already dismissed)');
  }
}

async function checkPage(page, url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      log(`Checking: ${url} (attempt ${attempt})`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

      await dismissCookieBanner(page);

      // Wait for potential JS rendering (spinner, etc.)
      await page.waitForTimeout(2000);

      const pageText = await page.evaluate(() => document.body.innerText);
      const snippet = pageText.slice(0, 300).trim().replace(/\s+/g, ' ');
      console.log(`📝 Page Text Preview: ${snippet}\n`);

      if (pageText.includes('Sorry') || pageText.includes('no tickets') || pageText.includes('There are currently no tickets')) {
        return false;
      }

      if (pageText.toLowerCase().includes('ticket')) {
        return true;
      }
    } catch (err) {
      log(`❌ Error at ${url}: ${err.message}`);
    }
  }

  log(`⚠️ Timeout or unrecognised page state at ${url}`);
  return false;
}

async function sendNotification(url) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL,
      pass: process.env.ALERT_PASSWORD,
    }
  });

  await transporter.sendMail({
    from: `"Twickets Watcher" <${process.env.ALERT_EMAIL}>`,
    to: process.env.ALERT_TO,
    subject: '🎟️ Ticket Found!',
    text: `Ticket found for: ${url}`,
  });

  log(`📧 Notification sent for ${url}`);
}

async function watch() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  for (const url of URLS_TO_WATCH) {
    const hasTicket = await checkPage(page, url);
    if (hasTicket) {
      log(`🎟️ Ticket found for ${url}`);
      await sendNotification(url);
    } else {
      log(`🚫 No tickets at ${url}`);
    }
  }

  await browser.close();
}

log('✅ Twickets watcher started');
setInterval(watch, CHECK_INTERVAL);
watch();
