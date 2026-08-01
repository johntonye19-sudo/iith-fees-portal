# IITH Fees Payment Portal

Official-style **fees and levies payment portal** for the **International Institute of Tourism and Hospitality (IITH), Yenagoa**, modelled on the workflow of [ndufees.com](https://www.ndufees.com/) (Niger Delta University fees portal).

**Modern · Secure-minded · Mobile-first · Production-structured**

---

## Understanding

Students and guardians need a single, trustworthy channel to:

1. Authenticate (returning) or activate (newly admitted)
2. Select fee type
3. Generate an e-invoice / payment reference
4. Pay (card / transfer)
5. Print an official receipt for clearance

This project delivers that UX with IITH branding and contacts from [iithyenagoa.edu.ng](https://iithyenagoa.edu.ng/), using **demo authentication and simulated payment** so it runs without API keys. Production wiring (Paystack/Flutterwave, real student DB, HTTPS) is documented below.

---

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│   Browser   │ ◄────────────► │  Static + JS UI  │
│  (Student)  │                │  (this project)  │
└─────────────┘                └────────┬─────────┘
                                        │
                    Production only:    ▼
                               ┌──────────────────┐
                               │  API / Bursary   │
                               │  Auth · Fees DB  │
                               └────────┬─────────┘
                                        │
                               ┌────────▼─────────┐
                               │ Paystack /       │
                               │ Flutterwave /    │
                               │ Bank RRR         │
                               └──────────────────┘
```

**Current delivery:** client-side portal (HTML/CSS/JS) with `localStorage` session + invoice history.  
**Production target:** same UI against a secured backend (Node/Nest/Laravel/etc.) + payment gateway.

---

## Project Structure

```
iith-fees-portal/
├── index.html              # Landing
├── css/styles.css          # Components, print styles
├── js/main.js              # Auth, pay flow, history (demo)
├── pages/
│   ├── login.html
│   ├── activate.html       # Newly admitted
│   ├── dashboard.html
│   ├── pay.html
│   ├── invoice.html        # E-teller
│   ├── receipt.html
│   ├── history.html
│   ├── fees-schedule.html
│   ├── how-to-pay.html
│   ├── support.html
│   ├── terms.html
│   └── privacy.html
└── README.md
```

---

## Implementation notes

### Demo login
| Matriculation | Password |
|---------------|----------|
| `IITH/ND/2024/001` | `demo1234` |
| `IITH/HND/2023/014` | `demo1234` |

Or use **Newly Admitted** → Activate with any name/email/JAMB (creates applicant session).

### Known official figures used
- ND form: **₦5,000**
- HND form: **₦7,000**
- Contacts & programmes from iithyenagoa.edu.ng
- Rector: Professor Apuega R. Arikawei

School fees / levies in the catalog are **illustrative demo amounts** (moderate polytechnic-style). Replace with the official bursary schedule before go-live.

### Flow (mirrors ndufees)
1. Login / Activate  
2. Dashboard → Pay Fees  
3. Select fee → Generate invoice (reference)  
4. Pay Now (demo) → Receipt  
5. History stores paid invoices in `localStorage`

---

## Configuration

| Item | Demo | Production |
|------|------|------------|
| Auth | Hardcoded demo users | JWT / session against student DB |
| Fees | `FEE_CATALOG` in `js/main.js` | Bursary API |
| Payment | Simulated success | Paystack or Flutterwave |
| System charge | ₦500 fixed | Configurable |
| Storage | `localStorage` | Server-side ledger |

Environment variables (when you add a backend):

```env
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
DATABASE_URL=...
SESSION_SECRET=...
CORS_ORIGIN=https://fees.iithyenagoa.edu.ng
```

---

## Dependencies

- Tailwind CSS CDN (dev/demo). For production: Tailwind CLI build + purged CSS.
- Google Fonts: Inter + Playfair Display
- No Node runtime required to **view** the demo.

---

## Testing

1. Open `index.html` or serve the folder: `python3 -m http.server 8080`
2. Login with demo matric → Pay Fees → Generate → Pay Now → Print receipt
3. Check History
4. Test Activate flow
5. Mobile menu + responsive layout
6. Print stylesheet hides chrome on invoice/receipt

Automated tests: add unit tests for fee total calculation and reference generation when moving catalog/logic to a backend.

---

## Security Review

| Area | Demo status | Production requirement |
|------|-------------|------------------------|
| Transport | Local file / HTTP | **HTTPS only** |
| Auth | Client-side check | Server-side password hash (bcrypt/argon2), rate limit, lockout |
| Session | `localStorage` | HttpOnly Secure cookie or short-lived JWT |
| CSRF | N/A (static) | Tokens on state-changing requests |
| XSS | Text escapes in templates | Keep escaping; CSP headers |
| Payment data | Never collected | PCI via gateway; no PAN storage |
| Secrets | None in repo | Env vars / secret manager |
| Fraud | — | Amount + student binding server-side; audit log |

Do **not** treat the demo password store as production-ready.

---

## Performance Considerations

- First-party assets are small
- Tailwind CDN adds cost — switch to CLI build for production
- Avoid large images; use SVG logo when official asset is available
- Cache static assets with long TTL behind CDN (Cloudflare / Netlify)

---

## Deployment

1. Unzip / clone the folder  
2. Optional: replace demo fees in `js/main.js` with official schedule  
3. Deploy static files to Netlify, Cloudflare Pages, GitHub Pages, or cPanel `public_html`  
4. Point `fees.iithyenagoa.edu.ng` (or similar) to the host and enable HTTPS  

**Production backend (recommended next step):**  
- API for login, fee list, invoice create, payment webhook, receipt  
- Integrate Paystack/Flutterwave  
- Admin panel for bursary fee updates  

---

## Future Improvements

- Real student identity (matric sync from admissions)
- Live payment gateway + webhook reconciliation
- PDF receipt generation
- SMS/email receipt delivery
- Admin dashboard for fee configuration and reports
- 2FA for high-value accounts
- Official IITH logo and crest assets

---

## Brand & source

- Institution: International Institute of Tourism and Hospitality, Yenagoa  
- Reference UX: ndufees.com (NDU fees portal patterns)  
- Content anchors: https://iithyenagoa.edu.ng/

© 2026 IITH Yenagoa — adapt under institutional ownership.

---

## Paystack integration

### Setup
1. Create account at https://dashboard.paystack.com
2. Copy **Test Public Key** (`pk_test_...`)
3. Paste into `js/config.js` → `window.IITH_PAYSTACK_PUBLIC_KEY`
4. Open an invoice and click **Pay with Paystack**

### Test card (Paystack sandbox)
- Number: `4084 0840 8408 4081`
- Expiry: any future date · CVV: `408` · PIN/OTP: `0000` / `123456`

### Production checklist
| Step | Action |
|------|--------|
| 1 | Use `pk_live_...` only on HTTPS |
| 2 | Initialize transactions on **server** with secret key |
| 3 | Verify `reference` server-side before marking paid |
| 4 | Register webhook URL for `charge.success` |
| 5 | Never expose `sk_...` in frontend or git |

If no valid key is set, the portal falls back to **Demo payment** (confirm dialog).

---

## Bursary management system

Demo console: **`pages/bursary.html`**

| Capability (demo) | Production target |
|-------------------|-------------------|
| View fee catalog | CRUD + session versioning |
| View local payment ledger | Full ledger + filters + export |
| Stats (count / sum) | Live dashboards, outstanding balances |
| — | Staff RBAC, audit log, Paystack reconciliation |

Roadmap is listed on the bursary page itself.

---

## Logo assets

| File | Use |
|------|-----|
| `assets/logo.svg` | Full mark (documents, print) |
| `assets/logo-mark.svg` | Header / favicon-sized |

These are **institutional-style placeholders** (teal + gold, tourism/hospitality motif). Replace with the official IITH crest/logo files when provided by the Institute communications unit. Keep the same filenames or update `src` paths in HTML.

---

## Quick verify after this update

1. Set a real `pk_test_...` in `js/config.js` (optional)
2. Login → Pay Fees → Generate invoice → **Pay with Paystack**
3. Open `pages/bursary.html` to see catalog + ledger
4. Confirm logo appears on home header
