import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
  ArrowLeft, User, Mail, Phone, Calendar,
  MapPin, Clock, Sparkles
} from 'lucide-react';
import type { User as UserType, Kundli } from '@shared/schema';

export default function Profile() {
  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: kundlis, isLoading: kundlisLoading } = useQuery<Kundli[]>({
    queryKey: ['/api/kundli'],
  });

  if (userLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-foreground">My Profile</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Profile Info Card */}
        <Card className="mb-6 bg-card border-border/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-nava-teal/30 to-nava-amber/30">
                <Avatar className="w-full h-full border-2 border-card">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} className="object-cover" />
                  <AvatarFallback className="bg-nava-navy text-white font-bold text-2xl">
                    {user?.firstName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {user?.firstName || user?.lastName
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : 'Anonymous User'}
                </h2>
                {user?.email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{user.email}</span>
                  </div>
                )}
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-full border-border" data-testid="button-edit-profile">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card rounded-2xl p-4 text-center border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-nava-teal/10 flex items-center justify-center mx-auto mb-2">
              <Sparkles className="w-5 h-5 text-nava-teal" />
            </div>
            <div className="text-2xl font-bold text-foreground">{kundlis?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Kundlis</div>
          </div>

          <div className="bg-card rounded-2xl p-4 text-center border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-nava-magenta/10 flex items-center justify-center mx-auto mb-2">
              <User className="w-5 h-5 text-nava-magenta" />
            </div>
            <div className="text-2xl font-bold text-foreground">0</div>
            <div className="text-xs text-muted-foreground">Consults</div>
          </div>

          <div className="bg-card rounded-2xl p-4 text-center border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-nava-amber/10 flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-5 h-5 text-nava-amber" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {user?.createdAt
                ? new Date(user.createdAt).getFullYear()
                : new Date().getFullYear()}
            </div>
            <div className="text-xs text-muted-foreground">Member</div>
          </div>
        </div>

        {/* Birth Details Card */}
        {(user?.dateOfBirth || user?.timeOfBirth || user?.placeOfBirth) && (
          <Card className="mb-6 bg-card border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Birth Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {user.dateOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-nava-teal/10 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-nava-teal" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Date of Birth</div>
                      <div className="text-sm font-medium text-foreground">
                        {new Date(user.dateOfBirth).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}

                {user.timeOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-nava-amber/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-nava-amber" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Time of Birth</div>
                      <div className="text-sm font-medium text-foreground">{user.timeOfBirth}</div>
                    </div>
                  </div>
                )}

                {user.placeOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-nava-magenta/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-nava-magenta" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Place of Birth</div>
                      <div className="text-sm font-medium text-foreground">{user.placeOfBirth}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Kundlis */}
        <Card className="bg-card border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Kundlis</CardTitle>
              <Link href="/kundli/new">
                <Button size="sm" className="bg-nava-teal hover:bg-nava-teal/90 text-white rounded-full" data-testid="button-new-kundli">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Generate New
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {kundlisLoading ? (
              <LoadingSpinner size="sm" />
            ) : kundlis && kundlis.length > 0 ? (
              <div className="space-y-3">
                {kundlis.map((kundli) => {
                  const birthDate = new Date(kundli.dateOfBirth);

                  return (
                    <Link key={kundli.id} href={`/kundli/${kundli.id}`}>
                      <div
                        className="p-4 bg-background rounded-xl hover:bg-muted transition-colors cursor-pointer"
                        data-testid={`kundli-${kundli.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm text-foreground mb-1.5">
                              {kundli.name}
                            </h3>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{birthDate.toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{kundli.timeOfBirth}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {kundli.zodiacSign && (
                              <Badge className="bg-nava-teal/10 text-nava-teal border-0 text-xs">{kundli.zodiacSign}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-nava-teal/10 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-7 h-7 text-nava-teal" />
                </div>
                <p className="text-muted-foreground text-sm mb-1">No kundlis generated yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Generate your first birth chart to get started
                </p>
                <Link href="/kundli/new">
                  <Button className="bg-nava-teal hover:bg-nava-teal/90 text-white rounded-full">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Kundli
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
