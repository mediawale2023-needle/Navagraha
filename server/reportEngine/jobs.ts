import type { Kundli } from '@shared/schema';
import { audit } from '../audit';
import { fulfilReportOrder } from '../reportOrders';
import { storage } from '../storage';
import { generateLifeReport } from '../aiAstrologerService';
import { generateUniversalReport } from './engine';

const POLL_MS = 2_000;
let running = false;

/** Process at most one job. Exported so the lifecycle can be tested without timers or paid calls. */
export async function processNextUniversalReportJob(
  generate: (category: string, kundli: Partial<Kundli>) => Promise<object> = generateUniversalReport,
): Promise<boolean> {
  const job = await storage.claimReportGenerationJob();
  if (!job) return false;
  const order = await storage.getReportOrderById(job.orderId);
  if (!order || order.status !== 'processing') {
    await storage.finishReportGenerationJob(job.orderId, 'failed', 'report order is no longer processing');
    return true;
  }
  let error: string | undefined;
  await fulfilReportOrder(order, job.reportName, async () => {
    try {
      // A paid job for an unreleased product (none is enqueued since the route gate) is fulfilled the legacy way.
      if (job.category === 'life_complete') return await generateLifeReport(job.payload.kundli as any);
      return await generate(job.category, job.payload.kundli as Partial<Kundli>);
    } catch (err) {
      error = String((err as Error)?.message ?? err);
      throw err;
    }
  });
  const finalOrder = await storage.getReportOrderById(job.orderId);
  const outcome = finalOrder?.status === 'ready' ? 'delivered' : finalOrder?.status === 'failed' ? 'failed' : 'already-final';
  await storage.finishReportGenerationJob(job.orderId, outcome === 'delivered' ? 'completed' : 'failed', error ?? (outcome === 'already-final' ? 'report order did not reach ready state' : undefined));
  audit('report.engine', { orderId: order.id, userId: order.userId, engine: job.pipeline, outcome, attempts: job.attempts });
  return true;
}

export function startUniversalReportWorker() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while (await processNextUniversalReportJob()) { /* drain queued work serially */ }
    } catch (err) {
      console.error('[reports] universal worker failed:', err);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(tick, POLL_MS).unref();
}
