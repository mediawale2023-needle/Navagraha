/**
 * Consumer Palmistry — Vela-style funnel:
 * guide → capture → line overlay proof → free teaser → wallet unlock.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Camera, ImagePlus, Lock, RefreshCw, Sparkles, Hand, CheckCircle2 } from 'lucide-react';

type Step = 'guide' | 'capture' | 'analyzing' | 'proof' | 'teaser' | 'full';

type PolyPoint = { x: number; y: number };
type PalmExtract = {
  hand: string;
  confidence: number;
  quality: { lighting: string; blur: string; framing: string; notes?: string };
  lines: Record<string, { clarity: string; length: string; breaks: boolean; forks: boolean; note?: string; polyline: PolyPoint[] }>;
  mounts: Record<string, { development: string; note?: string }>;
};
type PalmTeaser = {
  free: { area: string; title: string; blurb: string }[];
  locked: { area: string; title: string; hint: string }[];
  lineCount: number;
};

const LINE_COLORS: Record<string, string> = {
  life: '#e8a87c',
  head: '#85d4c4',
  heart: '#e27d60',
  fate: '#c38d9e',
};

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return reject(new Error('Could not read image'));
      resolve({ mimeType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function PalmOverlay({
  src,
  extract,
  compact,
}: {
  src: string;
  extract: PalmExtract;
  compact?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-black/40 ${compact ? 'rounded-xl' : 'rounded-2xl'}`}>
      <img src={src} alt="Your palm" className={`w-full object-cover ${compact ? 'h-28' : 'max-h-[70vh]'}`} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {Object.entries(extract.lines || {}).map(([name, line]) => {
          if (!line?.polyline?.length) return null;
          const d = line.polyline.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <path
              key={name}
              d={d}
              fill="none"
              stroke={LINE_COLORS[name] || '#fff'}
              strokeWidth={compact ? 0.012 : 0.008}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function Palmistry() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('guide');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [extract, setExtract] = useState<PalmExtract | null>(null);
  const [teaser, setTeaser] = useState<PalmTeaser | null>(null);
  const [fullReading, setFullReading] = useState<string | null>(null);
  const [unlockPrice, setUnlockPrice] = useState(199);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: kundlis } = useQuery<any[]>({
    queryKey: ['/api/kundli'],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    apiRequest<{ unlockPriceInr: number }>('GET', '/api/palmistry/price')
      .then((p) => setUnlockPrice(p.unlockPriceInr))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!cameraOn || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [cameraOn]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setStep('capture');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // Attach after paint so video element exists
      requestAnimationFrame(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            /* autoplay can fail; still show frame */
          }
        }
      });
    } catch {
      setCameraOn(false);
      setCameraError('Camera permission needed — or choose an existing photo.');
    }
  };

  const analyzeBlob = async (blob: Blob, mimeType: string) => {
    setBusy(true);
    setStep('analyzing');
    try {
      const file = new File([blob], 'palm.jpg', { type: mimeType });
      const { base64, mimeType: mime } = await fileToBase64(file);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      stopCamera();

      const data = await apiRequest<any>('POST', '/api/palmistry/analyze', {
        imageBase64: base64,
        mimeType: mime,
        hand: 'left',
        language: 'English',
      });
      setReadingId(data.readingId);
      setClaimToken(data.claimToken);
      setExtract(data.extract);
      setTeaser(data.teaser);
      setUnlockPrice(data.unlockPriceInr || 199);
      setStep('proof');
      try {
        sessionStorage.setItem(
          `palm:${data.readingId}`,
          JSON.stringify({ claimToken: data.claimToken, previewUrl: url }),
        );
      } catch {}
    } catch (err: any) {
      const msg = String(err?.message || '').replace(/^\d{3}:\s*/, '');
      toast({
        title: 'Retake needed',
        description: msg || 'Could not map your palm lines. Try brighter light.',
        variant: 'destructive',
      });
      setStep('guide');
    } finally {
      setBusy(false);
    }
  };

  const captureFromVideo = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) analyzeBlob(blob, 'image/jpeg');
    }, 'image/jpeg', 0.92);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Use a photo', description: 'Please choose an image of your left palm.', variant: 'destructive' });
      return;
    }
    await analyzeBlob(file, file.type);
  };

  const unlock = async () => {
    if (!readingId || !claimToken) return;
    if (!isAuthenticated) {
      toast({ title: 'Sign in to unlock', description: 'Create a free account, recharge wallet, then unlock your private report.' });
      setLocation('/');
      return;
    }
    setBusy(true);
    try {
      const kundliId = kundlis?.[0]?.id;
      const data = await apiRequest<any>('POST', `/api/palmistry/${readingId}/unlock`, {
        claimToken,
        kundliId,
      });
      setFullReading(data.reading);
      setStep('full');
      toast({ title: 'Report unlocked', description: 'Your private palm reading is ready.' });
    } catch (err: any) {
      const raw = String(err?.message || '');
      if (raw.includes('402') || /Insufficient/i.test(raw)) {
        toast({
          title: 'Add wallet balance',
          description: `Unlock costs ₹${unlockPrice}. Recharge and try again.`,
          variant: 'destructive',
        });
        setLocation('/wallet');
      } else {
        toast({
          title: 'Unlock failed',
          description: raw.replace(/^\d{3}:\s*/, '') || 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yantra-shell min-h-screen pb-24 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Private reading</p>
            <h1 className="font-display text-xl leading-none">Palm</h1>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Hand className="h-3.5 w-3.5" /> Left palm
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {step !== 'guide' && step !== 'capture' && previewUrl && extract && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-2.5">
            <div className="w-16 shrink-0 overflow-hidden rounded-xl">
              <PalmOverlay src={previewUrl} extract={extract} compact />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Using your palm scan</p>
              <p className="truncate text-xs text-muted-foreground">
                {teaser?.lineCount ?? 0} major lines mapped · confidence {Math.round((extract.confidence || 0) * 100)}%
              </p>
            </div>
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          </div>
        )}

        {step === 'guide' && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Left palm · lines facing camera</p>
              <h2 className="mt-2 font-display text-3xl leading-tight">A reading prepared for you alone</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The live camera preview stays on your device. Only the photo you confirm is sent securely for line detection.
              </p>
            </div>
            <ol className="space-y-3">
              {[
                'All five fingers inside the frame',
                'Bright, even light',
                'Hold still and straight',
              ].map((rule, i) => (
                <li key={rule} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/50 px-4 py-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                  {rule}
                </li>
              ))}
            </ol>
            <div className="space-y-3">
              <Button className="h-12 w-full gap-2 text-base" onClick={startCamera}>
                <Camera className="h-4 w-4" /> Take palm photo
              </Button>
              <Button variant="outline" className="h-11 w-full gap-2" onClick={() => { setStep('capture'); fileRef.current?.click(); }}>
                <ImagePlus className="h-4 w-4" /> Choose an existing photo
              </Button>
            </div>
          </div>
        )}

        {step === 'capture' && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-black">
              {cameraOn ? (
                <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full object-cover" />
              ) : (
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                  <Camera className="h-8 w-8 opacity-50" />
                  {cameraError || 'Camera not active — choose a photo instead.'}
                </div>
              )}
            </div>
            {cameraError && <p className="text-xs text-amber-600">{cameraError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => { stopCamera(); setStep('guide'); }}>Back</Button>
              {cameraOn ? (
                <Button onClick={captureFromVideo} disabled={busy}>Capture</Button>
              ) : (
                <Button onClick={() => fileRef.current?.click()} disabled={busy}>Upload photo</Button>
              )}
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <div>
              <p className="font-display text-2xl">Mapping your lines</p>
              <p className="mt-1 text-sm text-muted-foreground">Detecting Life, Head, Heart and Fate creases…</p>
            </div>
          </div>
        )}

        {step === 'proof' && previewUrl && extract && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Palm proof</p>
              <h2 className="mt-1 font-display text-3xl">Your lines, mapped</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Soft traces show what we detected. Retake if a major line is missing.
              </p>
            </div>
            <PalmOverlay src={previewUrl} extract={extract} />
            <div className="flex flex-wrap gap-2">
              {Object.keys(extract.lines || {}).map((name) => (
                <Badge key={name} variant="outline" className="capitalize" style={{ borderColor: LINE_COLORS[name] }}>
                  {name}
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="gap-2" onClick={() => { setStep('guide'); setExtract(null); }}>
                <RefreshCw className="h-4 w-4" /> Retake
              </Button>
              <Button className="gap-2" onClick={() => setStep('teaser')}>
                Continue <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'teaser' && teaser && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Begins free</p>
              <h2 className="mt-1 font-display text-3xl">First answers from your palm</h2>
            </div>
            <div className="space-y-3">
              {teaser.free.map((card) => (
                <article key={card.area} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{card.area}</p>
                  <h3 className="mt-1 font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{card.blurb}</p>
                </article>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold">Private answers (locked)</p>
              {teaser.locked.map((card) => (
                <article key={card.area} className="relative overflow-hidden rounded-2xl border border-border/50 bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{card.area}</p>
                      <h3 className="mt-1 font-semibold">{card.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground blur-[3px] select-none">{card.hint}</p>
                    </div>
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </article>
              ))}
            </div>
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="font-display text-2xl">Unlock full private report</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete Hast Rekha guidance{isAuthenticated && kundlis?.[0] ? ' fused with your saved chart' : ''}.
              </p>
              <Button className="mt-4 h-12 w-full gap-2" onClick={unlock} disabled={busy}>
                {busy ? 'Unlocking…' : `Unlock for ₹${unlockPrice}`}
              </Button>
              {!isAuthenticated && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  You’ll sign in and use wallet balance. <Link href="/wallet" className="underline">Wallet</Link>
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'full' && fullReading && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-semibold">Unlocked · prepared for you alone</span>
            </div>
            <article className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-card/60 p-5 text-sm leading-relaxed">
              {fullReading}
            </article>
            <Button variant="outline" className="w-full" onClick={() => setLocation('/kundli')}>
              Link another chart later
            </Button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </main>
    </div>
  );
}
