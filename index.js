import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const URLS_TO_WATCH = [
  'https://www.twickets.live/en/event/1828748486091218944',
  'https://www.twickets.live/en/event/1841424726103166976'
];

const CHECK_INTERVAL_MS = 60_000; // 1 minute

async function sendNotification(url) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,       // Your Gmail address
      pass: process.env.EMAIL_PASS        // App password
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: '🎟️ Twickets Ticket Available!',
    text: `A ticket is now available: ${url}`,
    html: `<p>A ticket is now available: <a href="${url}">${url}</a></p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Notification sent for ${url}`);
  } catch (error) {
    console.error(`❌ Email error at ${url}: ${error.message}`);
  }
}

async function checkForTickets(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9'
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Accept cookie banner if visible
    try {
      await page.waitForSelector('.cc-btn.cc-allow', { timeout: 4000 });
      await page.click('.cc-btn.cc-allow');
      console.log('🍪 Cookie banner accepted');
    } catch {
      console.log('ℹ️ No cookie banner found (or already dismissed)');
    }

    // Try waiting for spinner to go away
    try {
      await page.waitForSelector('.event-spinner-container[hidden]', {
        timeout: 8000
      });
    } catch {
      console.log('⚠️ Spinner may have not appeared or disappeared – continuing...');
    }

    let foundTicket = false;

    for (let i = 0; i < 3; i++) {
      console.log(`[${new Date().toISOString()}] Checking: ${url} (attempt ${i + 1})`);

      const pageText = await page.evaluate(() => document.body.innerText);
      console.log('📝 Page Text Preview:', pageText.slice(0, 300));

      const hasBuyButton = await page.$('.buy-button');
      const hasSorryMessage = await page.evaluate(() => {
        const text = document.body.innerText;
        return (
            text.includes("Sorry, we don't currently have any tickets") ||
            text.includes("no results found") ||
            text.toLowerCase().includes("please set up an alert")
        );
      });

      if (hasBuyButton) {
        console.log(`🎟️ Ticket found for ${url}`);
        await sendNotification(url);
        foundTicket = true;
        break;
      }

      if (hasSorryMessage) {
        console.log(`🚫 No tickets available yet for ${url}`);
        break;
      }

      await new Promise(res => setTimeout(res, 2000));
    }

    if (!foundTicket) {
      const html = await page.content();
      console.log(`⚠️ Timeout or unrecognised page state at ${url}`);
      if (!html.includes("buy-button") && !html.includes("Sorry")) {
        console.log("🧐 Raw HTML lacks known indicators – possible layout shift or blocking.");
      }
    }
  } catch (err) {
    console.error(`❌ Error at ${url}: ${err.message}`);
  } finally {
    await browser.close();
  }
}

async function runWatcher() {
  for (const url of URLS_TO_WATCH) {
    await checkForTickets(url);
  }
}

// Initial run
runWatcher();

// Repeat every X minutes
setInterval(runWatcher, CHECK_INTERVAL_MS);
