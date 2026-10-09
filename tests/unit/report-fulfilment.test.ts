// A paid report is delivered only when generation succeeds; any failure fails the order and
// refunds it with a notification saying how much came back.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: { setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn(async () => ({})) },
  push: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: mocks.push }));
import { fulfilReportOrder } from '../../server/reportOrders';

const order = { id: 'o1', userId: 'u1' } as any;
beforeEach(() => vi.clearAllMocks());

describe('fulfilReportOrder', () => {
  it('delivers a generated report and says so', async () => {
    mocks.storage.setReportOrderContent.mockResolvedValue({ id: 'o1' });
    await fulfilReportOrder(order, 'Career Report', async () => ({ title: 'ok' }));
    expect(mocks.storage.setReportOrderContent).toHaveBeenCalledWith('o1', { title: 'ok' });
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report Ready' }));
    expect(mocks.storage.failAndRefundReportOrder).not.toHaveBeenCalled();
  });

  it('refunds and tells the user when generation fails', async () => {
    mocks.storage.failAndRefundReportOrder.mockResolvedValue({ order, refunded: 299 });
    await fulfilReportOrder(order, 'Career Report', async () => { throw new Error('quality check failed'); });
    expect(mocks.storage.setReportOrderContent).not.toHaveBeenCalled();
    expect(mocks.storage.failAndRefundReportOrder).toHaveBeenCalledWith('o1', 'quality check failed');
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Report could not be prepared', body: expect.stringMatching(/₹299 has been returned to your wallet/),
    }));
  });

  it('says nothing was charged for a free-access order', async () => {
    mocks.storage.failAndRefundReportOrder.mockResolvedValue({ order, refunded: 0 });
    await fulfilReportOrder(order, 'Career Report', async () => { throw new Error('x'); });
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringMatching(/You were not charged/) }));
  });

  it('does not announce a report that was already refunded by the sweeper', async () => {
    mocks.storage.setReportOrderContent.mockResolvedValue(undefined);
    await fulfilReportOrder(order, 'Career Report', async () => ({ title: 'late' }));
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('a refund that fails is left for the sweeper, never thrown', async () => {
    mocks.storage.failAndRefundReportOrder.mockRejectedValue(new Error('db down'));
    await expect(fulfilReportOrder(order, 'Career Report', async () => { throw new Error('x'); })).resolves.toBeUndefined();
  });
});
