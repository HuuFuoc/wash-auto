# Migration Spec: NestJS → Express (TypeScript)

> File này là **bản hướng dẫn cho AI agent** (Claude VS Code Extension / Claude Code) đọc và tự thực hiện việc chuyển đổi dự án từ **NestJS** sang **Express**. Agent đọc từ trên xuống, làm tuần tự theo từng PHASE, mỗi phase chỉ làm khi phase trước đã hoàn tất và build pass.

---

## 0. Bối cảnh & ràng buộc (Context & Constraints)

**Tech stack giữ nguyên:**
- TypeScript (giữ TS, KHÔNG chuyển sang JavaScript)
- MongoDB + Mongoose
- JWT Authentication (thay cho NestJS Guard)
- Validation bằng `class-validator` + DTO (thay cho NestJS Pipe)

**Nguyên tắc chung agent PHẢI tuân theo:**
1. KHÔNG xoá code Nest ngay lập tức. Tạo cấu trúc Express song song, migrate xong từng module rồi mới gỡ bỏ phần Nest tương ứng.
2. Giữ nguyên business logic trong các **Service** — chỉ thay đổi cách chúng được gọi và khởi tạo (bỏ DI, chuyển sang khởi tạo thủ công).
3. Mỗi phase kết thúc phải: chạy `npm run build` (hoặc `tsc --noEmit`) thành công, không có lỗi type.
4. Đặt tên file theo convention Express: `*.controller.ts`, `*.service.ts`, `*.router.ts`, `*.model.ts`, `*.dto.ts`, `*.middleware.ts`.
5. Mọi async handler PHẢI bọc try/catch và gọi `next(err)` để chuyển lỗi về error middleware (hoặc dùng helper `asyncHandler`).
6. KHÔNG tự ý đổi tên biến môi trường (env). Giữ nguyên các key trong `.env`.
7. **Theo dõi tiến độ bằng file `MIGRATION_PROGRESS.md`** (xem mục 0.1). Agent PHẢI cập nhật file này NGAY sau khi migrate xong một module, trước khi chuyển sang module tiếp theo.

---

## 0.1. Theo dõi tiến độ (Progress Tracking)

**Trước khi bắt đầu**, agent tạo file `MIGRATION_PROGRESS.md` ở thư mục gốc dự án (nếu chưa có), liệt kê **tất cả module** phát hiện được trong code Nest (quét các file `*.module.ts`), đánh dấu tất cả là chưa migrate.

**Sau khi migrate xong MỖI module**, agent PHẢI:
1. Mở `MIGRATION_PROGRESS.md`.
2. Chuyển module vừa làm từ phần "Chưa migrate" sang "Đã migrate".
3. Ghi ngày hoàn thành và ghi chú (nếu có vấn đề/khác biệt cần lưu ý).
4. Cập nhật phần tóm tắt số liệu ở đầu file (đã xong X / tổng Y).
5. Lưu file rồi mới sang module kế tiếp.

> Quy ước trạng thái: `[ ]` = chưa làm, `[~]` = đang làm dở, `[x]` = đã xong & test pass.

Mẫu file `MIGRATION_PROGRESS.md` đã được tạo sẵn — agent chỉ cần điền danh sách module thực tế vào và cập nhật dần.

---

## 1. Bảng ánh xạ khái niệm (Concept Mapping)

| NestJS | Express tương đương |
|---|---|
| `@Module` | Một thư mục + file `*.router.ts` gom route |
| `@Controller` + `@Get/@Post...` | `express.Router()` + `router.get/post(...)` |
| Service (provider) | Class bình thường, khởi tạo thủ công bằng `new` |
| Dependency Injection | Truyền dependency qua constructor thủ công, hoặc factory trong `*.router.ts` |
| `@UseGuards(AuthGuard)` | Middleware `authMiddleware(req, res, next)` |
| Pipe + DTO + `class-validator` | Middleware `validateDto(SomeDto)` |
| Interceptor | Middleware (chạy trước/sau handler) |
| Exception Filter | Error-handling middleware `(err, req, res, next)` |
| `main.ts` bootstrap | `src/app.ts` + `src/server.ts` |
| `ConfigService` | `dotenv` + object `src/config/index.ts` |
| `@InjectModel` (Mongoose) | `import Model from '../models/x.model'` trực tiếp |

---

## 2. Cấu trúc thư mục đích (Target Structure)

```
src/
├── config/
│   ├── index.ts            # đọc env, export object config
│   └── database.ts         # kết nối Mongoose
├── models/
│   └── user.model.ts       # Mongoose schema + model
├── modules/
│   └── users/
│       ├── users.service.ts
│       ├── users.controller.ts
│       ├── users.router.ts
│       └── dto/
│           ├── create-user.dto.ts
│           └── update-user.dto.ts
├── middlewares/
│   ├── auth.middleware.ts      # verify JWT
│   ├── validate.middleware.ts  # chạy class-validator trên DTO
│   └── error.middleware.ts     # error handler tập trung
├── common/
│   ├── async-handler.ts        # bọc async để bắt lỗi
│   └── http-exception.ts       # class lỗi custom (thay HttpException của Nest)
├── app.ts                  # tạo express app, gắn middleware + router
└── server.ts               # connect DB rồi app.listen()
```

