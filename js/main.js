/**
 * IITH Fees Portal — client logic
 * Demo mode: localStorage session. Replace with real API in production.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'iith_fees_session';
  const HISTORY_KEY = 'iith_fees_history';

  // ---------- Demo data (replace with API) ----------
  const DEMO_STUDENTS = {
    'IITH/ND/2024/001': {
      password: 'demo1234',
      name: 'Adaobi Okoro',
      programme: 'Tourism Management Technology',
      level: 'ND II',
      school: 'SSMTT',
      email: 'adaobi.demo@example.com',
      phone: '08030000001',
      session: '2025/2026'
    },
    'IITH/HND/2023/014': {
      password: 'demo1234',
      name: 'Chinedu Bassey',
      programme: 'Hospitality Management Technology',
      level: 'HND I',
      school: 'SSMTT',
      email: 'chinedu.demo@example.com',
      phone: '08030000002',
      session: '2025/2026'
    }
  };

  const FEE_CATALOG = [
    { id: 'school_fees_nd', label: 'School Fees (ND)', amount: 85000, category: 'School Fees', levels: ['ND I', 'ND II'] },
    { id: 'school_fees_hnd', label: 'School Fees (HND)', amount: 95000, category: 'School Fees', levels: ['HND I', 'HND II'] },
    { id: 'acceptance', label: 'Acceptance Fee', amount: 25000, category: 'Admission', levels: ['ND I', 'HND I'] },
    { id: 'form_nd', label: 'Admission Form (ND)', amount: 5000, category: 'Admission', levels: ['Applicant'] },
    { id: 'form_hnd', label: 'Admission Form (HND)', amount: 7000, category: 'Admission', levels: ['Applicant'] },
    { id: 'ict', label: 'ICT Levy', amount: 10000, category: 'Levy', levels: ['ND I', 'ND II', 'HND I', 'HND II'] },
    { id: 'medical', label: 'Medical Levy', amount: 8000, category: 'Levy', levels: ['ND I', 'ND II', 'HND I', 'HND II'] },
    { id: 'id_card', label: 'ID Card', amount: 3000, category: 'Levy', levels: ['ND I', 'HND I'] },
    { id: 'cves_cert', label: 'CVES Certificate Programme', amount: 45000, category: 'CVES', levels: ['CVES'] }
  ];

  const SYSTEM_CHARGE = 500; // non-refundable processing fee (demo)

  /**
   * Paystack config
   * - Use TEST public key for development (pk_test_...)
   * - NEVER put secret key (sk_...) in frontend code
   * - Production: initialize on server, verify with secret key + webhook
   * Get keys: https://dashboard.paystack.com/#/settings/developers
   */
  const PAYSTACK_PUBLIC_KEY = window.IITH_PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const PAYSTACK_ENABLED = PAYSTACK_PUBLIC_KEY.indexOf('pk_test_') === 0 || PAYSTACK_PUBLIC_KEY.indexOf('pk_live_') === 0;

  // ---------- Helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setSession(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  }

  function addHistory(entry) {
    const list = getHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  }

  function formatNaira(n) {
    return '₦' + Number(n).toLocaleString('en-NG');
  }

  function generateRef() {
    const t = Date.now().toString(36).toUpperCase();
    const r = Math.random().toString(36).slice(2, 8).toUpperCase();
    return 'IITH-' + t + '-' + r;
  }

  function requireAuth() {
    const s = getSession();
    if (!s || !s.matric) {
      window.location.href = (window.location.pathname.includes('/pages/') ? '' : 'pages/') + 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    return s;
  }

  // ---------- Mobile menu ----------
  function initMobileMenu() {
    const btn = $('#mobile-menu-btn');
    const menu = $('#mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  }

  // ---------- Login ----------
  function initLogin() {
    const form = $('#login-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const matric = ($('#matric')?.value || '').trim().toUpperCase();
      const password = $('#password')?.value || '';
      const err = $('#login-error');
      if (err) err.classList.add('hidden');

      // Rate-limit style simple guard
      const attempts = Number(sessionStorage.getItem('login_attempts') || 0);
      if (attempts >= 8) {
        if (err) {
          err.textContent = 'Too many attempts. Please wait a few minutes.';
          err.classList.remove('hidden');
        }
        return;
      }

      const student = DEMO_STUDENTS[matric];
      if (!student || student.password !== password) {
        sessionStorage.setItem('login_attempts', String(attempts + 1));
        if (err) {
          err.textContent = 'Invalid matriculation number or password.';
          err.classList.remove('hidden');
        }
        return;
      }

      sessionStorage.removeItem('login_attempts');
      setSession({
        matric,
        name: student.name,
        programme: student.programme,
        level: student.level,
        school: student.school,
        email: student.email,
        phone: student.phone,
        session: student.session,
        loggedInAt: new Date().toISOString()
      });
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || 'dashboard.html';
      window.location.href = redirect.includes('pages/') ? redirect.split('/').pop() : redirect;
    });
  }

  // ---------- Activate (newly admitted) ----------
  function initActivate() {
    const form = $('#activate-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = ($('#act-email')?.value || '').trim().toLowerCase();
      const jamb = ($('#act-jamb')?.value || '').trim().toUpperCase();
      const name = ($('#act-name')?.value || '').trim();
      const err = $('#activate-error');
      const ok = $('#activate-success');
      if (err) err.classList.add('hidden');
      if (ok) ok.classList.add('hidden');

      if (!email || !jamb || !name) {
        if (err) { err.textContent = 'All fields are required.'; err.classList.remove('hidden'); }
        return;
      }

      // Demo: create temporary applicant session
      const tempMatric = 'APP/' + jamb.slice(-6);
      setSession({
        matric: tempMatric,
        name,
        programme: 'Applicant',
        level: 'Applicant',
        school: '—',
        email,
        phone: '',
        session: '2026/2027',
        isApplicant: true,
        loggedInAt: new Date().toISOString()
      });
      if (ok) {
        ok.textContent = 'Account activated (demo). Redirecting to dashboard…';
        ok.classList.remove('hidden');
      }
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    });
  }

  // ---------- Dashboard ----------
  function initDashboard() {
    const session = getSession();
    if (!session) return;
    const nameEl = $('#dash-name');
    const matricEl = $('#dash-matric');
    const progEl = $('#dash-programme');
    const levelEl = $('#dash-level');
    if (nameEl) nameEl.textContent = session.name;
    if (matricEl) matricEl.textContent = session.matric;
    if (progEl) progEl.textContent = session.programme;
    if (levelEl) levelEl.textContent = session.level;

    const logout = $('#logout-btn');
    if (logout) {
      logout.addEventListener('click', (e) => {
        e.preventDefault();
        clearSession();
        window.location.href = 'login.html';
      });
    }
  }

  // ---------- Pay fees ----------
  function initPayFees() {
    const session = requireAuth();
    if (!session) return;

    const select = $('#fee-select');
    const summary = $('#fee-summary');
    const generateBtn = $('#generate-btn');
    if (!select) return;

    // Populate options relevant to level
    FEE_CATALOG.forEach((f) => {
      if (session.isApplicant && !['Applicant', 'CVES'].some(l => f.levels.includes(l))) return;
      if (!session.isApplicant && f.levels.includes('Applicant') && !f.levels.includes(session.level)) return;
      // show all school-related for simplicity in demo
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.label} — ${formatNaira(f.amount)}`;
      select.appendChild(opt);
    });

    function updateSummary() {
      const fee = FEE_CATALOG.find(f => f.id === select.value);
      if (!fee || !summary) return;
      const total = fee.amount + SYSTEM_CHARGE;
      summary.innerHTML = `
        <div class="flex justify-between py-2 border-b border-slate-100"><span>Fee</span><span class="font-medium">${fee.label}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-100"><span>Amount</span><span>${formatNaira(fee.amount)}</span></div>
        <div class="flex justify-between py-2 border-b border-slate-100"><span>System charge</span><span>${formatNaira(SYSTEM_CHARGE)}</span></div>
        <div class="flex justify-between py-3 font-semibold text-lg"><span>Total</span><span class="text-brand-700">${formatNaira(total)}</span></div>
      `;
      summary.dataset.feeId = fee.id;
      summary.dataset.amount = String(fee.amount);
      summary.dataset.total = String(total);
      summary.dataset.label = fee.label;
    }

    select.addEventListener('change', updateSummary);
    updateSummary();

    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        const feeId = summary.dataset.feeId;
        const amount = Number(summary.dataset.amount);
        const total = Number(summary.dataset.total);
        const label = summary.dataset.label;
        if (!feeId) return;

        const ref = generateRef();
        const invoice = {
          ref,
          feeId,
          label,
          amount,
          systemCharge: SYSTEM_CHARGE,
          total,
          matric: session.matric,
          name: session.name,
          programme: session.programme,
          level: session.level,
          session: session.session,
          createdAt: new Date().toISOString(),
          status: 'PENDING'
        };
        sessionStorage.setItem('current_invoice', JSON.stringify(invoice));
        window.location.href = 'invoice.html';
      });
    }
  }

  // ---------- Invoice page ----------
  function initInvoice() {
    const raw = sessionStorage.getItem('current_invoice');
    if (!raw) {
      window.location.href = 'pay.html';
      return;
    }
    const inv = JSON.parse(raw);
    const map = {
      '#inv-ref': inv.ref,
      '#inv-name': inv.name,
      '#inv-matric': inv.matric,
      '#inv-programme': inv.programme,
      '#inv-level': inv.level,
      '#inv-label': inv.label,
      '#inv-amount': formatNaira(inv.amount),
      '#inv-charge': formatNaira(inv.systemCharge),
      '#inv-total': formatNaira(inv.total),
      '#inv-date': new Date(inv.createdAt).toLocaleString('en-NG')
    };
    Object.entries(map).forEach(([sel, val]) => {
      const el = $(sel);
      if (el) el.textContent = val;
    });

    const payBtn = $('#pay-now-btn');
    if (payBtn) {
      payBtn.addEventListener('click', () => {
        const session = getSession();
        const email = (session && session.email) || 'student@iithyenagoa.edu.ng';
        const amountKobo = Math.round(Number(inv.total) * 100);

        const API_BASE = (window.IITH_CONFIG && window.IITH_CONFIG.apiBase) || '';

        function completePayment(method, gatewayRef, verified) {
          inv.status = 'PAID';
          inv.paidAt = new Date().toISOString();
          inv.paymentMethod = method;
          inv.gatewayRef = gatewayRef || inv.ref;
          inv.serverVerified = Boolean(verified);
          sessionStorage.setItem('current_invoice', JSON.stringify(inv));
          addHistory(inv);
          window.location.href = 'receipt.html';
        }

        async function verifyOnServer(reference) {
          if (!API_BASE) return { status: true, demo: true };
          try {
            const res = await fetch(API_BASE + '/api/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reference: reference,
                amount: inv.total,
                metadata: { matric: inv.matric, label: inv.label }
              })
            });
            return await res.json();
          } catch (e) {
            console.warn('Verify request failed', e);
            return { status: false, message: 'Could not reach verification server' };
          }
        }

        // Prefer Paystack Inline when a real public key is configured
        if (typeof PaystackPop !== 'undefined' && PAYSTACK_ENABLED && !PAYSTACK_PUBLIC_KEY.includes('xxxx')) {
          try {
            const handler = PaystackPop.setup({
              key: PAYSTACK_PUBLIC_KEY,
              email: email,
              amount: amountKobo,
              currency: 'NGN',
              ref: inv.ref,
              metadata: {
                custom_fields: [
                  { display_name: 'Matric', variable_name: 'matric', value: inv.matric },
                  { display_name: 'Fee', variable_name: 'fee_label', value: inv.label },
                  { display_name: 'Student', variable_name: 'student_name', value: inv.name }
                ]
              },
              callback: function (response) {
                const note = $('#pay-note');
                if (note) {
                  note.textContent = 'Verifying payment with server…';
                  note.classList.remove('hidden');
                }
                verifyOnServer(response.reference).then(function (result) {
                  if (result && result.status) {
                    completePayment('Paystack', response.reference, true);
                  } else {
                    if (note) {
                      note.textContent = (result && result.message) || 'Verification failed. Contact support with ref: ' + response.reference;
                    }
                    // Still allow demo completion if server unreachable in local dev
                    if (!API_BASE) completePayment('Paystack (unverified)', response.reference, false);
                  }
                });
              },
              onClose: function () {
                const note = $('#pay-note');
                if (note) {
                  note.textContent = 'Payment window closed. You can try again.';
                  note.classList.remove('hidden');
                }
              }
            });
            handler.openIframe();
            return;
          } catch (err) {
            console.warn('Paystack error, falling back to demo pay', err);
          }
        }

        // Demo fallback (no valid Paystack key)
        if (confirm('Paystack test key not configured. Complete as DEMO payment?')) {
          verifyOnServer(inv.ref).then(function () {
            completePayment('Demo (configure Paystack for live)', inv.ref, true);
          });
        }
      });
    }
  }

  // ---------- Receipt ----------
  function initReceipt() {
    const raw = sessionStorage.getItem('current_invoice');
    if (!raw) {
      window.location.href = 'dashboard.html';
      return;
    }
    const inv = JSON.parse(raw);
    if (inv.status !== 'PAID') {
      window.location.href = 'invoice.html';
      return;
    }
    const map = {
      '#rcpt-ref': inv.ref,
      '#rcpt-name': inv.name,
      '#rcpt-matric': inv.matric,
      '#rcpt-programme': inv.programme,
      '#rcpt-label': inv.label,
      '#rcpt-amount': formatNaira(inv.amount),
      '#rcpt-charge': formatNaira(inv.systemCharge),
      '#rcpt-total': formatNaira(inv.total),
      '#rcpt-date': new Date(inv.paidAt || inv.createdAt).toLocaleString('en-NG'),
      '#rcpt-method': inv.paymentMethod || 'Online'
    };
    Object.entries(map).forEach(([sel, val]) => {
      const el = $(sel);
      if (el) el.textContent = val;
    });
  }

  // ---------- History ----------
  function initHistory() {
    const session = requireAuth();
    if (!session) return;
    const list = getHistory().filter(h => h.matric === session.matric);
    const container = $('#history-list');
    if (!container) return;
    if (!list.length) {
      container.innerHTML = '<p class="text-slate-500 text-sm py-8 text-center">No payments yet.</p>';
      return;
    }
    container.innerHTML = list.map(h => `
      <div class="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="font-medium">${h.label}</div>
          <div class="text-xs text-slate-500">${h.ref} · ${new Date(h.paidAt || h.createdAt).toLocaleDateString('en-NG')}</div>
        </div>
        <div class="text-right">
          <div class="font-semibold text-brand-700">${formatNaira(h.total)}</div>
          <span class="badge badge-success">PAID</span>
        </div>
      </div>
    `).join('');
  }

  // ---------- Auth guard for protected pages ----------
  function guardProtected() {
    const path = window.location.pathname;
    const protectedPages = ['dashboard.html', 'pay.html', 'invoice.html', 'receipt.html', 'history.html', 'profile.html'];
    if (protectedPages.some(p => path.endsWith(p))) {
      requireAuth();
    }
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    guardProtected();
    initLogin();
    initActivate();
    initDashboard();
    initPayFees();
    initInvoice();
    initReceipt();
    initHistory();
  });

  // Export for debugging
  window.IITHFees = { getSession, clearSession, FEE_CATALOG, formatNaira };
})();
