import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { KundliInsights } from '@shared/v3/evidence';
import { loadPanchangPlace, localToday, panchangUrl } from '@/lib/panchangPlace';
import type { GocharaReading, PanchangToday } from '@/lib/today';

export interface ListedChart { id: string; name: string; listStatus?: 'v3' | 'recalculated' | 'limited' }

interface ChartDetail {
  id: string;
  name: string;
  chartStatus?: { version: string };
  chartData?: { canonical?: {
    birth: { timeAccuracy: 'exact' | 'approximate' };
    uncertainty: { moonSignStableAcrossBirthDate: boolean; moonNakshatraStableAcrossBirthDate: boolean };
    planets: Array<{ name: string; sign: string; nakshatra: { index: number; name: string } }>;
  } };
}

const CHART_KEY = 'navagraha.todayChart';
const readChoice = () => { try { return localStorage.getItem(CHART_KEY); } catch { return null; } };
const saveChoice = (id: string) => { try { localStorage.setItem(CHART_KEY, id); } catch { /* remembered for this visit only */ } };

/**
 * The saved chart Today reads. Nothing here decides that a chart is the user's own: the chart is
 * always named on screen, and the viewer can switch between saved charts.
 */
export function useTodayChart(enabled: boolean) {
  const { data: charts = [], isLoading: listLoading } = useQuery<ListedChart[]>({ queryKey: ['/api/kundli'], enabled });
  const [choice, setChoice] = useState<string | null>(readChoice);
  const chart = charts.find((c) => c.id === choice) ?? charts[0] ?? null;
  const choose = (id: string) => { setChoice(id); saveChoice(id); };

  const usable = !!chart && chart.listStatus !== 'limited';
  const { data: detail, isLoading: detailLoading } = useQuery<ChartDetail>({ queryKey: ['/api/kundli', chart?.id], enabled: enabled && usable });
  const { data: insights, isLoading: insightsLoading, isError: insightsError } = useQuery<KundliInsights>({ queryKey: ['/api/kundli', chart?.id, 'insights'], enabled: enabled && usable });

  const canonical = detail?.chartData?.canonical;
  const exact = canonical?.birth.timeAccuracy === 'exact';
  const moon = canonical?.planets.find((p) => p.name === 'Moon');
  return {
    charts,
    chart,
    choose,
    loading: listLoading || (usable && (detailLoading || insightsLoading)),
    limited: !!chart && chart.listStatus === 'limited',
    insights: insights ?? null,
    insightsError,
    /** The natal Moon sign, only when the birth time cannot move it into another sign. */
    moonSign: moon && (exact || canonical?.uncertainty.moonSignStableAcrossBirthDate) ? moon.sign : null,
    /** The birth nakshatra, only when the birth time cannot move it. */
    birthNakshatra: moon && (exact || canonical?.uncertainty.moonNakshatraStableAcrossBirthDate) ? moon.nakshatra : null,
  };
}

const viewerTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };

/** Today's Panchang at sunrise for the viewer's chosen city (New Delhi, disclosed, until they choose). */
export function usePanchangToday() {
  const [place] = useState(loadPanchangPlace);
  const url = panchangUrl(localToday(), place);
  return useQuery<PanchangToday>({
    queryKey: [url],
    queryFn: () => apiRequest<PanchangToday>('GET', url),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

/** Today's transits counted from a Moon sign (the engine's Gochara reading). */
export function useGochara(moonSign: string | null) {
  const tz = viewerTimeZone();
  const url = moonSign ? `/api/horoscope/${moonSign.toLowerCase()}?period=today${tz ? `&tz=${encodeURIComponent(tz)}` : ''}` : '';
  return useQuery<GocharaReading>({
    queryKey: [url],
    queryFn: () => apiRequest<GocharaReading>('GET', url),
    enabled: !!moonSign,
    staleTime: 30 * 60 * 1000,
  });
}
