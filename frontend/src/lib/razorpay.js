/**
 * Razorpay Standard Checkout SDK helper
 */

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay Standard Checkout modal
 *
 * @param {object} options
 * @param {string} options.keyId - Razorpay Key ID
 * @param {string} options.orderId - Razorpay Order ID
 * @param {number} [options.amountMinor] - Amount in paise (integer)
 * @param {string} [options.currency='INR'] - Currency code
 * @param {string} [options.name='BalanceBook'] - Modal title
 * @param {string} [options.description='Group Debt Settlement'] - Description
 * @param {object} [options.user] - User details { name, email, phone }
 * @param {Function} options.onSuccess - Callback on payment success ({ razorpay_order_id, razorpay_payment_id, razorpay_signature })
 * @param {Function} [options.onFailure] - Callback on payment error or dismissal
 */
export async function openRazorpayCheckout({
  keyId,
  orderId,
  amountMinor,
  currency = 'INR',
  name = 'BalanceBook',
  description = 'Group Debt Settlement',
  user = {},
  onSuccess,
  onFailure,
}) {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !window.Razorpay) {
    if (onFailure) onFailure(new Error('Failed to load Razorpay payment SDK'));
    return;
  }

  const options = {
    key: keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_U0MCZXxrqSTQGl',
    amount: amountMinor,
    currency: (currency || 'INR').toUpperCase(),
    name,
    description,
    order_id: orderId,
    prefill: {
      name: user.name || '',
      email: user.email || '',
      contact: user.phone || '',
    },
    theme: {
      color: '#4F46E5', // BalanceBook primary indigo theme
    },
    modal: {
      ondismiss: () => {
        if (onFailure) onFailure(new Error('Payment was cancelled by the user'));
      },
    },
    handler: function (response) {
      if (onSuccess) {
        onSuccess({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      }
    },
  };

  const razorpayInstance = new window.Razorpay(options);
  razorpayInstance.on('payment.failed', function (response) {
    if (onFailure) {
      onFailure(new Error(response.error?.description || 'Payment processing failed'));
    }
  });

  razorpayInstance.open();
}
