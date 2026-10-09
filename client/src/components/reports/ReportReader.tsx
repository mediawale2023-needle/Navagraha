import { useState } from 'react';
import { Download, List } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NorthIndianChartEnhanced } from '@/components/NorthIndianChartEnhanced';
import type { ReportContent } from '@/lib/reportPdf';

interface Props {
  content: ReportContent;
  title: string;
  refunded: boolean;
  downloading: boolean;
  onDownload: () => void;
  onBack: () => void;
}

const slug = (s: string, i: number) => `sec-${i}-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;

/** Direction 3 report reader: a readable column with a contents list beside it on desktop. */
export function ReportReader({ content, title, refunded, downloading, onDownload, onBack }: Props) {
  const b = content.birthDetails;
  const sections = content.sections ?? [];
  const facts: Array<[string, string | undefined]> = [
    ['Name', b?.name], ['Date', b?.dateOfBirth], ['Time', b?.timeOfBirth], ['Place', b?.placeOfBirth], ['Lagna', b?.ascendant], ['Moon', b?.moonSign],
  ];
  const h3 = 'm-0 font-display text-card-title font-semibold md:text-heading';
  const [contentsOpen, setContentsOpen] = useState(false);
  const contents = (onPick?: () => void) => (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
      {sections.map((s, i) => <li key={i}><a href={`#${slug(s.heading, i)}`} onClick={onPick} className="block py-1 text-ink no-underline hover:text-amber-text hover:underline">{s.heading}</a></li>)}
    </ol>
  );
  return (
    <article className="flex flex-col gap-6" data-testid="report-reader">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-sm text-ink-muted underline hover:text-amber-text">← All reports</button>
        <div className="flex gap-2">
          {sections.length > 3 && (
            <Button variant="outline" onClick={() => setContentsOpen(true)} className="gap-1.5 lg:hidden" data-testid="button-report-contents">
              <List className="h-4 w-4" />Contents
            </Button>
          )}
          <Button disabled={downloading} onClick={onDownload} className="gap-1.5" data-testid="button-download-pdf">
            <Download className="h-4 w-4" />{downloading ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
        </div>
      </div>
      <header className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-section font-semibold md:text-title">{title}</h2>
        {refunded && <p className="text-sm text-ink-muted">This report did not meet our standard; what you paid was returned to your wallet.</p>}
        {content.disclosure && <p className="max-w-[70ch] rounded-md border border-line bg-highlight px-4 py-3 text-sm" data-testid="report-disclosure">{content.disclosure}</p>}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-8">
          {b && (
            <dl className="m-0 grid grid-cols-2 gap-x-6 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3 md:p-[22px]">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex flex-col border-b border-hairline py-2">
                  <dt className="text-caption text-ink-muted">{k}</dt>
                  <dd className="m-0 text-base">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {(content.chartData?.planetaryPositions || content.chartData?.navamsa?.planetaryPositions || content.chartData?.dasamsa?.planetaryPositions) && (
            <section className="grid gap-6 md:grid-cols-2" aria-label="Charts">
              {content.chartData?.planetaryPositions && (
                <figure className="m-0 flex flex-col gap-2"><figcaption className={h3}>Rashi · D1</figcaption><NorthIndianChartEnhanced chartData={content.chartData} /></figure>
              )}
              {content.chartData?.navamsa?.planetaryPositions && (
                <figure className="m-0 flex flex-col gap-2"><figcaption className={h3}>Navamsa · D9</figcaption><NorthIndianChartEnhanced chartData={content.chartData.navamsa} /></figure>
              )}
              {content.chartData?.dasamsa?.planetaryPositions && (
                <figure className="m-0 flex flex-col gap-2"><figcaption className={h3}>Dasamsa · D10</figcaption><NorthIndianChartEnhanced chartData={content.chartData.dasamsa} /></figure>
              )}
            </section>
          )}

          {content.planetaryPositions && content.planetaryPositions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className={h3}>Graha positions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="border-b border-line text-left text-ink-muted"><th className="py-2 pr-3 font-medium">Graha</th><th className="py-2 pr-3 font-medium">Sign</th><th className="py-2 pr-3 font-medium">House</th><th className="py-2 font-medium">Degree</th></tr></thead>
                  <tbody>
                    {content.planetaryPositions.map((p, i) => (
                      <tr key={i} className="border-b border-hairline last:border-0">
                        <td className="py-2 pr-3 font-semibold">{p.planet}{p.retrograde ? ' ℞' : ''}</td>
                        <td className="py-2 pr-3">{p.sign || '—'}</td>
                        <td className="py-2 pr-3">{p.house ?? '—'}</td>
                        <td className="py-2">{p.degree != null ? `${p.degree}°` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {content.dashaTimeline && content.dashaTimeline.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className={h3}>Vimshottari dasha</h3>
              <ol className="m-0 list-none overflow-hidden rounded-lg border border-line bg-surface p-0 text-sm tabular-nums">
                {content.dashaTimeline.map((d, i) => (
                  <li key={i} className={`flex justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-0 ${d.status === 'current' ? 'bg-highlight font-semibold' : ''}`}>
                    <span>{d.planet}{d.status === 'current' ? ' · now' : ''}</span><span className="text-ink-muted">{d.period || '—'}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {content.chartData?.ashtakavarga?.savByHouse?.length === 12 && (
            <section className="flex flex-col gap-3">
              <h3 className={h3}>Sarvashtakavarga by house</h3>
              <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 tabular-nums md:grid-cols-12">
                {content.chartData.ashtakavarga.savByHouse.map((v, i) => (
                  <li key={i} className={`flex flex-col items-center rounded-sm border border-line py-2 ${v >= 30 ? 'bg-highlight' : 'bg-surface'}`}>
                    <span className="text-caption text-ink-muted">{i + 1}</span><span className="font-semibold">{v}</span>
                  </li>
                ))}
              </ol>
              <p className="text-caption text-ink-muted">About 28 bindus is average; 30 or more is shaded.</p>
            </section>
          )}

          {content.summary && <p className="max-w-[70ch] text-lead">{content.summary}</p>}
          {sections.map((s, i) => (
            <section key={i} id={slug(s.heading, i)} className="flex scroll-mt-6 flex-col gap-2">
              <h3 className={h3}>{s.heading}</h3>
              <p className="max-w-[70ch] whitespace-pre-line text-base md:text-lead">{s.body}</p>
            </section>
          ))}
          {content.remedies && content.remedies.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className={h3}>Remedies</h3>
              <ul className="m-0 flex max-w-[70ch] list-disc flex-col gap-1.5 pl-5 text-base">{content.remedies.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>
          )}
        </div>

        {sections.length > 3 && (
          <nav aria-label="Contents" className="hidden lg:block">
            <div className="sticky top-6 flex max-h-[calc(100vh-48px)] flex-col gap-2 overflow-y-auto">
              <p className="font-display text-card-title font-semibold">Contents</p>
              {contents()}
            </div>
          </nav>
        )}
      </div>
      <Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
        <SheetContent side="bottom" className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto px-4 [&>*]:shrink-0 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5" aria-describedby={undefined}>
          <span aria-hidden="true" className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line" />
          <SheetTitle className="m-0 font-display text-card-title font-semibold">Contents</SheetTitle>
          {contents(() => setContentsOpen(false))}
        </SheetContent>
      </Sheet>
    </article>
  );
}
