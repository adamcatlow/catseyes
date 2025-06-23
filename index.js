const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const fs = require('fs');

const URL = 'https://www.twickets.live/en/event/1828748486091218944';
const LOG_FILE = 'watcher-log.txt';
const POLL_INTERVAL_MS = 60000; // 1 minute

async function scrape() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running ticket check...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');

  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#listings-found, #no-listings-found', { timeout: 15000 });

    const { hasTickets, buyUrl } = await page.evaluate(() => {
      const noListings = document.querySelector('#no-listings-found');
      const noListingsVisible = noListings && window.getComputedStyle(noListings).display !== 'none';

      const buyButton = document.querySelector('a.buy-button.button.dark');
      const buyLink = buyButton ? buyButton.href || null : null;

      return {
        hasTickets: !noListingsVisible && !!buyButton,
        buyUrl: buyLink
      };
    });

    if (hasTickets) {
      console.log('🎟️ Tickets found! Clicking Buy...');
      await page.click('a.buy-button.button.dark');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'added-to-cart.png' });

      await sendEmail(
        '🚨 Tickets Found and Buy Clicked',
        `A "Buy" button was clicked.
Link: ${buyUrl || 'N/A'}`
      );
    } else {
      console.log('⏳ No tickets available.');
    }
  } catch (err) {
    console.error('❌ Error in watcher:', err.message);
    await sendEmail('❌ Watcher Error', err.message);
  }

  await browser.close();
}

async function sendEmail(subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Twickets Watcher" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject,
    text,
  });
}

// Run once immediately, then every minute
scrape();
setInterval(scrape, POLL_INTERVAL_MS);
