import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
  Users, Star, BookOpen, IndianRupee, Activity, Wifi, WifiOff,
  ChevronUp, ChevronDown, Plus, Trash2, Eye, EyeOff, Pencil, X, Check,
  LayoutDashboard, FileText,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

/* ═══════════════════════════════════════════════════════ */
/*  Types                                                 */
/* ═══════════════════════════════════════════════════════ */

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

interface ContentItem {
  id: string;
  section: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  href: string | null;
  gradient: string | null;
  cta: string | null;
  sortOrder: number;
  enabled: boolean;
}

/* ═══════════════════════════════════════════════════════ */
/*  Icon list for picker                                  */
/* ═══════════════════════════════════════════════════════ */

const ICON_OPTIONS = [
  'MessageCircle', 'Phone', 'Calendar', 'Zap', 'Heart', 'Scale',
  'Scroll', 'Sun', 'Moon', 'Star', 'Users', 'Video', 'Sparkles',
  'Hash', 'Activity', 'TrendingUp', 'Wallet', 'BookOpen',
];

/* ═══════════════════════════════════════════════════════ */
/*  StatCard component                                    */
/* ═══════════════════════════════════════════════════════ */

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
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

/* ═══════════════════════════════════════════════════════ */
/*  ContentEditor sub-component                           */
/* ═══════════════════════════════════════════════════════ */

