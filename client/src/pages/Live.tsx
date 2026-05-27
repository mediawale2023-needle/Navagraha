import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Radio, Eye } from 'lucide-react';

interface LiveStreamCard {
  id: string;
  title: string;
  viewerCount: number;
  astrologerName?: string;
  astrologerImage?: string;
  specializations?: string[] | null;
}

export default function Live() {
  const [, setLocation] = useLocation();
  const { data: streams, isLoading } = useQuery<LiveStreamCard[]>({
    queryKey: ['/api/live'],
    refetchInterval: 10000,
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="yantra-shell min-h-screen pb-24 text-foreground md:pb-8">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3 flex items-center gap-3">
          <Link href="/"><button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></button></Link>
          <h1 className="font-display text-xl flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500" /> Live Now
          </h1>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">
        {(!streams || streams.length === 0) ? (
          <div className="text-center py-20 text-muted-foreground">
            <Radio className="w-14 h-14 mx-auto mb-4 opacity-30" />
            <p className="font-medium">No live sessions right now</p>
            <p className="text-sm">Check back soon — our astrologers go live daily.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {streams.map((s) => (
              <Card
                key={s.id}
                className="yantra-card cursor-pointer overflow-hidden transition-shadow"
                onClick={() => setLocation(`/live/${s.id}`)}
                data-testid={`stream-${s.id}`}
              >
                <div className="relative aspect-[4/5] bg-gradient-to-br from-primary/40 to-background flex items-center justify-center">
                  <Avatar className="h-20 w-20 rounded-[8px] ring-4 ring-white/40">
                    <AvatarImage src={s.astrologerImage} />
                    <AvatarFallback className="font-display text-2xl bg-nava-navy text-primary">{s.astrologerName?.[0] || 'A'}</AvatarFallback>
                  </Avatar>
                  <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 gap-1 animate-pulse">
                    <Radio className="w-3 h-3" /> LIVE
                  </Badge>
                  <Badge className="absolute top-2 right-2 bg-black/50 text-white border-0 gap-1">
                    <Eye className="w-3 h-3" /> {s.viewerCount}
                  </Badge>
                </div>
                <CardContent className="p-3">
                  <p className="font-display text-base leading-tight line-clamp-1">{s.astrologerName}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
