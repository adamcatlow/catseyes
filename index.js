const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const fs = require('fs');

const URL = 'https://www.twickets.live/en/event/1828748486091218944';
const POLL_INTERVAL_MS = 60000;

async function scrape() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Checking for tickets...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');

  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#listings-found, #no-listings-found', { timeout: 15000 });

    const result = await page.evaluate(() => {
      const noListings = document.querySelector('#no-listings-found');
      const noListingsVisible = noListings && window.getComputedStyle(noListings).display !== 'none';

      const buyButton = document.querySelector('a.buy-button.button.dark');
      const ticketSummary = document.querySelector('.no-of-ticket-summary')?.innerText || 'Ticket found';
      const tier = document.querySelector('.tier-name')?.innerText || 'Unknown tier';

      return {
        hasTickets: !noListingsVisible && !!buyButton,
        ticketSummary,
        tier
      };
    });

    if (result.hasTickets) {
      console.log('🎟️ Ticket detected — sending alert...');
      const screenshotPath = 'ticket-alert.png';
      await page.screenshot({ path: screenshotPath });

      await sendEmail(
        '🚨 Twickets: Ticket Available!',
        `A ticket listing is now available.

${result.ticketSummary}
${result.tier}

Link: ${URL}`,
        screenshotPath
      );
    } else {
      console.log('⏳ No tickets available.');
    }
  } catch (err) {
    console.error('❌ Error during scrape:', err.message);
  }

  await browser.close();
}

async function sendEmail(subject, text, screenshotPath) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });

  const mailOptions = {
    from: `"Twickets Watcher" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject,
    text,
    attachments: [{
      filename: 'ticket-alert.png',
      path: screenshotPath
    }]
  };

  await transporter.sendMail(mailOptions);
}

// Start polling
scrape();
setInterval(scrape, POLL_INTERVAL_MS);
