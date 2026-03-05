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
  lifePath:    number;
  destiny:     number;
  soul:        number;
  personality: number;
  birthday:    number;
  name:        string;
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

function NumberCard({ label, number, icon: Icon }: { label: string; number: number; icon: any }) {
  const meaning = NUMBER_MEANINGS[number] || NUMBER_MEANINGS[9];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#FFCF23] rounded-lg flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#1A1A1A]" />
          </div>
          <span className="text-sm font-semibold text-gray-600">{label}</span>
        </div>
        <div className="text-3xl font-bold text-[#1A1A1A]">{number}</div>
      </div>
      <p className="text-xs font-bold text-[#1A1A1A] mb-1">{meaning.title}</p>
      <p className="text-xs text-gray-500 leading-relaxed mb-2">{meaning.description}</p>
      <div className="flex flex-wrap gap-1">
        {meaning.traits.map(t => (
          <span key={t} className="px-2 py-0.5 bg-[#FFFBEA] border border-[#FFCF23]/40 text-[#1A1A1A] text-xs rounded-full font-medium">
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
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#FFCF23] shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-xl hover:bg-[#1A1A1A]/10">
                <ArrowLeft className="w-5 h-5 text-[#1A1A1A]" />
              </button>
            </Link>
            <div>
              <h1 className="font-bold text-lg text-[#1A1A1A]">Numerology</h1>
              <p className="text-xs text-[#1A1A1A]/60">Discover the power of your numbers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Hero */}
        {!result && (
          <div className="bg-gradient-to-br from-[#FFCF23] to-[#FFD93D] rounded-2xl p-6 mb-6 text-center">
            <Hash className="w-12 h-12 text-[#1A1A1A] mx-auto mb-3" />
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Your Life by Numbers</h2>
            <p className="text-sm text-[#1A1A1A]/70 max-w-sm mx-auto">
              Uncover your life path, destiny, soul urge, and personality numbers based on Pythagorean numerology.
            </p>
          </div>
        )}

        {/* Form */}
        <Card className="mb-6 shadow-sm border-gray-100">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-[#1A1A1A] mb-1.5 block">First Name *</Label>
                  <Input
                    placeholder="e.g. Priya"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="rounded-xl border-gray-200 focus:border-[#FFCF23] focus:ring-[#FFCF23]"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-[#1A1A1A] mb-1.5 block">Last Name</Label>
                  <Input
                    placeholder="e.g. Sharma"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="rounded-xl border-gray-200 focus:border-[#FFCF23] focus:ring-[#FFCF23]"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#1A1A1A] mb-1.5 block">Date of Birth *</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="rounded-xl border-gray-200 focus:border-[#FFCF23] focus:ring-[#FFCF23]"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#1A1A1A] mb-2 block">System</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'pythagorean', label: 'Pythagorean', desc: 'Most popular Western system' },
                    { value: 'chaldean',    label: 'Chaldean',    desc: 'Ancient Babylonian system' },
                  ].map(sys => (
                    <button
                      key={sys.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, system: sys.value }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.system === sys.value
                          ? 'border-[#FFCF23] bg-[#FFFBEA]'
                          : 'border-gray-200 hover:border-[#FFCF23]/50'
                      }`}
                    >
                      <div className="font-semibold text-sm text-[#1A1A1A]">{sys.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{sys.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full bg-[#1A1A1A] text-[#FFCF23] hover:bg-[#333] font-bold h-12 rounded-xl"
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
            <div className="bg-[#1A1A1A] rounded-2xl p-5 text-white text-center">
              <p className="text-[#FFCF23] text-sm font-semibold mb-1">Numerology Report for</p>
              <h3 className="text-2xl font-bold mb-3">{result.name}</h3>
              <div className="flex justify-center gap-6">
                <div>
                  <div className="text-4xl font-black text-[#FFCF23]">{result.lifePath}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Life Path</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberCard label="Life Path Number"   number={result.lifePath}    icon={Star} />
              <NumberCard label="Destiny Number"     number={result.destiny}     icon={TrendingUp} />
              <NumberCard label="Soul Urge Number"   number={result.soul}        icon={Heart} />
              <NumberCard label="Personality Number" number={result.personality} icon={User} />
              <NumberCard label="Birthday Number"    number={result.birthday}    icon={Calendar} />
            </div>

            {/* What is life path */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-5">
                <h4 className="font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FFCF23]" /> Understanding Your Numbers
                </h4>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex gap-2"><span className="font-semibold text-[#1A1A1A] min-w-[140px]">Life Path ({result.lifePath}):</span> Your core purpose and the journey you're destined to take in this lifetime.</div>
                  <div className="flex gap-2"><span className="font-semibold text-[#1A1A1A] min-w-[140px]">Destiny ({result.destiny}):</span> What you're meant to accomplish and the role you play in the world.</div>
                  <div className="flex gap-2"><span className="font-semibold text-[#1A1A1A] min-w-[140px]">Soul Urge ({result.soul}):</span> Your innermost desires, motivations, and what truly makes you happy.</div>
                  <div className="flex gap-2"><span className="font-semibold text-[#1A1A1A] min-w-[140px]">Personality ({result.personality}):</span> How others perceive you and the face you show the world.</div>
                  <div className="flex gap-2"><span className="font-semibold text-[#1A1A1A] min-w-[140px]">Birthday ({result.birthday}):</span> A special talent or gift bestowed upon you at birth.</div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-[#FFFBEA] border border-[#FFCF23]/30 rounded-2xl p-4 text-center">
              <p className="text-sm text-gray-600 mb-3">Want a deeper numerology reading from an expert?</p>
              <Link href="/astrologers">
                <Button className="bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] font-bold rounded-xl gap-2">
                  Talk to an Astrologer <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <Button
              variant="outline"
              className="w-full border-gray-200 rounded-xl"
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
