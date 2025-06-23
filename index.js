const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const POLL_INTERVAL_MS = 60000;

const EVENTS = [
  'https://www.twickets.live/en/event/1828748486091218944',
  'https://www.twickets.live/en/event/1841424726103166976',
  // Add more URLs as needed
];

async function scrapeEvent(url) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');

  try {
    console.log(`\n[${new Date().toISOString()}] Checking: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForFunction(() => {
      const spinner = document.querySelector('.event-spinner-container');
      const spinnerVisible = spinner && window.getComputedStyle(spinner).display !== 'none';

      const hasLoaded = document.querySelector('#listings-found') || document.querySelector('#no-listings-found');
      return hasLoaded && !spinnerVisible;
    }, { timeout: 20000 });

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
      console.log(`🎟️ Ticket found for ${url}`);
      const screenshotPath = `ticket-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });

      await sendEmail(
          `🚨 Twickets: Ticket Available!`,
          `A ticket is available:\n${result.ticketSummary}\n${result.tier}\n\n${url}`,
          screenshotPath
      );
    } else {
      console.log(`⏳ No tickets at ${url}`);
    }
  } catch (err) {
    console.error(`❌ Error at ${url}:`, err.message);
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

async function scrapeAllEvents() {
  for (const url of EVENTS) {
    await scrapeEvent(url);
  }
}

// Run all on loop
scrapeAllEvents();
setInterval(scrapeAllEvents, POLL_INTERVAL_MS);
