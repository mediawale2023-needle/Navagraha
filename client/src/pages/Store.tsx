import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, ShoppingBag, Plus, Minus, Trash2, Package, ShoppingCart } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  price: string;
  mrp: string | null;
  imageUrl: string | null;
  rating: string | null;
}

interface OrderItem { productName: string; quantity: number; price: string }
interface Order {
  id: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  items: OrderItem[];
}

interface CartLine { product: Product; quantity: number }

const CATEGORY_LABELS: Record<string, string> = {
  gemstone: 'Gemstones', rudraksha: 'Rudraksha', yantra: 'Yantras',
  bracelet: 'Bracelets', mala: 'Malas', other: 'More',
};

export default function Store() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'shop' | 'orders'>('shop');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shipping, setShipping] = useState({ name: '', phone: '', address: '', city: '', state: '', pincode: '' });

  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ['/api/store/products'] });
  const { data: orders } = useQuery<Order[]>({ queryKey: ['/api/store/orders'], enabled: tab === 'orders' });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product, quantity: 1 }];
    });
    toast({ title: 'Added to cart', description: product.name });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev
      .map((l) => l.product.id === id ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)
      .filter((l) => l.quantity > 0));
  };

  const cartTotal = cart.reduce((sum, l) => sum + parseFloat(l.product.price) * l.quantity, 0);
  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  const placeOrder = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/store/orders', {
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        shipping,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Order placed!', description: 'We will deliver your items soon.' });
      setCart([]);
      setCheckoutOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/store/orders'] });
      setTab('orders');
    },
    onError: (err: any) => {
      toast({ title: 'Order failed', description: err?.message || 'Please try again', variant: 'destructive' });
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/"><button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></button></Link>
            <h1 className="font-bold text-lg flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-nava-royal-purple" /> Astromall</h1>
          </div>
          {cartCount > 0 && (
            <Button onClick={() => setCheckoutOpen(true)} className="bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white rounded-xl gap-2" data-testid="button-open-cart">
              <ShoppingCart className="w-4 h-4" /> {cartCount} · ₹{cartTotal.toFixed(0)}
            </Button>
          )}
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'shop' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('shop')} data-testid="tab-shop">Shop</Button>
          <Button variant={tab === 'orders' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('orders')} data-testid="tab-orders">My Orders</Button>
        </div>

        {tab === 'shop' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products?.map((p) => {
              const mrp = p.mrp ? parseFloat(p.mrp) : null;
              const price = parseFloat(p.price);
              const off = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
              return (
                <Card key={p.id} className="overflow-hidden border-border/50 shadow-sm flex flex-col" data-testid={`product-${p.slug}`}>
                  <div className="aspect-square bg-gradient-to-br from-nava-lavender/40 to-nava-amber/20 flex items-center justify-center">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-12 h-12 text-nava-royal-purple/40" />}
                  </div>
                  <CardContent className="p-3 flex flex-col flex-1">
                    <Badge variant="outline" className="text-[10px] w-fit mb-1">{CATEGORY_LABELS[p.category] || p.category}</Badge>
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">{p.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-base font-bold">₹{price.toFixed(0)}</span>
                      {mrp && mrp > price && <span className="text-xs text-muted-foreground line-through">₹{mrp.toFixed(0)}</span>}
                      {off > 0 && <span className="text-[10px] font-bold text-emerald-600">{off}% off</span>}
                    </div>
                    <Button size="sm" className="mt-2 rounded-lg bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white" onClick={() => addToCart(p)} data-testid={`button-add-${p.slug}`}>
                      Add to Cart
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-3">
            {(!orders || orders.length === 0) && (
              <div className="text-center py-16 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No orders yet.</p>
              </div>
            )}
            {orders?.map((o) => (
              <Card key={o.id} className="border-border/50 shadow-sm" data-testid={`order-${o.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span>
                    <Badge variant="outline" className="capitalize">{o.status}</Badge>
                  </div>
                  {o.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{it.productName} × {it.quantity}</span>
                      <span>₹{(parseFloat(it.price) * it.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-border/50">
                    <span>Total</span><span>₹{parseFloat(o.totalAmount).toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Checkout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium leading-tight">{l.product.name}</p>
                  <p className="text-xs text-muted-foreground">₹{parseFloat(l.product.price).toFixed(0)} each</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(l.product.id, -1)} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                  <button onClick={() => updateQty(l.product.id, 1)} className="w-7 h-7 rounded-lg border flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => updateQty(l.product.id, -l.quantity)} className="w-7 h-7 rounded-lg border flex items-center justify-center text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t border-border/50">
              <span>Total</span><span>₹{cartTotal.toFixed(0)}</span>
            </div>

            <div className="pt-2 space-y-2">
              <p className="text-sm font-medium">Shipping details</p>
              <Input placeholder="Full name" value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} data-testid="input-ship-name" />
              <Input placeholder="Phone number" value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })} data-testid="input-ship-phone" />
              <Textarea placeholder="Address" value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} data-testid="input-ship-address" />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
                <Input placeholder="State" value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} />
                <Input placeholder="Pincode" value={shipping.pincode} onChange={(e) => setShipping({ ...shipping, pincode: e.target.value })} data-testid="input-ship-pincode" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
              disabled={placeOrder.isPending || cart.length === 0}
              onClick={() => placeOrder.mutate()}
              data-testid="button-place-order"
            >
              {placeOrder.isPending ? 'Placing…' : `Pay ₹${cartTotal.toFixed(0)} from Wallet`}
            </Button>
          </DialogFooter>
          <p className="text-[11px] text-center text-muted-foreground">Paid from your Navagraha wallet. <Link href="/wallet"><span className="text-nava-royal-purple font-medium">Recharge</span></Link> if needed.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
