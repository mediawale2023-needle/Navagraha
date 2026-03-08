import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
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
    <div className="min-h-screen bg-background text-white pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-white/5 ">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-xl hover:bg-white/5/10">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            </Link>
            <div>
              <h1 className="font-bold text-lg text-white">Numerology</h1>
              <p className="text-xs text-white/60">Discover the power of your numbers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Hero */}
        {!result && (
          <div className="bg-gradient-to-br from-[#7B2FBE] to-[#5B1F8E] rounded-2xl p-6 mb-6 text-center">
            <Hash className="w-12 h-12 text-white mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white mb-2">Your Life by Numbers</h2>
            <p className="text-sm text-white/70 max-w-sm mx-auto">
              Uncover your life path, destiny, soul urge, and personality numbers based on Pythagorean numerology.
            </p>
          </div>
        )}

        {/* Form */}
        <Card className="mb-6  border-white/5">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-white mb-1.5 block">First Name *</Label>
                  <Input
                    placeholder="e.g. Priya"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="rounded-xl border-white/10 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-white mb-1.5 block">Last Name</Label>
                  <Input
                    placeholder="e.g. Sharma"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="rounded-xl border-white/10 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-white mb-1.5 block">Date of Birth *</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="rounded-xl border-white/10 focus:border-orange-500 focus:ring-orange-500"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-white mb-2 block">System</Label>
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
                        ? 'border-orange-600 gradient-primary text-white'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-[var(--rose)]/30'
                        }`}
                    >
                      <div className={`font-semibold text-sm ${form.system === sys.value ? 'text-white' : 'text-white'}`}>{sys.label}</div>
                      <div className={`text-xs mt-0.5 ${form.system === sys.value ? 'text-white/70' : 'text-gray-500'}`}>{sys.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full gradient-primary hover:opacity-90 text-white font-bold h-12 rounded-xl"
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
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-5 text-white text-center">
              <p className="text-orange-400 text-sm font-semibold mb-1">Numerology Report for</p>
              <h3 className="text-2xl font-bold mb-3">{result.name}</h3>
              <div className="flex justify-center gap-6">
                <div>
                  <div className="text-4xl font-black text-orange-400">{result.lifePath}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Life Path</div>
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
            <Card className=" border-white/5">
              <CardContent className="p-5">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--rose)]" /> Understanding Your Numbers
                </h4>
                <div className="space-y-3 text-sm text-gray-400">
                  <div className="flex gap-2"><span className="font-semibold text-white min-w-[140px]">Life Path ({result.lifePath}):</span> Your core purpose and the journey you're destined to take in this lifetime.</div>
                  <div className="flex gap-2"><span className="font-semibold text-white min-w-[140px]">Destiny ({result.destiny}):</span> What you're meant to accomplish and the role you play in the world.</div>
                  <div className="flex gap-2"><span className="font-semibold text-white min-w-[140px]">Soul Urge ({result.soul}):</span> Your innermost desires, motivations, and what truly makes you happy.</div>
                  <div className="flex gap-2"><span className="font-semibold text-white min-w-[140px]">Personality ({result.personality}):</span> How others perceive you and the face you show the world.</div>
                  <div className="flex gap-2"><span className="font-semibold text-white min-w-[140px]">Birthday ({result.birthday}):</span> A special talent or gift bestowed upon you at birth.</div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-gradient-to-r from-[var(--rose)] to-[#7B2FBE] rounded-2xl p-4 text-center">
              <p className="text-sm text-white/90 mb-3">Want a deeper numerology reading from an expert?</p>
              <Link href="/astrologers">
                <Button className="bg-white/5 text-[var(--rose)] hover:bg-white/5/90 font-bold rounded-xl gap-2">
                  Talk to an Astrologer <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <Button
              variant="outline"
              className="w-full border-white/10 rounded-xl"
              onClick={() => { setResult(null); setForm({ firstName: '', lastName: '', dateOfBirth: '', system: 'pythagorean' }); }}
            >
              Calculate for Someone Else
            </Button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
