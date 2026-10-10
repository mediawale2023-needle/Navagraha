import { useQuery } from '@tanstack/react-query';

/** The Release B switches the server reports in /api/config (all off unless enabled there). */
export interface AppFeatures {
  emailVerification: boolean;
  askPacksEnabled: boolean;
}

export function useAppFeatures(): AppFeatures {
  const { data } = useQuery<Partial<AppFeatures>>({ queryKey: ['/api/config'], refetchOnWindowFocus: false });
  return { emailVerification: data?.emailVerification === true, askPacksEnabled: data?.askPacksEnabled === true };
}
