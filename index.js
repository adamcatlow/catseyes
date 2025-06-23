const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");

const urlsToWatch = [
  "https://www.twickets.live/en/event/1828748486091218944",
  "https://www.twickets.live/en/event/1841424726103166976"
];

const EMAIL_TO = process.env.EMAIL_TO;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_PASS = process.env.EMAIL_PASS;

async function sendNotification(url) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_FROM,
      pass: EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: `"Twickets Watcher" <${EMAIL_FROM}>`,
    to: EMAIL_TO,
    subject: "🎟️ Ticket Alert on Twickets!",
    text: `A ticket is now available: ${url}`,
    html: `<p>A ticket is now available: <a href="${url}">${url}</a></p>`
  });
}

async function checkForTickets(url) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for spinner to hide (up to 8s)
    try {
      await page.waitForSelector(".event-spinner-container[hidden]", {
        timeout: 8000
      });
    } catch (e) {
      console.log("⚠️ Spinner may have not appeared or disappeared – continuing...");
    }

    let foundTicket = false;
    for (let i = 0; i < 3; i++) {
      console.log(`[${new Date().toISOString()}] Checking: ${url} (attempt ${i + 1})`);

      const pageText = await page.evaluate(() => document.body.innerText);
      console.log("📝 Page Text Preview:", pageText.slice(0, 300));

      const hasBuyButton = await page.$(".buy-button");

      const hasSorryMessage = await page.evaluate(() => {
        const noTicketsText =
            document.querySelector(".no-tickets-message")?.innerText ||
            document.body.innerText;

        return (
            noTicketsText.includes("Sorry, we don't currently have any tickets") ||
            noTicketsText.includes("no results found") ||
            noTicketsText.toLowerCase().includes("please set up an alert")
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

      // Wait 2s before retrying
      await page.waitForTimeout(2000);
    }

    if (!foundTicket) {
      console.log(`⚠️ Timeout or unrecognised page state at ${url}`);
    }
  } catch (error) {
    console.error(`❌ Error at ${url}: ${error.message}`);
  } finally {
    await browser.close();
  }
}

async function runWatcher() {
  for (const url of urlsToWatch) {
    await checkForTickets(url);
  }
}

// Run every 1 minute
runWatcher();
setInterval(runWatcher, 60 * 1000);
