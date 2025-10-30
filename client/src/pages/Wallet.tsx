import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  ArrowLeft, Wallet as WalletIcon, Plus, 
  ArrowUpRight, ArrowDownLeft, Loader2 
} from 'lucide-react';
import type { Transaction } from '@shared/schema';

const quickAddAmounts = [100, 500, 1000, 2000];

export default function Wallet() {
  const [customAmount, setCustomAmount] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['/api/wallet'],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
  });

  const addMoneyMutation = useMutation({
    mutationFn: async (amount: number) => {
      return await apiRequest('POST', '/api/wallet/add', { amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      toast({
        title: 'Money Added!',
        description: 'Your wallet has been recharged successfully.',
      });
      setCustomAmount('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add money. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleAddMoney = (amount: number) => {
    if (amount > 0) {
      addMoneyMutation.mutate(amount);
    }
  };

  if (walletLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-card-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/">
            <Button variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif text-4xl font-bold text-foreground mb-8">
          My Wallet
        </h1>

        {/* Wallet Balance Card */}
        <Card className="mb-8 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-4">
              <WalletIcon className="w-8 h-8 text-primary" />
              <span className="text-lg text-muted-foreground">Available Balance</span>
            </div>
            <div className="text-5xl font-bold text-foreground mb-6" data-testid="text-balance">
              ₹{wallet?.balance || '0.00'}
            </div>
            <Button 
              size="lg" 
              className="w-full sm:w-auto"
              data-testid="button-add-money-main"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Money
            </Button>
          </CardContent>
        </Card>

        {/* Add Money Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add Money to Wallet</CardTitle>
            <CardDescription>Choose an amount or enter a custom value</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Quick Add Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {quickAddAmounts.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  className="h-14 text-lg font-semibold"
                  onClick={() => handleAddMoney(amount)}
                  disabled={addMoneyMutation.isPending}
                  data-testid={`button-add-${amount}`}
                >
                  +₹{amount}
                </Button>
              ))}
            </div>

            {/* Custom Amount */}
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="Enter custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="text-lg"
                min="1"
                data-testid="input-custom-amount"
              />
              <Button
                onClick={() => handleAddMoney(Number(customAmount))}
                disabled={!customAmount || Number(customAmount) <= 0 || addMoneyMutation.isPending}
                data-testid="button-add-custom"
              >
                {addMoneyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Add Money'
                )}
              </Button>
            </div>

            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> This is a demo wallet. No real payment is processed.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>View all your wallet transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <LoadingSpinner size="sm" />
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((transaction) => {
                  const isCredit = transaction.type === 'credit' || transaction.type === 'recharge';
                  const date = new Date(transaction.createdAt);

                  return (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover-elevate"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isCredit ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                          {isCredit ? (
                            <ArrowDownLeft className="w-5 h-5 text-green-600" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {transaction.description || (isCredit ? 'Wallet Recharge' : 'Consultation')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {date.toLocaleDateString()} • {date.toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${
                          isCredit ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isCredit ? '+' : '-'}₹{transaction.amount}
                        </div>
                        <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
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
                <p className="text-sm text-muted-foreground mt-2">
                  Add money to your wallet to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
