import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { GoldenHourService } from './golden-hour.service';
import { GoldenHourConfigRepository } from './repositories/golden-hour-config.repository';

/** Validation + flow tests for the admin CRUD. Repository is fully mocked. */
describe('GoldenHourService admin CRUD', () => {
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    existsByNameExcept: jest.Mock;
  };
  let service: GoldenHourService;

  const doc = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    name: 'Morning quiet hours',
    days_of_week: [],
    start_minute: 480,
    end_minute: 600,
    timezone: 'Asia/Ho_Chi_Minh',
    is_active: true,
    ...over,
  });

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      existsByNameExcept: jest.fn(),
    };
    service = new GoldenHourService(
      repo as unknown as GoldenHourConfigRepository,
    );
  });

  describe('create', () => {
    const base = { name: 'X', startMinute: 480, endMinute: 600 };

    it('rejects endMinute ≤ startMinute', async () => {
      await expect(
        service.create({ ...base, startMinute: 600, endMinute: 600 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid IANA timezone', async () => {
      await expect(
        service.create({ ...base, timezone: 'Mars/Phobos' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name', async () => {
      repo.existsByNameExcept.mockResolvedValue(true);
      await expect(service.create(base)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates with defaults (every day, active, VN tz) and maps the response', async () => {
      repo.existsByNameExcept.mockResolvedValue(false);
      repo.create.mockResolvedValue(doc({ name: 'X' }));

      const res = await service.create(base);

      expect(repo.create).toHaveBeenCalledWith({
        name: 'X',
        daysOfWeek: [],
        startMinute: 480,
        endMinute: 600,
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
      });
      expect(res.startTime).toBe('08:00');
      expect(res.endTime).toBe('10:00');
      expect(res.isActive).toBe(true);
    });
  });

  describe('update', () => {
    it('404s when the window does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('id', { startMinute: 500 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates the merged window (patch start past existing end → 400)', async () => {
      repo.findById.mockResolvedValue(doc()); // 480..600
      await expect(
        service.update('id', { startMinute: 700 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateById).not.toHaveBeenCalled();
    });

    it('rejects renaming onto an existing name', async () => {
      repo.findById.mockResolvedValue(doc());
      repo.existsByNameExcept.mockResolvedValue(true);
      await expect(
        service.update('id', { name: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.updateById).not.toHaveBeenCalled();
    });

    it('applies a valid patch', async () => {
      repo.findById.mockResolvedValue(doc());
      repo.existsByNameExcept.mockResolvedValue(false);
      repo.updateById.mockResolvedValue(doc({ end_minute: 660 }));

      const res = await service.update('id', { endMinute: 660 });

      expect(repo.updateById).toHaveBeenCalled();
      expect(res.endTime).toBe('11:00');
    });
  });

  describe('remove', () => {
    it('404s when nothing was deleted', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.remove('id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves when a window was deleted', async () => {
      repo.deleteById.mockResolvedValue(true);
      await expect(service.remove('id')).resolves.toBeUndefined();
    });
  });
});
