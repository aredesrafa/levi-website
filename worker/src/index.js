const ALLOWED_ORIGINS = [
  'https://levirecorder.app',
  'https://www.levirecorder.app',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const TEAM_EMAIL = 'team@levirecorder.app';
const FROM = 'Levi Recorder <team@levirecorder.app>';

// A message with more links than this is spam in practice; the legitimate
// contact form is used for bug reports and questions, not link sharing.
const MAX_LINKS_IN_MESSAGE = 3;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ success: false, message: 'Method not allowed' }, 405, cors);
    }

    // Rate limit before reading the body so a flood costs as little as possible.
    if (env.CONTACT_RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success: withinLimit } = await env.CONTACT_RATE_LIMITER.limit({ key: ip });
      if (!withinLimit) {
        console.log('Rate limited:', ip);
        return json({ success: false, message: 'Too many messages. Please try again in a minute.' }, 429, cors);
      }
    }

    let body;
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        const formData = await request.formData();
        body = Object.fromEntries(formData);
      }
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400, cors);
    }

    if (body.botcheck) {
      return json({ success: true }, 200, cors);
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const message = String(body.message || '').trim();
    const type = String(body.type || 'contact').trim();

    if (!name || !email || !message) {
      return json({ success: false, message: 'Please fill in all fields.' }, 400, cors);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: 'Please provide a valid email.' }, 400, cors);
    }
    if (name.length > 200 || message.length > 5000) {
      return json({ success: false, message: 'Input too long.' }, 400, cors);
    }

    // Report success on spam instead of an error: a bot that sees a rejection
    // starts probing for the rule that stopped it. Dropping here also stops the
    // confirmation email, so we never mail an address a spammer chose for us.
    if (isBlockedSender(email, env.BLOCKED_SENDERS)) {
      console.log('Dropped blocked sender:', email);
      return json({ success: true }, 200, cors);
    }

    if (countLinks(message) > MAX_LINKS_IN_MESSAGE) {
      console.log('Dropped link-heavy message from:', email);
      return json({ success: true }, 200, cors);
    }

    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

    const notify = sendEmail(env.RESEND_API_KEY, {
      from: FROM,
      to: [TEAM_EMAIL],
      reply_to: email,
      subject: `[${typeLabel}] New message from ${name}`,
      text:
        `New ${type} message from the Levi Recorder website:\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Type: ${type}\n\n` +
        `Message:\n${message}\n`,
    });

    const confirm = sendEmail(env.RESEND_API_KEY, {
      from: FROM,
      to: [email],
      subject: 'We received your message — Levi Recorder',
      text:
        `Hi ${name},\n\n` +
        `Thanks for reaching out — we received your message and will get back to you as soon as we can.\n\n` +
        `— The Levi Recorder team`,
    });

    const [notifyRes, confirmRes] = await Promise.allSettled([notify, confirm]);

    const notifyOk = notifyRes.status === 'fulfilled' && notifyRes.value.ok;
    if (!notifyOk) {
      const detail = notifyRes.status === 'fulfilled' ? await safeText(notifyRes.value) : String(notifyRes.reason);
      console.error('Resend notify failed:', detail);
      return json({ success: false, message: 'Could not send your message. Please try again.' }, 502, cors);
    }

    if (confirmRes.status !== 'fulfilled' || !confirmRes.value.ok) {
      const detail = confirmRes.status === 'fulfilled' ? await safeText(confirmRes.value) : String(confirmRes.reason);
      console.error('Resend confirmation failed:', detail);
    }

    return json({ success: true }, 200, cors);
  },
};

// BLOCKED_SENDERS is a comma-separated list of full addresses ("bot@spam.com")
// and bare domains ("spam.com"), so blocking a new spammer is a var edit plus a
// redeploy rather than a code change.
function isBlockedSender(email, blockedSenders) {
  if (!blockedSenders) return false;

  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);

  return blockedSenders
    .split(',')
    .map(entry => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
    .some(entry => entry === normalized || entry === domain);
}

// Lowercase and drop plus-addressing, so one blocklist entry also covers the
// "same address +tag" trick.
function normalizeEmail(email) {
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at === -1) return lower;
  return `${lower.slice(0, at).split('+')[0]}@${lower.slice(at + 1)}`;
}

function countLinks(message) {
  return (message.match(/https?:\/\/|www\./gi) || []).length;
}

function sendEmail(apiKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return '<unreadable>'; }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
