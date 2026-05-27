import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, Hash, Star, Sparkles, Heart,
  TrendingUp, User, Calendar, ChevronRight, Loader2
} from 'lucide-react';

interface NumerologyResult {
  lifePath: number;
  destiny: number;
  soul: number;
  personality: number;
  birthday: number;
  name: string;
}

const NUMBER_MEANINGS: Record<number, { title: string; description: string; traits: string[] }> = {
  1: { title: 'The Leader', description: 'Independent, ambitious, and original. Born to lead and pioneer new paths.', traits: ['Leadership', 'Independence', 'Ambition'] },
  2: { title: 'The Peacemaker', description: 'Cooperative, sensitive, and diplomatic. Gifted in relationships and partnerships.', traits: ['Harmony', 'Sensitivity', 'Diplomacy'] },
  3: { title: 'The Creator', description: 'Creative, expressive, and social. Natural talent for communication and arts.', traits: ['Creativity', 'Expression', 'Joy'] },
  4: { title: 'The Builder', description: 'Practical, disciplined, and reliable. Creates solid foundations for lasting success.', traits: ['Stability', 'Discipline', 'Reliability'] },
  5: { title: 'The Freedom Seeker', description: 'Adventurous, versatile, and progressive. Thrives on change and new experiences.', traits: ['Freedom', 'Adventure', 'Versatility'] },
  6: { title: 'The Nurturer', description: 'Caring, responsible, and loving. Devoted to family, home, and service to others.', traits: ['Nurturing', 'Responsibility', 'Love'] },
  7: { title: 'The Seeker', description: 'Analytical, introspective, and spiritual. Drawn to deep knowledge and wisdom.', traits: ['Wisdom', 'Analysis', 'Spirituality'] },
  8: { title: 'The Achiever', description: 'Powerful, ambitious, and business-minded. Natural talent for wealth and authority.', traits: ['Power', 'Abundance', 'Authority'] },
  9: { title: 'The Humanitarian', description: 'Compassionate, idealistic, and generous. Devoted to serving humanity.', traits: ['Compassion', 'Idealism', 'Generosity'] },
  11: { title: 'The Intuitive (Master)', description: 'Highly intuitive, inspirational, and spiritual. A master number of enlightenment.', traits: ['Intuition', 'Inspiration', 'Illumination'] },
  22: { title: 'The Master Builder', description: 'The most powerful master number. Ability to manifest large-scale dreams.', traits: ['Vision', 'Manifestation', 'Mastery'] },
  33: { title: 'The Master Teacher', description: 'The master of compassion. Called to uplift and serve on a global scale.', traits: ['Compassion', 'Teaching', 'Healing'] },
};

