/**
 * IITH Fees Portal — runtime config
 *
 * 1. Create a free account at https://dashboard.paystack.com
 * 2. Copy your TEST public key (pk_test_...)
 * 3. Paste it below
 * 4. For live payments, switch to pk_live_... and enable HTTPS
 *
 * IMPORTANT: Never put your SECRET key (sk_...) in this file or any frontend code.
 * Verify every payment on your server with the secret key + webhook.
 */
window.IITH_PAYSTACK_PUBLIC_KEY = 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

window.IITH_CONFIG = {
  systemCharge: 500,
  currency: 'NGN',
  institutionName: 'International Institute of Tourism and Hospitality, Yenagoa',
  supportEmail: 'support@iithyenagoa.edu.ng',
  // When server is running set e.g. 'http://localhost:3000' (no trailing slash)
  // Leave empty for pure static demo (client-only flow)
  apiBase: ''
};
