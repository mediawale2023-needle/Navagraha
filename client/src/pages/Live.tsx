import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Radio, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';

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
    <div>
      <PageHeader title="Live now" back={{ href: "/", label: "Today" }} />

      <div className="w-full max-w-[1320px] mx-auto px-4 md:px-10 py-6">
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
                    <AvatarFallback className="font-display text-2xl bg-ink text-primary">{s.astrologerName?.[0] || 'A'}</AvatarFallback>
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