const CARD_THEMES: Record<string, { border: string; iconBg: string; iconText: string; traitBg: string; traitBorder: string }> = {
  'Life Path Number': { border: 'border-white/10', iconBg: 'bg-[var(--rose)]/10', iconText: 'text-[var(--rose)]', traitBg: 'bg-[var(--rose)]/5', traitBorder: 'border-white/10' },
  'Destiny Number': { border: 'border-indigo-200', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', traitBg: 'bg-indigo-50', traitBorder: 'border-indigo-200' },
  'Soul Urge Number': { border: 'border-rose-200', iconBg: 'bg-rose-100', iconText: 'text-rose-600', traitBg: 'bg-rose-50', traitBorder: 'border-rose-200' },
  'Personality Number': { border: 'border-green-200', iconBg: 'bg-green-500/10', iconText: 'text-green-600', traitBg: 'bg-green-50', traitBorder: 'border-green-200' },
  'Birthday Number': { border: 'border-purple-200', iconBg: 'bg-purple-100', iconText: 'text-purple-600', traitBg: 'bg-purple-50', traitBorder: 'border-purple-200' },
};

function NumberCard({ label, number, icon: Icon }: { label: string; number: number; icon: any }) {
  const meaning = NUMBER_MEANINGS[number] || NUMBER_MEANINGS[9];
  const theme = CARD_THEMES[label] || CARD_THEMES['Life Path Number'];
  return (
    <div className={`bg-white/5 rounded-2xl p-4  border ${theme.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 ${theme.iconBg} rounded-lg flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${theme.iconText}`} />
          </div>
          <span className="text-sm font-semibold text-gray-400">{label}</span>
        </div>
        <div className="text-3xl font-bold text-white">{number}</div>
      </div>
      <p className="text-xs font-bold text-white mb-1">{meaning.title}</p>
      <p className="text-xs text-gray-500 leading-relaxed mb-2">{meaning.description}</p>
      <div className="flex flex-wrap gap-1">
        {meaning.traits.map(t => (
          <span key={t} className={`px-2 py-0.5 ${theme.traitBg} border ${theme.traitBorder} text-white text-xs rounded-full font-medium`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Numerology() {
  const [form, setForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', system: 'pythagorean' });
  const [result, setResult] = useState<NumerologyResult | null>(null);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest('POST', '/api/numerology', data);
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to calculate numerology', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.dateOfBirth) {
      toast({ title: 'Required', description: 'Please enter your name and date of birth', variant: 'destructive' });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="yantra-shell min-h-screen pb-20 text-foreground md:pb-0">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <div>
              <h1 className="font-display text-xl text-foreground">Numerology</h1>
              <p className="text-xs text-muted-foreground">Discover the power of your numbers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Hero */}
        {!result && (
          <div className="mb-6 rounded-[12px] border border-[var(--primary-border)] bg-primary p-6 text-center text-[var(--nava-navy)]">
            <Hash className="mx-auto mb-3 h-12 w-12 text-[var(--nava-navy)]" />
            <h2 className="font-display text-2xl mb-2">Your Life by Numbers</h2>
            <p className="mx-auto max-w-sm text-sm text-[var(--nava-navy)]/70">
              Uncover your life path, destiny, soul urge, and personality numbers based on Pythagorean numerology.
            </p>
          </div>
        )}

        {/* Form */}
        <Card className="yantra-card mb-6">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-sm font-semibold text-foreground">First Name *</Label>
                  <Input
                    placeholder="e.g. Priya"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="rounded-[10px]"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-sm font-semibold text-foreground">Last Name</Label>
                  <Input
                    placeholder="e.g. Sharma"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="rounded-[10px]"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm font-semibold text-foreground">Date of Birth *</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="rounded-[10px]"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm font-semibold text-foreground">System</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'pythagorean', label: 'Pythagorean', desc: 'Most popular Western system' },
                    { value: 'chaldean', label: 'Chaldean', desc: 'Ancient Babylonian system' },
                  ].map(sys => (
                    <button
                      key={sys.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, system: sys.value }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${form.system === sys.value
                        ? 'border-[var(--primary-border)] bg-primary text-[var(--nava-navy)]'
                        : 'border-border bg-card text-muted-foreground hover:border-[var(--primary-border)]/30'
                        }`}
                    >
                      <div className="text-sm font-semibold text-foreground">{sys.label}</div>
                      <div className={`mt-0.5 text-xs ${form.system === sys.value ? 'text-[var(--nava-navy)]/70' : 'text-muted-foreground'}`}>{sys.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="h-12 w-full rounded-[9px] bg-primary font-bold text-primary-foreground hover:bg-primary/90"
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculating...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Calculate My Numbers</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="rounded-[12px] bg-nava-navy p-5 text-center text-primary">
              <p className="mb-1 text-sm font-semibold text-primary/80">Numerology Report for</p>
              <h3 className="font-display mb-3 text-3xl">{result.name}</h3>
              <div className="flex justify-center gap-6">
                <div>
                  <div className="font-display text-4xl text-primary">{result.lifePath}</div>
                  <div className="mt-0.5 text-xs text-primary/70">Life Path</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberCard label="Life Path Number" number={result.lifePath} icon={Star} />
              <NumberCard label="Destiny Number" number={result.destiny} icon={TrendingUp} />
              <NumberCard label="Soul Urge Number" number={result.soul} icon={Heart} />
              <NumberCard label="Personality Number" number={result.personality} icon={User} />
              <NumberCard label="Birthday Number" number={result.birthday} icon={Calendar} />
            </div>

            {/* What is life path */}
            <Card className="yantra-card">
              <CardContent className="p-5">
                <h4 className="mb-3 flex items-center gap-2 font-display text-foreground">
                  <Sparkles className="w-4 h-4 text-[var(--primary-border)]" /> Understanding Your Numbers
                </h4>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex gap-2"><span className="min-w-[140px] font-semibold text-foreground">Life Path ({result.lifePath}):</span> Your core purpose and the journey you're destined to take in this lifetime.</div>
                  <div className="flex gap-2"><span className="min-w-[140px] font-semibold text-foreground">Destiny ({result.destiny}):</span> What you're meant to accomplish and the role you play in the world.</div>
                  <div className="flex gap-2"><span className="min-w-[140px] font-semibold text-foreground">Soul Urge ({result.soul}):</span> Your innermost desires, motivations, and what truly makes you happy.</div>
                  <div className="flex gap-2"><span className="min-w-[140px] font-semibold text-foreground">Personality ({result.personality}):</span> How others perceive you and the face you show the world.</div>
                  <div className="flex gap-2"><span className="min-w-[140px] font-semibold text-foreground">Birthday ({result.birthday}):</span> A special talent or gift bestowed upon you at birth.</div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-[12px] bg-primary p-4 text-center text-[var(--nava-navy)]">
              <p className="mb-3 text-sm text-[var(--nava-navy)]/85">Want a deeper numerology reading from an expert?</p>
              <Link href="/astrologers">
                <Button className="gap-2 rounded-[9px] bg-nava-navy font-bold text-primary hover:bg-nava-navy/90">
                  Talk to an Astrologer <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <Button
              variant="outline"
              className="w-full rounded-[9px]"
              onClick={() => { setResult(null); setForm({ firstName: '', lastName: '', dateOfBirth: '', system: 'pythagorean' }); }}
            >
              Calculate for Someone Else
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
