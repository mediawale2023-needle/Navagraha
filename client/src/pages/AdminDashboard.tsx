import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Users, Star, BookOpen, IndianRupee, Activity, Wifi, WifiOff } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface AdminStats {
  users: number;
  kundlis: number;
  astrologers: number;
  onlineAstrologers: number;
  consultations: number;
  totalRevenue: number;
}

interface Astrologer {
  id: string;
  name: string;
  email: string;
  specializations: string[];
  pricePerMinute: string;
  isOnline: boolean;
  isVerified: boolean;
  rating: string;
  totalConsultations: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-full ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    refetchInterval: 30000,
  });

  const { data: astrologers = [], isLoading: astroLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/admin/astrologers'],
  });

  const toggleVerifyMutation = useMutation({
    mutationFn: async ({ id, isVerified }: { id: string; isVerified: boolean }) => {
      return apiRequest('PUT', `/api/admin/astrologers/${id}`, { isVerified: !isVerified });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/astrologers'] });
    },
  });

  const filtered = astrologers.filter(
    (a) =>
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email?.toLowerCase().includes(search.toLowerCase()),
  );

  if (statsLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Platform overview &amp; management</p>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-600">
            Developer Access
          </Badge>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats?.users ?? 0}
            color="bg-blue-500"
          />
          <StatCard
            icon={BookOpen}
            label="Kundlis"
            value={stats?.kundlis ?? 0}
            color="bg-purple-500"
          />
          <StatCard
            icon={Star}
            label="Astrologers"
            value={stats?.astrologers ?? 0}
            sub={`${stats?.onlineAstrologers ?? 0} online`}
            color="bg-amber-500"
          />
          <StatCard
            icon={Activity}
            label="Consultations"
            value={stats?.consultations ?? 0}
            color="bg-green-500"
          />
          <StatCard
            icon={IndianRupee}
            label="Total Revenue"
            value={`₹${((stats?.totalRevenue ?? 0)).toLocaleString('en-IN')}`}
            color="bg-rose-500"
          />
          <StatCard
            icon={Wifi}
            label="Online Now"
            value={stats?.onlineAstrologers ?? 0}
            sub="astrologers"
            color="bg-teal-500"
          />
        </div>

        {/* Astrologer Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Astrologer Management</CardTitle>
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            {astroLoading ? (
              <LoadingSpinner />
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No astrologers found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-3 pr-4 font-medium">Name</th>
                      <th className="text-left py-3 pr-4 font-medium">Email</th>
                      <th className="text-left py-3 pr-4 font-medium">Specializations</th>
                      <th className="text-left py-3 pr-4 font-medium">Rate/min</th>
                      <th className="text-left py-3 pr-4 font-medium">Rating</th>
                      <th className="text-left py-3 pr-4 font-medium">Status</th>
                      <th className="text-left py-3 font-medium">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4 font-medium">{a.name}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{a.email}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {(a.specializations || []).slice(0, 2).map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 pr-4">₹{a.pricePerMinute}/min</td>
                        <td className="py-3 pr-4">⭐ {parseFloat(a.rating || '0').toFixed(1)}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1">
                            {a.isOnline ? (
                              <Wifi className="w-3 h-3 text-green-500" />
                            ) : (
                              <WifiOff className="w-3 h-3 text-gray-400" />
                            )}
                            <span className={a.isOnline ? 'text-green-600' : 'text-gray-400'}>
                              {a.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3">
                          <Button
                            size="sm"
                            variant={a.isVerified ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            onClick={() =>
                              toggleVerifyMutation.mutate({ id: a.id, isVerified: a.isVerified })
                            }
                            disabled={toggleVerifyMutation.isPending}
                          >
                            {a.isVerified ? 'Verified' : 'Unverified'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