---

## 3. PHASE 1 — Khởi tạo nền Express

**Mục tiêu:** dựng skeleton chạy được, chưa có business logic.

### 3.1 Cài dependencies
```bash
npm install express cors helmet morgan dotenv jsonwebtoken mongoose class-validator class-transformer
npm install -D typescript @types/express @types/node @types/cors @types/morgan @types/jsonwebtoken ts-node-dev
```
> Gỡ các package chỉ phục vụ Nest sau khi migrate xong (`@nestjs/*`, `reflect-metadata` có thể vẫn cần cho class-validator — KIỂM TRA trước khi gỡ).

### 3.2 `tsconfig.json`
Đảm bảo có (class-validator cần decorator):
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```
> File entry phải `import 'reflect-metadata';` ở dòng đầu tiên nếu dùng class-transformer/validator với metadata.

### 3.3 `src/config/index.ts`
```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI as string,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
};
```

### 3.4 `src/config/database.ts`
```typescript
import mongoose from 'mongoose';
import { config } from './index';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  console.log('✅ MongoDB connected');
}
```

### 3.5 `src/common/async-handler.ts`
```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
```

### 3.6 `src/common/http-exception.ts`
```typescript
export class HttpException extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
```

### 3.7 `src/middlewares/error.middleware.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../common/http-exception';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err instanceof HttpException ? err.status : 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ statusCode: status, message });
}
```

### 3.8 `src/app.ts`
```typescript
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorMiddleware } from './middlewares/error.middleware';
// import routers ở đây khi migrate từng module

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // app.use('/api/users', usersRouter);  // gắn dần theo từng phase

  app.use(errorMiddleware); // PHẢI đặt CUỐI CÙNG
  return app;
}
```

### 3.9 `src/server.ts`
```typescript
import { createApp } from './app';
import { connectDB } from './config/database';
import { config } from './config';

async function bootstrap() {
  await connectDB();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`🚀 Server on http://localhost:${config.port}`);
  });
}
bootstrap();
```

### 3.10 Cập nhật `package.json` scripts
```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

**✅ Tiêu chí hoàn thành Phase 1:** `npm run dev` chạy được, kết nối MongoDB OK, server listen ở port cấu hình.

---

## 4. PHASE 2 — Auth (JWT thay cho Guard)

### 4.1 `src/middlewares/auth.middleware.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpException } from '../common/http-exception';

export interface AuthRequest extends Request {
  user?: { id: string; [key: string]: any };
}

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpException(401, 'Missing or invalid token'));
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    req.user = payload;
    next();
  } catch {
    next(new HttpException(401, 'Invalid or expired token'));
  }
}
```

> **Cách dùng:** thay vì `@UseGuards(AuthGuard)` ở controller, gắn middleware vào route:
> `router.get('/me', authMiddleware, controller.getMe);`

### 4.2 Role guard (nếu Nest có `RolesGuard`)
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { HttpException } from '../common/http-exception';

export const roleMiddleware =
  (...roles: string[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpException(403, 'Forbidden'));
    }
    next();
  };
```
> Dùng: `router.delete('/:id', authMiddleware, roleMiddleware('admin'), controller.remove);`

### 4.3 Tạo & ký token
Trong service login, thay vì `JwtService.sign()` của Nest:
```typescript
import jwt from 'jsonwebtoken';
import { config } from '../../config';

const token = jwt.sign(
  { id: user._id, role: user.role },
  config.jwtSecret,
  { expiresIn: config.jwtExpiresIn },
);
```

**✅ Tiêu chí hoàn thành Phase 2:** đăng nhập trả token, route bảo vệ chặn request không có token.

---

## 5. PHASE 3 — Validation (DTO + class-validator thay cho Pipe)

### 5.1 `src/middlewares/validate.middleware.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HttpException } from '../common/http-exception';

export function validateDto(dtoClass: any) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const dto = plainToInstance(dtoClass, req.body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors
        .map((e) => Object.values(e.constraints || {}))
        .flat();
      return next(new HttpException(400, messages.join(', ')));
    }
    req.body = dto;
    next();
  };
}
```

### 5.2 DTO giữ NGUYÊN file class-validator của Nest
DTO Nest dùng được luôn, không cần sửa. Ví dụ:
```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
```
> Dùng: `router.post('/', validateDto(CreateUserDto), controller.create);`

**✅ Tiêu chí hoàn thành Phase 3:** body sai schema bị chặn 400 với message rõ ràng.

---

## 6. PHASE 4 — Migrate từng module (lặp lại cho mỗi module Nest)

Với MỖI module Nest (ví dụ `users`, `auth`, `bookings`...), agent làm các bước:

### 6.1 Model (Mongoose)
Chuyển `@Schema()` / `SchemaFactory` của Nest sang Mongoose thuần:
```typescript
import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  role: string;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
  },
  { timestamps: true },
);

