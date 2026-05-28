import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, Wallet as WalletIcon, Plus,
  ArrowUpRight, ArrowDownLeft, Loader2,
  Shield
} from 'lucide-react';
import type { Transaction, Wallet as WalletType } from '@shared/schema';

interface RechargePackType {
  id: string;
  amount: number;
  bonus: number;
  label: string;
  popular: boolean;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface OfferType {
  code: string;
  description: string | null;
  discountType: string;
  discountValue: string;
  maxDiscount: string | null;
  minAmount: string | null;
  firstRechargeOnly: boolean | null;
}

export default function Wallet() {
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPack, setSelectedPack] = useState<RechargePackType | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponState, setCouponState] = useState<{ valid: boolean; bonus: number; message: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletType>({
    queryKey: ['/api/wallet'],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
  });

  const { data: packs } = useQuery<RechargePackType[]>({
    queryKey: ['/api/wallet/packs'],
  });

  const { data: offers } = useQuery<OfferType[]>({
    queryKey: ['/api/coupons'],
  });

  const { data: config } = useQuery<{ razorpayKeyId: string; agoraAppId: string }>({
    queryKey: ['/api/config'],
  });

  useEffect(() => {
    if (location.includes('snapmint=callback') || location.includes('lazypay=callback')) {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      toast({ title: 'Payment Received', description: 'Your wallet has been recharged.' });
    }
  }, [location]);

  const handleRazorpayPayment = async (amount: number, packId?: string, bonus: number = 0) => {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      toast({ title: 'Error', description: 'Failed to load payment gateway. Please try again.', variant: 'destructive' });
      return;
    }

    // Only send a coupon when it has been validated for this amount
    const couponToApply = couponState?.valid ? couponCode.trim() : undefined;

    try {
      const data = await apiRequest('POST', '/api/payment/razorpay/order', { amount, packId, couponCode: couponToApply });
      const orderData = await data.json();

      if (orderData.message) {
        toast({ title: 'Payment Gateway', description: orderData.message, variant: 'destructive' });
        return;
      }

      const rzp = new window.Razorpay({
        key: orderData.keyId || config?.razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Navagraha',
        description: `Wallet Recharge${bonus > 0 ? ` + ₹${bonus} Bonus` : ''}`,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            const verifyData = await apiRequest('POST', '/api/payment/razorpay/verify', {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              amount,
              bonus,
            });
            const verifyResult = await verifyData.json();
            if (verifyResult.success) {
              queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
              queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
              setCouponCode('');
              setCouponState(null);
              toast({
                title: 'Payment Successful',
                description: `Your wallet balance is now ₹${Number(verifyResult.newBalance).toFixed(2)}.`,
              });
            }
          } catch {
            toast({ title: 'Verification Failed', description: 'Payment received but verification failed. Contact support.', variant: 'destructive' });
          }
        },
        prefill: {},
        theme: { color: '#3AABA8' },
        modal: {
          ondismiss: () => {
            toast({ title: 'Payment Cancelled', description: 'You cancelled the payment.', variant: 'destructive' });
          }
        }
      });
      rzp.open();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Payment failed. Please try again.', variant: 'destructive' });
    }
  };

  const handleSnapmintPayment = async (amount: number) => {
    try {
      const data = await apiRequest('POST', '/api/payment/snapmint/order', { amount });
      const result = await data.json();
      if (result.message) {
        toast({ title: 'Snapmint Info', description: result.message, variant: 'destructive' });
        return;
      }
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Snapmint payment failed.', variant: 'destructive' });
    }
  };

  const handleLazyPayPayment = async (amount: number) => {
    try {
      const data = await apiRequest('POST', '/api/payment/lazypay/order', { amount });
      const result = await data.json();
      if (result.message) {
        toast({ title: 'LazyPay Info', description: result.message, variant: 'destructive' });
        return;
      }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = result.paymentUrl;
      Object.entries(result).forEach(([key, value]) => {
        if (key !== 'paymentUrl') {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
      });
      document.body.appendChild(form);
      form.submit();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'LazyPay payment failed.', variant: 'destructive' });
    }
  };

  const handlePayment = (amount: number, packId?: string, bonus: number = 0) => {
    handleRazorpayPayment(amount, packId, bonus);
  };

  const handleCustomPayment = () => {
    const amount = Number(customAmount);
    if (amount < 10) {
      toast({ title: 'Invalid Amount', description: 'Minimum recharge is ₹10.', variant: 'destructive' });
      return;
    }
    handlePayment(amount);
  };

  const validateCoupon = async () => {
    const amount = Number(customAmount);
    if (!couponCode.trim()) return;
    if (!amount || amount < 10) {
      toast({ title: 'Enter an amount', description: 'Enter the recharge amount before applying a coupon.', variant: 'destructive' });
      return;
    }
    setValidatingCoupon(true);
    try {
      const res = await apiRequest('POST', '/api/coupons/validate', { code: couponCode.trim(), amount });
      const result = await res.json();
      setCouponState(result);
    } catch {
      setCouponState({ valid: false, bonus: 0, message: 'Could not validate coupon.' });
    } finally {
      setValidatingCoupon(false);
    }
  };

  if (walletLoading) return <LoadingSpinner />;

  const balance = parseFloat(wallet?.balance || '0');

  return (
    <div className="yantra-shell min-h-screen pb-24 text-foreground md:pb-8">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-display text-xl text-foreground">My Wallet</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">
        {/* Balance Card */}
        <div className="mb-6 rounded-[12px] border border-[var(--primary-border)] bg-primary p-6 shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-nava-navy">
              <WalletIcon className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-[var(--nava-navy)]/90">Available Balance</span>
          </div>
          <div className="mb-1 font-display text-4xl text-[var(--nava-navy)]" data-testid="text-balance">
            ₹{balance.toFixed(2)}
          </div>
          <p className="text-sm text-[var(--nava-navy)]/75">
            {balance < 100
              ? 'Low balance - recharge to continue consultations'
              : `Approx. ${Math.floor(balance / 25)} minutes of consultation time`}
          </p>
        </div>

        {/* Recharge Section */}
        <Card className="yantra-card mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Add Money</CardTitle>
            <CardDescription>Choose a recharge pack or enter a custom amount</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Recharge Packs */}
            {packs && packs.length > 0 && (
              <div className="mb-5">
                <p className="text-sm font-medium text-foreground mb-3">Popular Packs</p>
                <div className="grid grid-cols-2 gap-3">
                  {packs.map((pack) => (
                    <button
                      key={pack.id}
                      onClick={() => {
                        setSelectedPack(pack);
                        handlePayment(pack.amount, pack.id, pack.bonus);
                      }}
                      className={`relative rounded-[10px] border-2 p-4 text-left transition-all hover:border-[var(--primary-border)] ${pack.popular ? 'border-[var(--primary-border)] bg-primary/10' : 'border-border bg-card'
                        }`}
                      data-testid={`button-pack-${pack.id}`}
                    >
                      {pack.popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-[6px] bg-nava-navy px-2 py-0.5 text-[10px] font-bold text-primary">
                          Popular
                        </span>
                      )}
                      <div className="font-display text-xl text-foreground">₹{pack.amount}</div>
                      {pack.bonus > 0 && (
                        <div className="text-xs text-emerald-600 font-semibold">+ ₹{pack.bonus} bonus</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        ~{Math.floor(pack.amount / 25)} mins
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick buttons (fallback if packs not loaded) */}
            {!packs && (
              <div className="grid grid-cols-4 gap-2 mb-5">
                {[100, 300, 500, 1000].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    className="h-12 rounded-[9px] text-sm font-semibold"
                    onClick={() => handlePayment(amount)}
                    data-testid={`button-add-${amount}`}
                  >
                    +₹{amount}
                  </Button>
                ))}
              </div>
            )}

            {/* Custom Amount */}
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter custom amount (min ₹10)"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 rounded-[10px]"
                min="10"
                data-testid="input-custom-amount"
              />
              <Button
                onClick={handleCustomPayment}
                disabled={!customAmount || Number(customAmount) < 10}
                className="rounded-[9px] bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                data-testid="button-add-custom"
              >
                Pay
              </Button>
            </div>

            {/* Coupon code */}
            <div className="mt-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Have a coupon code?"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponState(null); }}
                  className="flex-1 rounded-[10px] uppercase"
                  data-testid="input-coupon"
                />
                <Button
                  variant="outline"
                  onClick={validateCoupon}
                  disabled={!couponCode.trim() || validatingCoupon}
                  className="rounded-[9px] px-6"
                  data-testid="button-apply-coupon"
                >
                  {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              {couponState && (
                <p className={`text-xs mt-2 font-medium ${couponState.valid ? 'text-emerald-600' : 'text-destructive'}`} data-testid="text-coupon-status">
                  {couponState.message}
                </p>
              )}
            </div>

            {/* Available offers */}
            {offers && offers.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-medium text-foreground mb-2">Available Offers</p>
                <div className="space-y-2">
                  {offers.map((offer) => (
                    <button
                      key={offer.code}
                      onClick={() => { setCouponCode(offer.code); setCouponState(null); }}
                      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-dashed border-primary/60 bg-primary/10 p-3 text-left transition-colors hover:bg-primary/15"
                      data-testid={`offer-${offer.code}`}
                    >
                      <div>
                        <div className="text-sm font-bold text-foreground">{offer.code}</div>
                        <div className="text-xs text-muted-foreground">{offer.description}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-[var(--primary-border)] text-[var(--primary-border)]">Tap to use</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Security note */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>256-bit SSL encrypted. Powered by Razorpay.</span>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="yantra-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <LoadingSpinner size="sm" />
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((transaction) => {
                  const isCredit = transaction.type === 'credit' || transaction.type === 'recharge';
                  const date = transaction.createdAt ? new Date(transaction.createdAt) : new Date();
                  const isPending = transaction.status === 'pending';

                  return (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between rounded-[10px] bg-background p-3"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-[6px] ${isPending ? 'bg-primary/15' : isCredit ? 'bg-emerald-500/10' : 'bg-nava-magenta/10'
                          }`}>
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--primary-border)]" />
                          ) : isCredit ? (
                            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-nava-magenta" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-foreground">
                            {transaction.description || (isCredit ? 'Wallet Recharge' : 'Consultation')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${isPending ? 'text-nava-amber' : isCredit ? 'text-emerald-600' : 'text-nava-magenta'
                          }`}>
                          {isCredit ? '+' : '-'}₹{transaction.amount}
                        </div>
                        <Badge
                          className={`text-[10px] ${transaction.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-0' : transaction.status === 'pending' ? 'bg-nava-amber/10 text-nava-amber border-0' : 'bg-destructive/10 text-destructive border-0'}`}
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[8px] bg-primary/20">
                  <WalletIcon className="w-7 h-7 text-[var(--primary-border)]" />
                </div>
                <p className="text-muted-foreground text-sm">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Recharge your wallet to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