function ContentEditor() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ContentItem>>({});
  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<ContentItem>>({ enabled: true });

  const { data: items = [], isLoading } = useQuery<ContentItem[]>({
    queryKey: ['/api/admin/homepage-content'],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ContentItem> & { id: string }) => {
      return apiRequest('PUT', `/api/admin/homepage-content/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/homepage-content'] });
      setEditingId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<ContentItem>) => {
      return apiRequest('POST', '/api/admin/homepage-content', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/homepage-content'] });
      setAddingSection(null);
      setNewItem({ enabled: true });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/homepage-content/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/homepage-content'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderItems: { id: string; sortOrder: number }[]) => {
      return apiRequest('PUT', '/api/admin/homepage-content-reorder', { items: reorderItems });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/homepage-content'] });
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const sections = [
    { key: 'banner', label: 'Banners', desc: 'Hero carousel cards on the homepage' },
    { key: 'service', label: 'Astrology Services', desc: 'Paid service cards (2×2 grid)' },
    { key: 'free_service', label: 'Free Services', desc: 'Free feature cards with icons' },
  ];

  const moveItem = (sectionItems: ContentItem[], idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sectionItems.length) return;
    const reordered = sectionItems.map((item, i) => ({
      id: item.id,
      sortOrder: i === idx ? sectionItems[target].sortOrder : i === target ? sectionItems[idx].sortOrder : item.sortOrder,
    }));
    reorderMutation.mutate(reordered);
  };

  const startEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, ...editForm });
  };

  return (
    <div className="space-y-6">
      {sections.map(({ key, label, desc }) => {
        const sectionItems = items
          .filter(i => i.section === key)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => { setAddingSection(key); setNewItem({ section: key, enabled: true, sortOrder: sectionItems.length }); }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sectionItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No items yet. Click "Add" to create one.</p>
              )}

              {sectionItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 ${!item.enabled ? 'opacity-50' : ''} ${editingId === item.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  {editingId === item.id ? (
                    /* ── Edit Mode ── */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Title</label>
                          <Input value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Link (href)</label>
                          <Input value={editForm.href || ''} onChange={e => setEditForm(f => ({ ...f, href: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Subtitle</label>
                        <Input value={editForm.subtitle || ''} onChange={e => setEditForm(f => ({ ...f, subtitle: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Icon</label>
                          <select
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={editForm.icon || ''}
                            onChange={e => setEditForm(f => ({ ...f, icon: e.target.value }))}
                          >
                            <option value="">None</option>
                            {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Gradient</label>
                          <Input value={editForm.gradient || ''} onChange={e => setEditForm(f => ({ ...f, gradient: e.target.value }))} placeholder="CSS gradient class" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">CTA Text</label>
                          <Input value={editForm.cta || ''} onChange={e => setEditForm(f => ({ ...f, cta: e.target.value }))} placeholder="Button text" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="gap-1">
                          <Check className="w-3.5 h-3.5" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── View Mode ── */
                    <div className="flex items-center gap-3">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveItem(sectionItems, idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-muted disabled:opacity-20"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveItem(sectionItems, idx, 1)}
                          disabled={idx === sectionItems.length - 1}
                          className="p-0.5 rounded hover:bg-muted disabled:opacity-20"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{item.title}</span>
                          {item.icon && <Badge variant="secondary" className="text-[10px] font-mono">{item.icon}</Badge>}
                        </div>
                        {item.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>}
                        {item.href && <p className="text-[10px] text-blue-500 font-mono mt-0.5">{item.href}</p>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateMutation.mutate({ id: item.id, enabled: !item.enabled })}
                          className="p-1.5 rounded-md hover:bg-muted"
                          title={item.enabled ? 'Disable' : 'Enable'}
                        >
                          {item.enabled ? <Eye className="w-3.5 h-3.5 text-green-500" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <button onClick={() => startEdit(item)} className="p-1.5 rounded-md hover:bg-muted" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('Delete this item?')) deleteMutation.mutate(item.id); }}
                          className="p-1.5 rounded-md hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new item form */}
              {addingSection === key && (
                <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-primary">New {label.replace(/s$/, '')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Title *</label>
                      <Input value={newItem.title || ''} onChange={e => setNewItem(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Link (href)</label>
                      <Input value={newItem.href || ''} onChange={e => setNewItem(f => ({ ...f, href: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Subtitle</label>
                    <Input value={newItem.subtitle || ''} onChange={e => setNewItem(f => ({ ...f, subtitle: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Icon</label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={newItem.icon || ''}
                        onChange={e => setNewItem(f => ({ ...f, icon: e.target.value }))}
                      >
                        <option value="">None</option>
                        {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Gradient</label>
                      <Input value={newItem.gradient || ''} onChange={e => setNewItem(f => ({ ...f, gradient: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">CTA Text</label>
                      <Input value={newItem.cta || ''} onChange={e => setNewItem(f => ({ ...f, cta: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => createMutation.mutate(newItem)} disabled={!newItem.title || createMutation.isPending} className="gap-1">
                      <Check className="w-3.5 h-3.5" /> Create
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingSection(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/*  Main AdminDashboard                                   */
/* ═══════════════════════════════════════════════════════ */

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'content'>('overview');

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

      {/* Tab Bar */}
      <div className="border-b border-border bg-card px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'content'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <FileText className="w-4 h-4" /> Content
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={Users} label="Total Users" value={stats?.users ?? 0} color="bg-blue-500" />
              <StatCard icon={BookOpen} label="Kundlis" value={stats?.kundlis ?? 0} color="bg-purple-500" />
              <StatCard icon={Star} label="Astrologers" value={stats?.astrologers ?? 0} sub={`${stats?.onlineAstrologers ?? 0} online`} color="bg-amber-500" />
              <StatCard icon={Activity} label="Consultations" value={stats?.consultations ?? 0} color="bg-green-500" />
              <StatCard icon={IndianRupee} label="Total Revenue" value={`₹${((stats?.totalRevenue ?? 0)).toLocaleString('en-IN')}`} color="bg-rose-500" />
              <StatCard icon={Wifi} label="Online Now" value={stats?.onlineAstrologers ?? 0} sub="astrologers" color="bg-teal-500" />
            </div>

            {/* Astrologer Management */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle>Astrologer Management</CardTitle>
                  <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
                </div>
              </CardHeader>
              <CardContent>
                {astroLoading ? (
                  <LoadingSpinner />
                ) : filtered.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No astrologers found.</p>
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
                                {a.isOnline ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-gray-400" />}
                                <span className={a.isOnline ? 'text-green-600' : 'text-gray-400'}>{a.isOnline ? 'Online' : 'Offline'}</span>
                              </div>
                            </td>
                            <td className="py-3">
                              <Button
                                size="sm"
                                variant={a.isVerified ? 'default' : 'outline'}
                                className="h-7 text-xs"
                                onClick={() => toggleVerifyMutation.mutate({ id: a.id, isVerified: a.isVerified })}
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
          </>
        )}

        {activeTab === 'content' && <ContentEditor />}

      </div>
    </div>
  );
}
