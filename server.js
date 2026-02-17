import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL_TO = process.env.ADMIN_EMAIL_TO;

if (!SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL_TO) {
  console.log('Missing ENV. Check .env: SMTP_USER, SMTP_PASS, ADMIN_EMAIL_TO');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    console.log('Telegram failed:', t);
    return false;
  }
  return true;
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ✅ ЗАКАЗ (корзина)
app.post('/api/order', async (req, res) => {
  try {
    console.log('POST /api/order');

    const payload = req.body || {};
    if (!payload.customer?.fullName || !payload.customer?.phone || !payload.items?.length) {
      return res.status(400).json({ ok: false, error: 'Bad payload' });
    }

    const text =
      `НОВЫЙ ЗАКАЗ BloomSkin\n` +
      `Номер: ${payload.orderId}\n` +
      `Сумма: ${payload.total} ₸\n\n` +
      `Клиент: ${payload.customer.fullName}\n` +
      `Телефон: ${payload.customer.phone}\n` +
      `Email: ${payload.customer.email || '-'}\n` +
      `Адрес: ${payload.customer.address || '-'}\n` +
      `Комментарий: ${payload.customer.comment || '-'}\n\n` +
      `Товары:\n` +
      payload.items.map(i => `- ${i.name} x${i.qty} = ${i.price * i.qty} ₸`).join('\n');

    let mailSent = false;
    try {
      await transporter.sendMail({
        from: `"BloomSkin" <${SMTP_USER}>`,
        to: ADMIN_EMAIL_TO,
        subject: `Новый заказ BloomSkin — ${payload.orderId}`,
        text
      });
      mailSent = true;
    } catch (e) {
      console.log('MAIL FAILED:', e.message);
    }

    const tgSent = await sendTelegram(text).catch(() => false);

    res.json({ ok: true, mailSent, telegramSent: tgSent });
  } catch (e) {
    console.log(e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ✅ ОБРАТНАЯ СВЯЗЬ
app.post('/api/contact', async (req, res) => {
  try {
    console.log('POST /api/contact');

    const { fullName, email, message } = req.body || {};

    if (!fullName || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Missing fields' });
    }

    const text =
      `ОБРАТНАЯ СВЯЗЬ BloomSkin\n` +
      `Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `Имя: ${String(fullName).trim()}\n` +
      `Email: ${String(email).trim()}\n\n` +
      `Сообщение:\n${String(message).trim()}\n`;

    // отправка письма
    await transporter.sendMail({
      from: `"BloomSkin Contact" <${SMTP_USER}>`,
      to: ADMIN_EMAIL_TO,
      subject: `Обратная связь BloomSkin — ${String(fullName).trim()}`,
      text
    });

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});