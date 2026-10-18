import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  claimReportGenerationJob: vi.fn(),
  getReportOrderById: vi.fn(),
  finishReportGenerationJob: vi.fn(),
}));
const fulfilMock = vi.hoisted(() => vi.fn());

vi.mock('../../server/storage', () => ({ storage: storageMock }));
vi.mock('../../server/reportOrders', () => ({ fulfilReportOrder: fulfilMock }));
vi.mock('../../server/audit', () => ({ audit: vi.fn() }));
vi.mock('../../server/reportEngine/engine', () => ({ generateUniversalReport: vi.fn() }));

import { processNextUniversalReportJob } from '../../server/reportEngine/jobs';

const job = {
  orderId: 'order-1', reportName: 'Marriage Report', category: 'marriage', pipeline: 'universal-v1',
  payload: { kundli: { name: 'Offline chart' } }, attempts: 1,
};
const order = { id: 'order-1', userId: 'user-1', status: 'processing' };

describe('durable universal report worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.claimReportGenerationJob.mockResolvedValue(job);
    storageMock.getReportOrderById.mockResolvedValue(order);
    storageMock.finishReportGenerationJob.mockResolvedValue(undefined);
  });

  it('delivers a claimed job once and marks the work record completed', async () => {
    const generate = vi.fn().mockResolvedValue({ title: 'Marriage Report' });
    storageMock.getReportOrderById.mockResolvedValueOnce(order).mockResolvedValueOnce({ ...order, status: 'ready' });
    fulfilMock.mockImplementation(async (_order, _name, run) => { await run(); });
    expect(await processNextUniversalReportJob(generate)).toBe(true);
    expect(generate).toHaveBeenCalledWith('marriage', job.payload.kundli);
    expect(storageMock.finishReportGenerationJob).toHaveBeenCalledWith('order-1', 'completed', undefined);
  });

  it('does not generate after the associated order has become final', async () => {
    storageMock.getReportOrderById.mockResolvedValue({ ...order, status: 'failed' });
    const generate = vi.fn();
    expect(await processNextUniversalReportJob(generate)).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(storageMock.finishReportGenerationJob).toHaveBeenCalledWith('order-1', 'failed', 'report order is no longer processing');
  });

  it('records a validation/generation failure without scheduling another paid attempt', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('validation failed'));
    storageMock.getReportOrderById.mockResolvedValueOnce(order).mockResolvedValueOnce({ ...order, status: 'failed' });
    fulfilMock.mockImplementation(async (_order, _name, run) => { try { await run(); } catch {} });
    expect(await processNextUniversalReportJob(generate)).toBe(true);
    expect(storageMock.finishReportGenerationJob).toHaveBeenCalledWith('order-1', 'failed', 'validation failed');
  });
});