export const UserModel = model<IUser>('User', userSchema);
```

### 6.2 Service
- Copy nguyên logic từ service Nest.
- Bỏ decorator `@Injectable()`.
- Thay `@InjectModel(User.name) private userModel` bằng import trực tiếp `UserModel`.
```typescript
import { UserModel } from '../../models/user.model';
import { CreateUserDto } from './dto/create-user.dto';

export class UsersService {
  async findOne(id: string) {
    return UserModel.findById(id);
  }
  async create(dto: CreateUserDto) {
    return UserModel.create(dto);
  }
}
```

### 6.3 Controller
- Mỗi method nhận `(req, res, next)`.
- Lấy data từ `req.params`, `req.query`, `req.body`, `req.user`.
- Trả về bằng `res.status(...).json(...)`.
```typescript
import { Request, Response } from 'express';
import { UsersService } from './users.service';

export class UsersController {
  constructor(private usersService: UsersService) {}

  findOne = async (req: Request, res: Response) => {
    const user = await this.usersService.findOne(req.params.id);
    res.json(user);
  };

  create = async (req: Request, res: Response) => {
    const user = await this.usersService.create(req.body);
    res.status(201).json(user);
  };
}
```

### 6.4 Router (nơi "lắp ráp" DI thủ công)
```typescript
import { Router } from 'express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../common/async-handler';
import { CreateUserDto } from './dto/create-user.dto';

const service = new UsersService();
const controller = new UsersController(service);

const router = Router();
router.get('/:id', authMiddleware, asyncHandler(controller.findOne));
router.post('/', validateDto(CreateUserDto), asyncHandler(controller.create));

export default router;
```

### 6.5 Gắn router vào app
Trong `src/app.ts`:
```typescript
import usersRouter from './modules/users/users.router';
app.use('/api/users', usersRouter);
```

### 6.6 Cập nhật tiến độ (BẮT BUỘC)
Sau khi module hoạt động & test pass, mở `MIGRATION_PROGRESS.md`, chuyển module này sang phần "Đã migrate" với trạng thái `[x]`, ghi ngày + ghi chú, cập nhật số liệu tổng. Chỉ sau đó mới làm module tiếp theo.

**✅ Tiêu chí hoàn thành mỗi module:** tất cả endpoint cũ của Nest hoạt động tương đương qua Express (test bằng Postman/curl, so sánh response) **và** `MIGRATION_PROGRESS.md` đã được cập nhật.

---

## 7. PHASE 5 — Dọn dẹp (Cleanup)

Chỉ làm khi TẤT CẢ module đã migrate & test xong:
1. Xoá thư mục/file Nest cũ (`*.module.ts` Nest, `main.ts` cũ, `app.module.ts`...).
2. Gỡ dependencies Nest: `npm uninstall @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/mongoose @nestjs/jwt @nestjs/config @nestjs/passport passport ...`
3. Xoá `nest-cli.json`.
4. Kiểm tra `reflect-metadata` còn cần không (class-validator metadata → giữ lại).
5. Cập nhật README, Dockerfile, CI/CD (lệnh start đổi từ `nest start` sang `node dist/server.js`).
6. `npm run build` + chạy full lại lần cuối.

---

## 8. Checklist tổng (agent tự đánh dấu)

- [ ] Phase 1: skeleton Express chạy, kết nối Mongo OK
- [ ] Phase 2: auth middleware + role middleware hoạt động
- [ ] Phase 3: validateDto chặn body sai
- [ ] Phase 4: từng module migrate xong, test pass
- [ ] Phase 5: gỡ Nest, build & chạy sạch
- [ ] `npm run build` không lỗi type
- [ ] So sánh response API trước/sau migrate khớp nhau

---

## 9. Lưu ý quan trọng cho agent

- **Đừng** đổi shape của response JSON nếu frontend đang phụ thuộc vào nó (giữ đúng format cũ của Nest).
- **Đừng** quên error middleware đặt CUỐI trong `app.ts`, sau tất cả router.
- Nếu Nest có **Interceptor transform response** (kiểu `{ data, message }`), tạo một middleware tương đương hoặc wrap thủ công trong controller cho khớp.
- Mongoose **không** validate kiểu như class-validator — giữ cả hai lớp: `validateDto` (input) + schema Mongoose (DB).
- Nếu trước đây dùng `@nestjs/config` nhiều nơi, gom hết về `src/config/index.ts` rồi import.
