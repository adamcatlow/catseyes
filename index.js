const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

// List your Twickets event URLs here
const urlsToWatch = [
  'https://www.twickets.live/en/event/1828748486091218944'
];

// Email config (Gmail App Password required)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendEmailNotification(url) {
  const mailOptions = {
    from: `"Twickets Watcher" <${process.env.GMAIL_USER}>`,
    to: process.env.ALERT_EMAIL,
    subject: '🎟️ Ticket Found!',
    text: `Tickets available at: ${url}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent for ${url}`);
  } catch (err) {
    console.error(`❌ Email error for ${url}:`, err.message);
  }
}

async function checkForTickets(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    console.log(`[${new Date().toISOString()}] Checking: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Optional: Wait for spinner if it shows
    try {
      await page.waitForSelector('.event-spinner-container', { timeout: 3000 });
      await page.waitForSelector('.event-spinner-container[hidden]', { timeout: 8000 });
    } catch (_) {
      // Spinner might not appear or not disappear, fallback to retries
    }

    // Retry page evaluation up to 3 times
    let foundValidState = false;
    for (let i = 0; i < 3; i++) {
      const hasBuyButton = await page.$('.buy-button');
      const hasSorry = await page.evaluate(() =>
          document.body.innerText.includes("Sorry, we don't currently have any tickets")
      );

      if (hasBuyButton) {
        console.log(`🎟️ Ticket found for ${url}`);
        await sendEmailNotification(url);
        foundValidState = true;
        break;
      }

      if (hasSorry) {
        console.log(`❌ No tickets available for ${url}`);
        foundValidState = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!foundValidState) {
      console.log(`⚠️ Timeout or unrecognised page state at ${url}`);
    }
  } catch (err) {
    console.error(`❌ Error at ${url}:`, err.message);
  } finally {
    await browser.close();
  }
}

function runWatcher() {
  urlsToWatch.forEach((url) => checkForTickets(url));
}

// Run immediately and then every minute
runWatcher();
setInterval(runWatcher, 60 * 1000);
