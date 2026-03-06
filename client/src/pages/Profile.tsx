import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
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
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="sticky top-0 z-50 bg-[#FFCF23] shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-xl hover:bg-[#1A1A1A]/10" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-[#1A1A1A]" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-[#1A1A1A]">My Profile</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Profile Info Card */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-start gap-6 mb-6">
              <Avatar className="w-24 h-24 flex-shrink-0">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-3xl">
                  {user?.firstName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <h2 className="text-3xl font-serif font-semibold text-foreground mb-2">
                  {user?.firstName || user?.lastName 
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : 'Anonymous User'}
                </h2>
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  {user?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <span>{user.email}</span>
                    </div>
                  )}
                  {user?.phoneNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span>{user.phoneNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <Button variant="outline" data-testid="button-edit-profile">
                Edit Profile
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Kundlis</div>
                  <div className="text-2xl font-bold text-foreground">{kundlis?.length || 0}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Consultations</div>
                  <div className="text-2xl font-bold text-foreground">0</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Member Since</div>
                  <div className="text-2xl font-bold text-foreground">
                    {user?.createdAt 
                      ? new Date(user.createdAt).getFullYear()
                      : new Date().getFullYear()}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Birth Details Card */}
        {(user?.dateOfBirth || user?.timeOfBirth || user?.placeOfBirth) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Birth Details</CardTitle>
              <CardDescription>Your default birth information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {user.dateOfBirth && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Date of Birth</div>
                      <div className="font-medium">
                        {new Date(user.dateOfBirth).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}

                {user.timeOfBirth && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Time of Birth</div>
                      <div className="font-medium">{user.timeOfBirth}</div>
                    </div>
                  </div>
                )}

                {user.placeOfBirth && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Place of Birth</div>
                      <div className="font-medium">{user.placeOfBirth}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Kundlis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Kundlis</CardTitle>
                <CardDescription>Your saved birth charts</CardDescription>
              </div>
              <Link href="/kundli/new">
                <Button data-testid="button-new-kundli">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate New
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {kundlisLoading ? (
              <LoadingSpinner size="sm" />
            ) : kundlis && kundlis.length > 0 ? (
              <div className="space-y-3">
                {kundlis.map((kundli) => {
                  const birthDate = new Date(kundli.dateOfBirth);
                  
                  return (
                    <Link key={kundli.id} href={`/kundli/${kundli.id}`}>
                      <div
                        className="p-4 bg-muted/30 rounded-lg hover-elevate active-elevate-2 cursor-pointer transition-all"
                        data-testid={`kundli-${kundli.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-foreground mb-2">
                              {kundli.name}
                            </h3>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>{birthDate.toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{kundli.timeOfBirth}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                <span>{kundli.placeOfBirth}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {kundli.zodiacSign && (
                              <Badge variant="secondary">{kundli.zodiacSign}</Badge>
                            )}
                            {kundli.moonSign && (
                              <Badge variant="secondary">Moon: {kundli.moonSign}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground mb-2">No kundlis generated yet</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Generate your first birth chart to get started
                </p>
                <Link href="/kundli/new">
                  <Button>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Kundli
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
}
