import { GoldenHourService } from './golden-hour.service';
import { GoldenHourConfigRepository } from './repositories/golden-hour-config.repository';

/**
 * Proves the golden-hour matcher against the SEEDED windows
 * (08:00-10:00 and 13:00-15:00, Asia/Ho_Chi_Minh, every day). With this
 * config the booking grid is NOT all-golden: 10:00, 11:00, 15:00, 16:00 fall
 * outside both windows. So if the FE shows every slot as golden, the cause is
 * either broader windows in the DB or the FE colouring slots regardless of the
 * `isGoldenHour` flag - not this algorithm.
 */
describe('GoldenHourService.findActiveAt (seeded windows)', () => {
  const seededWindows = [
    {
      name: 'Morning quiet hours',
      days_of_week: [] as number[],
      start_minute: 8 * 60,
      end_minute: 10 * 60,
      timezone: 'Asia/Ho_Chi_Minh',
    },
    {
      name: 'Early afternoon quiet hours',
      days_of_week: [] as number[],
      start_minute: 13 * 60,
      end_minute: 15 * 60,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  ];

  let service: GoldenHourService;

  beforeEach(() => {
    const repository = {
      findActive: jest.fn().mockResolvedValue(seededWindows),
    };
    service = new GoldenHourService(
      repository as unknown as GoldenHourConfigRepository,
    );
  });

  // 16/06/2026 is a Tuesday; Vietnam local = UTC+7, so subtract 7h for UTC.
  const vn = (h: number, m = 0) => new Date(Date.UTC(2026, 5, 16, h - 7, m, 0));

  it.each([
    ['08:00', 8, true],
    ['09:30', 9, true, 30],
    ['14:00', 14, true],
    ['14:30', 14, true, 30],
  ])(
    'marks %s as golden under the seed config',
    async (_label, h, _g, m = 0) => {
      expect(await service.findActiveAt(vn(h, m))).not.toBeNull();
    },
  );

  it.each([
    ['10:00 (end is exclusive)', 10],
    ['11:00', 11],
    ['15:00 (end is exclusive)', 15],
    ['16:00', 16],
  ])('does NOT mark %s as golden under the seed config', async (_label, h) => {
    expect(await service.findActiveAt(vn(h))).toBeNull();
  });
});
