import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, Wallet as WalletIcon, Plus,
  ArrowUpRight, ArrowDownLeft, Loader2,
  CreditCard, Smartphone, Gift, Shield,
  CheckCircle2, AlertCircle, Info
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

  // Handle Snapmint/LazyPay callback returns
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
        // Payment gateway not configured
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
                title: '✓ Payment Successful',
                description: `₹${amount + bonus} added to your wallet${bonus > 0 ? ` (including ₹${bonus} bonus)` : ''}.`,
              });
            }
          } catch {
            toast({ title: 'Verification Failed', description: 'Payment received but verification failed. Contact support.', variant: 'destructive' });
          }
        },
        prefill: {},
        theme: { color: '#FFCF23' },
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
      // Create form and submit to PayU
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-foreground/5 ">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-xl hover:bg-foreground/5" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-foreground">My Wallet</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-muted-foreground mb-6">Recharge using UPI, cards, or pay later options</p>

        {/* Balance Card */}
        <Card className="mb-6 bg-gradient-to-br from-orange-500 to-amber-400 border-[var(--rose)]/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <WalletIcon className="w-7 h-7 text-white" />
              <span className="text-base text-[#fff]/90 font-medium">Available Balance</span>
            </div>
            <div className="text-5xl font-bold text-white mb-1" data-testid="text-balance">
              ₹{balance.toFixed(2)}
            </div>
            <p className="text-sm text-white/80">
              {balance < 100
                ? '⚠ Low balance — recharge to continue consultations'
                : `≈ ${Math.floor(balance / 25)} minutes of consultation time`}
            </p>
          </CardContent>
        </Card>

        {/* Recharge Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add Money</CardTitle>
            <CardDescription>Choose a recharge pack or enter a custom amount</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Payment Method Selector */}
            <div className="mb-6">
              <p className="text-sm font-medium text-foreground mb-3">Payment Method</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Razorpay */}
                <button
                  onClick={() => setPaymentMethod('razorpay')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === 'razorpay'
                    ? 'border-orange-400 bg-[var(--rose)]/5'
                    : 'border-border hover:border-orange-400'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4 text-foreground" />
                    <span className="font-semibold text-sm">Razorpay</span>
                    {paymentMethod === 'razorpay' && <CheckCircle2 className="w-4 h-4 text-orange-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground">UPI • Cards • Netbanking</p>
                  <p className="text-xs text-green-600 font-medium mt-1">Snapmint & LazyPay EMI also available</p>
                </button>

                {/* Snapmint Direct */}
                <button
                  onClick={() => setPaymentMethod('snapmint')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === 'snapmint'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-border hover:border-blue-300'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-sm">Snapmint</span>
                    {paymentMethod === 'snapmint' && <CheckCircle2 className="w-4 h-4 text-blue-500 ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground">0% EMI • No credit card</p>
                  <p className="text-xs text-blue-600 font-medium mt-1">3/6/9 month EMI on UPI</p>
                </button>

                {/* LazyPay */}
                <button
                  onClick={() => setPaymentMethod('lazypay')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === 'lazypay'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-border hover:border-purple-300'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Gift className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-sm">LazyPay</span>
                    {paymentMethod === 'lazypay' && <CheckCircle2 className="w-4 h-4 text-purple-500 ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground">Buy Now, Pay Later</p>
                  <p className="text-xs text-purple-600 font-medium mt-1">Pay in 4 • 0% interest</p>
                </button>
              </div>

              {/* Info banners */}
              {paymentMethod === 'snapmint' && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg flex gap-2">
                  <Info className="w-4 h-4 text-[var(--rose)] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    Snapmint offers 0% EMI in 3, 6, or 9 installments with no credit card required.
                    Repayment via UPI. Also available inside Razorpay checkout.
                    <a href="https://snapmint.com" target="_blank" rel="noreferrer" className="underline ml-1">Learn more</a>
                  </p>
                </div>
              )}
              {paymentMethod === 'lazypay' && (
                <div className="mt-3 p-3 bg-purple-50 rounded-lg flex gap-2">
                  <Info className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-purple-700">
                    LazyPay by PayU lets you buy now and pay later. Pay in 4 interest-free installments or up to 12 months EMI.
                    Also available inside Razorpay checkout.
                    <a href="https://lazypay.in" target="_blank" rel="noreferrer" className="underline ml-1">Learn more</a>
                  </p>
                </div>
              )}
            </div>

            {/* Recharge Packs */}
            {packs && packs.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-foreground mb-3">Popular Packs</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {packs.map((pack) => (
                    <button
                      key={pack.id}
                      onClick={() => {
                        setSelectedPack(pack);
                        handlePayment(pack.amount, pack.id, pack.bonus);
                      }}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all hover:border-amber-400 ${pack.popular ? 'border-amber-400 bg-amber-50' : 'border-border'
                        }`}
                      data-testid={`button-pack-${pack.id}`}
                    >
                      {pack.popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                          Most Popular
                        </span>
                      )}
                      <div className="text-2xl font-bold text-foreground">₹{pack.amount}</div>
                      {pack.bonus > 0 && (
                        <div className="text-xs text-green-600 font-semibold">+ ₹{pack.bonus} bonus</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        ≈ {Math.floor(pack.amount / 25)} mins
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick buttons (fallback if packs not loaded) */}
            {!packs && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[100, 300, 500, 1000].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    className="h-14 text-lg font-semibold"
                    onClick={() => handlePayment(amount)}
                    data-testid={`button-add-${amount}`}
                  >
                    +₹{amount}
                  </Button>
                ))}
              </div>
            )}

            {/* Custom Amount */}
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="Enter custom amount (min ₹10)"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="text-lg"
                min="10"
                data-testid="input-custom-amount"
              />
              <Button
                onClick={handleCustomPayment}
                disabled={!customAmount || Number(customAmount) < 10}
                data-testid="button-add-custom"
              >
                Pay Now
              </Button>
            </div>

            {/* Security note */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>256-bit SSL encrypted. Powered by Razorpay, Snapmint & LazyPay.</span>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>All your wallet transactions</CardDescription>
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
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPending ? 'bg-yellow-500/10' : isCredit ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}>
                          {isPending ? (
                            <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />
                          ) : isCredit ? (
                            <ArrowDownLeft className="w-5 h-5 text-green-600" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {transaction.description || (isCredit ? 'Wallet Recharge' : 'Consultation')}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{date.toLocaleDateString()} • {date.toLocaleTimeString()}</span>
                            {transaction.paymentMethod && (
                              <Badge variant="outline" className="text-xs py-0">
                                {transaction.paymentMethod}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${isPending ? 'text-yellow-600' : isCredit ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {isCredit ? '+' : '-'}₹{transaction.amount}
                        </div>
                        <Badge
                          variant={transaction.status === 'completed' ? 'default' : transaction.status === 'pending' ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <WalletIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No transactions yet</p>
                <p className="text-sm text-muted-foreground mt-2">Recharge your wallet to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
}
