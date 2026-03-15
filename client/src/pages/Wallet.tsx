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
  CreditCard, Smartphone, Gift, Shield,
  CheckCircle2, Info
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

export default function Wallet() {
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPack, setSelectedPack] = useState<RechargePackType | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'snapmint' | 'lazypay'>('razorpay');
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

    try {
      const data = await apiRequest('POST', '/api/payment/razorpay/order', { amount, packId });
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
              toast({
                title: 'Payment Successful',
                description: `₹${amount + bonus} added to your wallet${bonus > 0 ? ` (including ₹${bonus} bonus)` : ''}.`,
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
    if (paymentMethod === 'razorpay') handleRazorpayPayment(amount, packId, bonus);
    else if (paymentMethod === 'snapmint') handleSnapmintPayment(amount);
    else if (paymentMethod === 'lazypay') handleLazyPayPayment(amount);
  };

  const handleCustomPayment = () => {
    const amount = Number(customAmount);
    if (amount < 10) {
      toast({ title: 'Invalid Amount', description: 'Minimum recharge is ₹10.', variant: 'destructive' });
      return;
    }
    handlePayment(amount);
    setCustomAmount('');
  };

  if (walletLoading) return <LoadingSpinner />;

  const balance = parseFloat(wallet?.balance || '0');

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-foreground">My Wallet</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Balance Card */}
        <div className="bg-nava-teal rounded-3xl p-6 mb-6 shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <WalletIcon className="w-6 h-6 text-white" />
            <span className="text-sm text-white/90 font-medium">Available Balance</span>
          </div>
          <div className="text-4xl font-bold text-white mb-1" data-testid="text-balance">
            ₹{balance.toFixed(2)}
          </div>
          <p className="text-sm text-white/80">
            {balance < 100
              ? 'Low balance - recharge to continue consultations'
              : `Approx. ${Math.floor(balance / 25)} minutes of consultation time`}
          </p>
        </div>

        {/* Recharge Section */}
        <Card className="mb-6 bg-card border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Money</CardTitle>
            <CardDescription>Choose a recharge pack or enter a custom amount</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Payment Method Selector */}
            <div className="mb-5">
              <p className="text-sm font-medium text-foreground mb-3">Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPaymentMethod('razorpay')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod === 'razorpay'
                    ? 'border-nava-teal bg-nava-teal/5'
                    : 'border-border hover:border-nava-teal/50'
                    }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <CreditCard className="w-4 h-4 text-foreground" />
                    <span className="font-semibold text-xs">Razorpay</span>
                    {paymentMethod === 'razorpay' && <CheckCircle2 className="w-3.5 h-3.5 text-nava-teal ml-auto" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">UPI, Cards</p>
                </button>

                <button
                  onClick={() => setPaymentMethod('snapmint')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod === 'snapmint'
                    ? 'border-nava-teal bg-nava-teal/5'
                    : 'border-border hover:border-nava-teal/50'
                    }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Smartphone className="w-4 h-4 text-foreground" />
                    <span className="font-semibold text-xs">Snapmint</span>
                    {paymentMethod === 'snapmint' && <CheckCircle2 className="w-3.5 h-3.5 text-nava-teal ml-auto" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">0% EMI</p>
                </button>

                <button
                  onClick={() => setPaymentMethod('lazypay')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod === 'lazypay'
                    ? 'border-nava-teal bg-nava-teal/5'
                    : 'border-border hover:border-nava-teal/50'
                    }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gift className="w-4 h-4 text-foreground" />
                    <span className="font-semibold text-xs">LazyPay</span>
                    {paymentMethod === 'lazypay' && <CheckCircle2 className="w-3.5 h-3.5 text-nava-teal ml-auto" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Pay Later</p>
                </button>
              </div>
            </div>

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
                      className={`relative p-4 rounded-xl border-2 text-left transition-all hover:border-nava-amber ${pack.popular ? 'border-nava-amber bg-nava-amber/5' : 'border-border'
                        }`}
                      data-testid={`button-pack-${pack.id}`}
                    >
                      {pack.popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-nava-amber text-nava-navy text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      <div className="text-xl font-bold text-foreground">₹{pack.amount}</div>
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
                    className="h-12 text-sm font-semibold rounded-xl"
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
                className="flex-1 rounded-xl"
                min="10"
                data-testid="input-custom-amount"
              />
              <Button
                onClick={handleCustomPayment}
                disabled={!customAmount || Number(customAmount) < 10}
                className="bg-nava-teal hover:bg-nava-teal/90 text-white rounded-xl px-6"
                data-testid="button-add-custom"
              >
                Pay
              </Button>
            </div>

            {/* Security note */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>256-bit SSL encrypted. Powered by Razorpay.</span>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="bg-card border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transaction History</CardTitle>
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
                      className="flex items-center justify-between p-3 bg-background rounded-xl"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isPending ? 'bg-nava-amber/10' : isCredit ? 'bg-emerald-500/10' : 'bg-nava-magenta/10'
                          }`}>
                          {isPending ? (
                            <Loader2 className="w-4 h-4 text-nava-amber animate-spin" />
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
                <div className="w-14 h-14 rounded-full bg-nava-teal/10 flex items-center justify-center mx-auto mb-3">
                  <WalletIcon className="w-7 h-7 text-nava-teal" />
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
