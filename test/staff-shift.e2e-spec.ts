import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role, RoleSchema } from '../src/features/auth/entities/role.entity';
import { User, UserSchema } from '../src/features/auth/entities/user.entity';
import { RoleRepository } from '../src/features/auth/repositories/role.repository';
import { UserRepository } from '../src/features/auth/repositories/user.repository';
import { JwtStrategy } from '../src/features/auth/strategies/jwt.strategy';
import { RoleEnum } from '../src/features/auth/types/role.enum';
import { AdminStaffShiftController } from '../src/features/staff-shift/admin-staff-shift.controller';
import { StaffShiftResponseDto } from '../src/features/staff-shift/dto/staff-shift-response.dto';
import {
  StaffShift,
  StaffShiftSchema,
} from '../src/features/staff-shift/entities/staff-shift.entity';
import { StaffShiftRepository } from '../src/features/staff-shift/repositories/staff-shift.repository';
import { StaffShiftService } from '../src/features/staff-shift/staff-shift.service';
import { ShiftStatusEnum } from '../src/features/staff-shift/types/shift-status.enum';

const TEST_SECRET = 'test-access-secret-with-at-least-32-characters';

/**
 * Boots a minimal module with just the shifts feature + an in-memory Mongo.
 * Avoids the full AppModule (Atlas srv URI, Redis, SMTP/PayOS/Gemini env).
 */
describe('Admin shifts — set ca sáng/chiều/cả ngày (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  let staffShiftModel: Model<StaffShift>;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let managerToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ auth: { accessSecret: TEST_SECRET } })],
        }),
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: StaffShift.name, schema: StaffShiftSchema },
          { name: User.name, schema: UserSchema },
          { name: Role.name, schema: RoleSchema },
        ]),
        PassportModule,
        JwtModule.register({}),
      ],
      controllers: [AdminStaffShiftController],
      providers: [
        StaffShiftService,
        StaffShiftRepository,
        UserRepository,
        RoleRepository,
        JwtStrategy,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    staffShiftModel = app.get<Model<StaffShift>>(
      getModelToken(StaffShift.name),
    );
    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));

    managerToken = app.get(JwtService).sign(
      {
        sub: new Types.ObjectId().toString(),
        email: 'm@x.io',
        role: RoleEnum.MANAGER,
      },
      { secret: TEST_SECRET, expiresIn: '15m' },
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await staffShiftModel.deleteMany({});
    await userModel.deleteMany({});
    await roleModel.deleteMany({});
  });

  /** Seeds a washer role + an active washer user; returns the user id. */
  async function seedWasher(): Promise<string> {
    const role = await roleModel.create({
      code: RoleEnum.WASHER,
      name: 'Washer',
      is_active: true,
    });
    const user = await userModel.create({
      role_id: role._id,
      name: 'Wash Er',
      phone: '0900000001',
      email: 'washer@x.io',
      password_hash: 'x',
      is_active: true,
    });
    return user._id.toString();
  }

  function post(body: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post('/admin/shifts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(body);
  }

  it('ca sáng → tạo 1 ca (mảng 1 phần tử)', async () => {
    const staffId = await seedWasher();

    const res = await post({
      staffId,
      shiftType: 'washer',
      date: '2026-12-01',
      block: 'morning',
    }).expect(201);
    const body = res.body as StaffShiftResponseDto[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe(ShiftStatusEnum.SCHEDULED);
    expect(new Date(body[0].startAt).getUTCHours()).toBe(1); // 08:00 VN
    expect(new Date(body[0].endAt).getUTCHours()).toBe(5); // 12:00 VN

    expect(await staffShiftModel.countDocuments({})).toBe(1);
  });

  it('cả ngày → tạo 2 ca (sáng + chiều)', async () => {
    const staffId = await seedWasher();

    const res = await post({
      staffId,
      shiftType: 'washer',
      date: '2026-12-01',
      block: 'fullday',
    }).expect(201);
    const body = res.body as StaffShiftResponseDto[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    const startHours = body
      .map((s) => new Date(s.startAt).getUTCHours())
      .sort();
    expect(startHours).toEqual([1, 7]); // 08:00 + 14:00 VN

    expect(await staffShiftModel.countDocuments({})).toBe(2);
  });

  it('cả ngày khi đã có ca sáng → từ chối toàn bộ, không tạo thêm ca', async () => {
    const staffId = await seedWasher();

    // Tạo trước ca sáng qua chính API (đường thật).
    await post({
      staffId,
      shiftType: 'washer',
      date: '2026-12-01',
      block: 'morning',
    }).expect(201);
    expect(await staffShiftModel.countDocuments({})).toBe(1);

    // Chọn cả ngày → block sáng trùng → 400, không tạo ca chiều.
    const res = await post({
      staffId,
      shiftType: 'washer',
      date: '2026-12-01',
      block: 'fullday',
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain('trùng giờ');
    // All-or-nothing: vẫn đúng 1 ca, không có ca chiều bị tạo lỡ.
    expect(await staffShiftModel.countDocuments({})).toBe(1);
  });

  it('shiftType không khớp role của staff → 400', async () => {
    const staffId = await seedWasher(); // role = washer

    await post({
      staffId,
      shiftType: 'cashier',
      date: '2026-12-01',
      block: 'morning',
    }).expect(400);

    expect(await staffShiftModel.countDocuments({})).toBe(0);
  });
});
