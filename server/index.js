/**
 * IITH Fees Portal — API server
 * - POST /api/paystack/verify   — verify transaction by reference (secret key)
 * - POST /api/paystack/webhook  — Paystack webhook (signature check)
 * - GET  /api/health
 * - Serves static frontend in production mode
 *
 * Security: secret key only on server; webhook HMAC verification.
 */
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
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.PAYSTACK_SECRET_KEY || ''; // same secret for signature
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEDGER_FILE)) fs.writeFileSync(LEDGER_FILE, '[]');

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLedger(rows) {
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(rows, null, 2));
}

function upsertPayment(entry) {
  const rows = readLedger();
  const i = rows.findIndex((r) => r.reference === entry.reference);
  if (i >= 0) rows[i] = { ...rows[i], ...entry, updatedAt: new Date().toISOString() };
  else rows.unshift({ ...entry, createdAt: new Date().toISOString() });
  writeLedger(rows.slice(0, 5000));
  return entry;
}

// Webhook needs raw body for signature — mount before json parser for that route
app.post(
  '/api/paystack/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!WEBHOOK_SECRET) {
      console.error('[webhook] PAYSTACK_SECRET_KEY not set');
      return res.status(500).send('Server misconfigured');
    }

    const signature = req.headers['x-paystack-signature'];
    if (!signature) return res.status(400).send('Missing signature');

    const hash = crypto
      .createHmac('sha512', WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (hash !== signature) {
      console.warn('[webhook] Invalid signature');
      return res.status(401).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log('[webhook] event:', event.event);

    if (event.event === 'charge.success') {
      const data = event.data || {};
      upsertPayment({
        reference: data.reference,
        amount: data.amount, // kobo
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

    // Always 200 so Paystack does not retry endlessly on business logic
    res.sendStatus(200);
  }
);

app.use(express.json({ limit: '100kb' }));
app.use(
  cors({
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'OPTIONS']
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'iith-fees-server',
    paystackConfigured: Boolean(PAYSTACK_SECRET && !PAYSTACK_SECRET.includes('xxxx')),
    time: new Date().toISOString()
  });
});

/**
 * Verify a Paystack transaction by reference.
 * Client should call this after Inline onSuccess before showing receipt as final.
 */
app.post('/api/paystack/verify', async (req, res) => {
  try {
    const reference = (req.body && req.body.reference) || '';
    if (!reference || typeof reference !== 'string' || reference.length > 100) {
      return res.status(400).json({ status: false, message: 'Invalid reference' });
    }

    if (!PAYSTACK_SECRET || PAYSTACK_SECRET.includes('xxxx')) {
      // Dev mode without keys: accept demo refs only
      if (reference.startsWith('IITH-')) {
        const entry = upsertPayment({
          reference,
          status: 'success',
          source: 'demo-verify',
          amountNaira: req.body.amount || null,
          metadata: req.body.metadata || {}
        });
        return res.json({
          status: true,
          message: 'Demo verification (set PAYSTACK_SECRET_KEY for live)',
          data: { reference, status: 'success', demo: true, entry }
        });
      }
      return res.status(503).json({ status: false, message: 'Paystack secret not configured' });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status) {
      return res.status(400).json({
        status: false,
        message: (result && result.message) || 'Verification failed',
        data: result
      });
    }

    const data = result.data;
    if (data.status !== 'success') {
      return res.status(400).json({
        status: false,
        message: `Transaction status: ${data.status}`,
        data
      });
    }

    upsertPayment({
      reference: data.reference,
      amount: data.amount,
      amountNaira: data.amount / 100,
      currency: data.currency,
      status: 'success',
      paidAt: data.paid_at,
      channel: data.channel,
      customerEmail: data.customer && data.customer.email,
      metadata: data.metadata || {},
      source: 'verify-api'
    });

    res.json({
      status: true,
      message: 'Payment verified',
      data: {
        reference: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        paid_at: data.paid_at,
        channel: data.channel
      }
    });
  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ status: false, message: 'Server error during verification' });
  }
});

/** Bursary: list recent verified payments (protect with auth in production) */
app.get('/api/bursary/payments', (req, res) => {
  const token = req.headers['x-bursary-token'] || req.query.token;
  const expected = process.env.BURSARY_API_TOKEN || 'dev-bursary-token';
  if (token !== expected) {
    return res.status(401).json({ status: false, message: 'Unauthorized' });
  }
  res.json({ status: true, data: readLedger().slice(0, 100) });
});

// Static frontend (optional — set SERVE_STATIC=1)
if (process.env.SERVE_STATIC === '1') {
  const root = path.join(__dirname, '..');
  app.use(express.static(root));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(root, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ status: false, message: 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`IITH Fees API listening on http://localhost:${PORT}`);
  console.log(`Paystack secret configured: ${Boolean(PAYSTACK_SECRET && !PAYSTACK_SECRET.includes('xxxx'))}`);
  console.log(`Webhook: POST /api/paystack/webhook`);
  console.log(`Verify:  POST /api/paystack/verify`);
});
