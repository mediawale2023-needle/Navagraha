/** Razorpay Checkout's payment.failed payload (only the fields we read). */
export interface CheckoutFailure { error?: { description?: unknown; reason?: unknown } }

/**
 * What to tell the payer when Checkout closes without a successful payment. Checkout lets a
 * payer retry inside the window, so a failed attempt followed by closing it is a failure, not
 * a cancellation; closing without any attempt is a cancellation.
 */
export function checkoutClosedMessage(lastFailure: CheckoutFailure | null): { title: string; description: string } {
  if (!lastFailure) return { title: 'Payment cancelled', description: 'No payment was made and your wallet is unchanged.' };
  const reason = typeof lastFailure.error?.description === 'string' ? lastFailure.error.description.trim() : '';
  const shown = reason && reason.length <= 160 && !/[<>{}]/.test(reason) ? `${reason} ` : '';
  return {
    title: 'Payment failed',
    description: `${shown}Nothing was added to your wallet. If your bank shows a debit, it is reversed automatically.`,
  };
}
