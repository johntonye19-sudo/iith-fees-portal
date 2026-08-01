'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Paystack secrets:
// - PAYSTACK_SECRET_KEY: used for server-side verification (Bearer)
// - PAYSTACK_WEBHOOK_SECRET: optional, used only for webhook HMAC verification.
//   If PAYSTACK_WEBHOOK_SECRET is not set, we fall back to PAYSTACK_SECRET_KEY.
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');
const MAX_LEDGER_ENTRIES = 5000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEDGER_FILE)) fs.writeFileSync(LEDGER_FILE, '[]', 'utf8');

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch (e) {
    console.error('[ledger] read error', e);
    return [];
  }
}

function writeLedger(rows) {
  try {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch (e) {
    console.error('[ledger] write error', e);
  }
}

function upsertPayment(entry) {
  const rows = readLedger();
  const i = rows.findIndex((r) => r.reference === entry.reference);
  if (i >= 0) rows[i] = { ...rows[i], ...entry, updatedAt: new Date().toISOString() };
  else rows.unshift({ ...entry, createdAt: new Date().toISOString() });
  writeLedger(rows.slice(0, MAX_LEDGER_ENTRIES));
  return entry;
}

/**
 * Webhook: needs raw body for signature verification.
 * Use express.raw for this route, then parse the JSON after verifying HMAC.
 */
app.post(
  '/api/paystack/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!WEBHOOK_SECRET) {
      console.error('[webhook] Webhook secret not configured');
      return res.status(500).send('Server misconfigured');
    }

    // Headers are lower-cased in Node/Express
    const signatureHeader = req.headers['x-paystack-signature'];
    if (!signatureHeader) {
      console.warn('[webhook] Missing x-paystack-signature header');
      return res.status(400).send('Missing signature');
    }

    const signature = String(signatureHeader).trim();

    // Ensure req.body is Buffer (express.raw) — HMAC must process the raw payload
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));

    const hash = crypto
      .createHmac('sha512', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (hash !== signature) {
      console.warn('[webhook] Invalid signature');
      return res.status(401).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(payload.toString('utf8'));
    } catch (err) {
      console.warn('[webhook] Invalid JSON payload', err);
      return res.status(400).send('Invalid JSON');
    }

    console.log('[webhook] event:', event && event.event);

    if (event && event.event === 'charge.success') {
      const data = event.data || {};
      upsertPayment({
        reference: data.reference,
        amount: data.amount,
        amountNaira: (data.amount || 0) / 100,
        currency: data.currency || 'NGN',
        status: 'success',
        paidAt: data.paid_at || new Date().toISOString(),
        channel: data.channel,
        customerEmail: data.customer && data.customer.email,
        metadata: data.metadata || {},
        source: 'webhook'
      });
    }

    // Respond 200 quickly so the gateway does not retry unnecessarily
    return res.sendStatus(200);
  }
);
