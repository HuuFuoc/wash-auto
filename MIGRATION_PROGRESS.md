# Tiến độ Migration: NestJS → Express

> File theo dõi tiến độ chuyển đổi. **Agent cập nhật file này sau khi migrate xong mỗi module.**
> Quy ước: `[ ]` chưa làm · `[~]` đang làm dở · `[x]` xong & test pass.

**Cập nhật lần cuối:** 2026-06-16
**Tiến độ:** 18 / 18 module hoàn thành 🎉 (Phase 4 HOÀN TẤT)

---

## ⚙️ Quy ước kỹ thuật (ÁP DỤNG NHẤT QUÁN toàn bộ quá trình)

1. **Đây là Express 5** (`express@5.2.1` đã cài). Async handler ném lỗi sẽ **tự được
   forward** về error middleware → `asyncHandler` là **optional** (dùng cho rõ ràng, không bắt
   buộc). Cú pháp route đã đổi (path-to-regexp v8): **không** còn `*` trần, optional param
   `:id?` đổi cách viết, wildcard phải đặt tên (`/*splat`). Khi gặp route động/wildcard/optional
   phải kiểm tra lại path-to-regexp, không bê nguyên cú pháp Express 4.
2. **Phân biệt rõ guard auth vs guard khác.** Đã xác nhận có 4 guard, map thành 4 middleware
   TÁCH BIỆT, KHÔNG gộp vào `authMiddleware`:
   - `JwtAuthGuard` (passport-jwt, access token) → `authMiddleware`
   - `OptionalJwtAuthGuard` (không ném khi thiếu token) → `optionalAuthMiddleware` riêng
   - `RolesGuard` (đọc `@Roles()` metadata, chạy SAU auth) → `roleMiddleware(...roles)` riêng
   - `VerifiedEmailGuard` (**secret khác**: `JWT_VERIFIED_EMAIL_SECRET`, scope `email_verified`)
     → `verifiedEmailMiddleware` riêng hẳn (đây KHÔNG phải auth thường — luồng xác thực email)
3. **Global response interceptor: ĐÃ KIỂM TRA — KHÔNG có.** `main.ts`/`serverless.ts` không gọi
   `useGlobalInterceptors`; controller trả JSON thô (giữ nguyên shape). Interceptor duy nhất là
   `idempotency.interceptor` (chỉ ở order controller) + `FileInterceptor` (upload) → xử lý
   per-module, KHÔNG cần wrapper toàn cục. (Lỗi: Nest mặc định trả `{ statusCode, message, error }`
   — cần đối chiếu shape lỗi theo từng module ở Phase 4, hiện Phase 1 dùng `{ statusCode, message }`.)
4. **Swagger là OPTIONAL, làm CUỐI CÙNG, không chặn tiến độ.** Có ở `main.ts` (v0.3.0) và
   `serverless.ts` (v0.2.0).

**Ghi chú nền tảng bổ sung:**
- DB URI ghép từ `DB_USERNAME/DB_PASSWORD/DB_HOST/DB_NAME` → `mongodb+srv://...` (KHÔNG có
  `MONGO_URI` như spec mẫu giả định). Auth có access + refresh secret riêng, không phải 1 secret.
- `build` giữ nguyên `nest build` trong suốt migration (vẫn type-check cả file Express mới);
  chỉ đổi sang `tsc`/`node dist/server.js` ở Phase 5.
- `serverless.ts` là entrypoint Vercel (`vercel.json`) — KHÔNG đụng tới cho đến Phase 5.
- File module Express mới đặt tại `src/modules/<name>/` (song song `src/features/<name>/` của Nest).

---

## 🟢 Đã migrate (Done)

<!-- Mỗi dòng: - [x] tên-module — ngày xong — ghi chú -->
<!-- Ví dụ: - [x] users — 2026-06-16 — ok, giữ nguyên format response -->

- [x] **email** — 2026-06-16 — `src/modules/email/email.service.ts`. Service nội bộ, KHÔNG có
  route. Bỏ `@Injectable`/`ConfigService` → đọc `config.email`; `onModuleInit` → khởi tạo
  transporter trong constructor; `Logger` → `console`. Export singleton `getEmailService()` để
  otp/order DÙNG CHUNG (transporter pool). Thêm namespace `email` vào `config/index.ts`. Template
  & logic giữ nguyên 100%.
- [x] **vehicle-type** — 2026-06-16 — CRUD đầy đủ (public + admin). model plain Mongoose, repository,
  service, 2 controller, router. Public `/vehicle-types`, admin `/admin/vehicle-types`
  (auth + role ADMIN/MANAGER). create→201, patch→200. Reuse DTO từ `features/`.
- [x] **golden-hour** — 2026-06-16 — admin `/admin/golden-hours` (role MANAGER/ADMIN). delete→**204**.
  Service có cả CRUD lẫn `findActiveAt` (order/pricing dùng sau). Seed mặc định chuyển sang
  `server.ts` bootstrap (`seedGoldenHourDefaults`). Export `goldenHourService`.
- [x] **pricing-policy** — 2026-06-16 — admin `/admin/pricing-policy` (role ADMIN), singleton
  `key:'global'`. GET+PATCH. Seed → bootstrap. Export `pricingPolicyService`,
  `DEFAULT_MAX_STACKED_DISCOUNT_PERCENT`.
- [x] **tier-config** — 2026-06-16 — public `/tier-configs` + admin `/admin/tier-configs` (role ADMIN).
  Seed (legacy-detection) → bootstrap. Export `tierConfigService` + `tierConfigRepository` cho loyalty.
- [x] **upload** — 2026-06-16 — `/upload/image` + `/upload/images` (KHÔNG auth, như bản gốc).
  multer memoryStorage + cloudinary. Mapper lỗi MulterError→HTTP (LIMIT_FILE_SIZE→413,
  LIMIT_UNEXPECTED_FILE→400); `ParseFilePipeBuilder`→`assertImage` (422). Export `uploadServiceInstance`.
- [x] **otp** — 2026-06-16 — service-only (KHÔNG route, auth dùng sau). Redis client thô chuyển sang
  `src/core/redis.ts` (thay `REDIS_CLIENT` của core/cache); thêm namespace `cache` + `otp` config.
  Rate-limit `HttpException('msg',429)` → `HttpException(429,msg)` (body `{statusCode,message}` không
  field error). Reuse `getEmailService()`. Export `getOtpService()`.
- [x] **service-type** — 2026-06-16 — public `/service-types` + admin `/admin/service-types`
  (ADMIN/MANAGER). Sub-schema `VehiclePricing` (Decimal128/ObjectId ref VehicleType, `_id:false`).
  Phụ thuộc `VehicleTypeRepository` (instance mới, stateless). Export `serviceTypeService` + repository.
- [x] **vehicle** — 2026-06-16 — customer `/me/vehicles` (auth) + admin `/admin/vehicles` (ADMIN/MANAGER).
  Ownership qua `req.user.sub`; `AuthRequest<P>` nâng thành generic để narrow `req.params`. Query DTO
  phân trang qua `req.validated.query`. delete→**204**, set-default. `findPaginated` populate
  `customer_id` ref **'User'** — model `User` ĐÃ đăng ký ở cụm auth (Nhóm 3), nên đã chạy được runtime.
  Export `vehicleService` + repository.
- [x] **voucher** — 2026-06-16 — customer `/me/vouchers` + admin `/admin/vouchers` (ADMIN/MANAGER).
  Service phụ thuộc `UserRepository`+`RoleRepository` (auth, **repository** chứ không phải service →
  KHÔNG có vòng lặp ở tầng service) + redis (sinh mã + revoke/consume). Cron `@nestjs/schedule` →
  **node-cron** `registerVoucherExpiryCron` (02:00 Asia/HCM). Export `voucherService`+repository.
- [x] **loyalty** — 2026-06-16 — customer `/me/loyalty` + `/me/loyalty/transactions` (auth).
  2 model (account/transaction). Phụ thuộc `TierConfigRepository` + reuse `voucherService`. Cron
  annual-reset (00:00 01/01 Asia/HCM) → node-cron. Export `loyaltyService` cho auth/order.
- [x] **auth** — 2026-06-16 — `/auth/{register,login,refresh,logout,otp/send,otp/verify,me,admin-only}`.
  Nền tảng **User+Role** model/repository (nhiều module sau dùng). `JwtService`→**jsonwebtoken**
  (`jwt.sign/verify`), `@nestjs/jwt` bỏ; bcrypt giữ nguyên. refresh-token blacklist qua redis.
  `@Ip()`→`req.ip`. Seed 5 role (`seedAuthRoles`) chuyển sang bootstrap. register→201, login/refresh/otp→200,
  logout→204. Export `authService`, `userRepository`, `roleRepository`, `verifiedEmailTokenService`.
- [x] **staff-shift** — 2026-06-16 — auth `/shifts/available` + admin `/admin/shifts` (MANAGER/ADMIN).
  entity/repo/service + `shift-blocks` helper. Phụ thuộc `UserRepository`+`RoleRepository` (auth).
  Route `/staff` đăng ký TRƯỚC `/:id`. create→201 (mảng, fullday=2 ca). `distinct('_id')` cast ObjectId[]
  (vì `_id` không nằm trong interface). Export `staffShiftService`+repository cho order/work-order.
- [x] **user** — 2026-06-16 — admin `/admin/users` (ADMIN). KHÔNG có entity/repo riêng — dùng lại
  User model + `UserRepository`/`RoleRepository` của auth. bcrypt qua `config.auth.bcryptSaltRounds`.
  create→201, reset-password→200, delete→204. setStatus/softDelete chặn tự thao tác chính mình (req.user.sub).
- [x] **order** — 2026-06-16 — module LỚN NHẤT. 2 model (order + payment-transaction), 2 repository,
  `PayosService` (@payos/node), `OrderService` (~1300 dòng, copy nguyên logic). Routes: `/me/orders`
  (create idempotency→201, list, preview→200, available-slots, :id, reschedule, cancel),
  `/payments/webhook` (PayOS, KHÔNG auth), `/admin/orders` (CASHIER/MANAGER/ADMIN), `/washers/me/schedule`
  (WASHER). **Idempotency interceptor → `idempotencyMiddleware`** (wrap `res.json` cache Redis, chỉ áp
  POST /me/orders). Cron `@nestjs/schedule EVERY_MINUTE` (order-expiry + cash-no-show) → node-cron
  `registerOrderCron`. config thêm `booking`+`payos`. Webhook dedup/lock qua redis giữ nguyên.
  Export `orderService`+`orderRepository` cho work-order/chat/dashboard. `markCompletedByWorkOrder`
  sẵn sàng cho work-order gọi.
- [x] **work-order** — 2026-06-16 — admin `/admin/work-orders` (CASHIER/MANAGER/ADMIN: check-in→201,
  list, `/queue` trước `/:id`, assign, qc) + washer `/me/work-orders` (WASHER: list, start, finish).
  model có sub-schema `vehicle_snapshot` (_id:false). `work-order.service` + `assignment.service`
  (auto-assign FIFO, Redis lock per-washer). Reuse `orderService`/`orderRepository` (QC pass →
  `markCompletedByWorkOrder`). `distinct('assigned_washer_id')` cast ObjectId[]. Cron queue-drain
  `@nestjs/schedule` → node-cron `registerWorkOrderCron`. `findByAssignedWasher`/populate ref 'User' OK.
- [x] **chat** — 2026-06-16 — public `/chat/message` + `/chat/sessions/:sessionId` (optional auth) +
  admin `/admin/chat-knowledge` (ADMIN/MANAGER CRUD). 2 model (session có sub-schema messages + metadata
  Mixed; knowledge có text index). 4 service: gemini (`@google/genai`, tool-loop, 429→503
  ServiceUnavailable), chat-tools (reuse orderService/serviceTypeService/vehicleService), chat-knowledge,
  chat. `OptionalJwtAuthGuard`→`optionalAuthMiddleware`. Seed 8 FAQ → bootstrap (`seedChatKnowledge`).
  ⚠️ `@Throttle`/ThrottlerGuard (rate-limit) CHƯA port — xem ghi chú hoãn bên dưới.
- [x] **dashboard** — 2026-06-16 — admin `/admin/dashboard` (MANAGER/ADMIN). Service aggregate thuần,
  KHÔNG có entity riêng — tham chiếu trực tiếp 8 model singleton (Order/Vehicle/Voucher/WorkOrder/
  User/Role/LoyaltyAccount/StaffShift) thay cho `@InjectModel`. `$facet`/`$lookup` pipelines giữ
  nguyên 100%. Scope full/manager theo `req.user.role` (redact server-side). Module CUỐI → **18/18**.

<!-- - [~] tên-module — đang làm phần nào, vướng gì -->

_(chưa có)_

---

## 🔴 Chưa migrate (To do)

> Danh sách 18 module ứng dụng cần migrate, **sắp xếp theo thứ tự migrate đề xuất**
> (module ít phụ thuộc làm trước → module nghiệp vụ tổng hợp làm sau).

**Nhóm 1 — Lá, không phụ thuộc feature nào:** ✅ HOÀN TẤT
- [x] email — gửi mail (nodemailer)
- [x] upload — upload ảnh (multer + cloudinary), dùng lại bởi work-order/order
- [x] vehicle-type — danh mục loại xe
- [x] golden-hour — khung giờ vàng
- [x] pricing-policy — chính sách giá
- [x] tier-config — cấu hình hạng thành viên

**Nhóm 2 — Phụ thuộc nhóm 1:** ✅ HOÀN TẤT
- [x] otp — phụ thuộc email
- [x] service-type — phụ thuộc vehicle-type
- [x] vehicle — phụ thuộc vehicle-type

**Nhóm 3 — Cụm auth (vòng lặp auth ↔ loyalty ↔ voucher, migrate liền nhau):** ✅ HOÀN TẤT
- [x] voucher — phụ thuộc auth (chỉ repository, không service → hết vòng lặp)
- [x] loyalty — phụ thuộc tier-config, voucher
- [x] auth — phụ thuộc loyalty, otp

**Nhóm 4 — Phụ thuộc auth + nhóm trước:**
- [x] staff-shift — phụ thuộc auth
- [x] dashboard — đã migrate (làm cuối, sau khi Order + WorkOrder model tồn tại).
- [x] user — phụ thuộc auth, service-type, vehicle-type

**Nhóm 5 — Tổng hợp lớn:** ✅ HOÀN TẤT
- [x] order — phụ thuộc auth, email, golden-hour, loyalty, pricing-policy, service-type, staff-shift, tier-config, vehicle, voucher

**Nhóm 6 — Phụ thuộc order:** ✅ HOÀN TẤT
- [x] work-order — phụ thuộc auth, order, service-type, staff-shift, vehicle-type, vehicle
- [x] chat — phụ thuộc auth, order, service-type, vehicle

---

## 🔧 Hạ tầng nền (làm trước các module)

- [x] Phase 1 — Skeleton Express (config, DB, error handler, app, server) — 2026-06-16
  - Đã tạo: `src/config/index.ts`, `src/config/database.ts`, `src/common/{async-handler,http-exception}.ts`,
    `src/middlewares/error.middleware.ts`, `src/app.ts`, `src/server.ts`.
  - Cài thêm: `cors helmet morgan jsonwebtoken` (+ `@types/*`), `dotenv` lên dependencies.
  - Thêm script `dev:express` (ts-node) + `start:express` (`node dist/server.js`); giữ nguyên script Nest.
  - `pnpm run build` (nest build) PASS, không lỗi type; output `dist/server.js`, `dist/app.js`.
  - `core/database`/`core/cache`/`redis` (cache Redis) sẽ nối vào skeleton khi module dùng tới chúng được migrate.
- [x] Phase 2 — Auth middleware (JWT) + role middleware — 2026-06-16
  - `src/middlewares/auth.middleware.ts`: `authMiddleware` (= JwtAuthGuard, verify access token,
    401 `{statusCode,message:'Unauthorized'}`) + `optionalAuthMiddleware` (= OptionalJwtAuthGuard,
    không ném) + `extractBearer` helper. `req.user` = `IAuthPayload {sub,email,role}`.
  - `src/middlewares/roles.middleware.ts`: `roleMiddleware(...RoleEnum)` (= RolesGuard, chạy SAU auth,
    403 `{statusCode,message,error:'Forbidden'}`, message y hệt bản Nest).
  - `src/middlewares/verified-email.middleware.ts`: `verifiedEmailMiddleware` (= VerifiedEmailGuard,
    secret KHÁC `JWT_VERIFIED_EMAIL_SECRET` + scope `email_verified`, `req.user`=IVerifiedEmailPayload).
  - Thêm namespace `otp` vào `src/config/index.ts` (verifiedEmailSecret/Ttl + các tham số OTP).
  - Token signing (login) sẽ làm khi migrate module `auth` (Phase 4). `pnpm run build` PASS.
- [x] Phase 3 — `validateDto` middleware (class-validator) — 2026-06-16
  - `src/middlewares/validate.middleware.ts`: `validateDto(DtoClass, source='body'|'query'|'params')`,
    khớp `ValidationPipe { transform, whitelist, forbidNonWhitelisted }`, dùng lại NGUYÊN DTO Nest.
  - Lỗi → 400 `{ statusCode:400, message: string[], error:'Bad Request' }` — **giữ message là MẢNG**
    (đúng ValidationPipe; KHÔNG join thành chuỗi như spec mẫu, tránh vỡ frontend).
  - Express 5: `req.query`/`req.params` là getter read-only → DTO query/params đã transform phơi qua
    `req.validated[source]` (augment `Express.Request.validated`), KHÔNG gán đè. body thì `req.body = dto`.
  - Nâng `HttpException` mang `response: string | string[]`; viết lại `error.middleware` render
    `{ statusCode, message, error? }` đúng shape Nest. `pnpm run build` PASS.
- [ ] Phase 5 — Cleanup (gỡ package Nest, sửa CI/CD, README)

---

## 📝 Ghi chú chung / vấn đề phát sinh

<!-- Agent ghi lại các khác biệt, quyết định, hoặc vấn đề cần con người review -->

- **Tổng số file `*.module.ts` quét được: 22.** Trong đó 18 module ứng dụng (liệt kê ở trên,
  tính vào tiến độ) + 4 module hạ tầng xử lý ở Phase 1 (`app.module`, `core/database`,
  `core/cache`, `redis`) nên KHÔNG tính vào con số 18.
- **Package manager là `pnpm` (pnpm@11.1.1), KHÔNG phải npm.** Build hiện tại: `nest build`.
  Express 5.2.1 + class-validator/transformer + mongoose đã có sẵn trong dependencies.
- **Vòng lặp phụ thuộc auth ↔ loyalty ↔ voucher:** trong Nest dùng `forwardRef`. Ở Express,
  service khởi tạo thủ công nên vòng lặp không gây lỗi DI; nhiều quan hệ "→ auth" thực chất chỉ
  là dùng `JwtAuthGuard`/`RolesGuard` → đã được thay bằng `authMiddleware`/`roleMiddleware` ở
  Phase 2 (hạ tầng dùng chung), nên phần lớn phụ thuộc vào auth được gỡ tự nhiên.
- KHÔNG xoá code Nest cho tới Phase 5. Tạo cấu trúc Express song song.

### 🟠 Hạng mục cross-cutting
1. **Rate-limiting** — ✅ **PORTED (2026-06-18)**. `express-rate-limit` + `rate-limit-redis` (store
   Redis qua `core/redis`, KHÔNG in-memory). `src/middlewares/rate-limit.middleware.ts`:
   `globalRateLimiter` (60/60s, prefix `rl:global:`) mount đầu `apiRouter`; `chatRateLimiter`
   (20/60s, prefix `rl:chat:`) mount trước `/chat`. 429 body khớp Nest ThrottlerException byte-for-byte:
   `{statusCode:429,message:"ThrottlerException: Too Many Requests"}`. Verified trên wdp301_test:
   global #61→429, chat #21→429. (OTP rate-limit trong service vẫn riêng, không đổi.)
2. **Swagger** — chưa port (optional). Đề xuất `swagger-ui-express` + sinh spec, hoặc bỏ.
3. **Entrypoint** — `src/server.ts` (Express) ĐÃ smoke-test với DB+Redis thật (2026-06-17, xem
   mục 🧪 dưới): boot OK, 18 module/route chạy đúng. `serverless.ts`/`main.ts` (Nest) vẫn là
   entrypoint đang chạy. Vercel `vercel.json` vẫn trỏ `serverless.ts`.
4. **Build** vẫn là `nest build` (type-check cả cây). Đổi sang `tsc` + `node dist/server.js`
   ở Phase 5.
5. **404 route-not-found** — ✅ **PORTED (2026-06-18)**. `src/middlewares/not-found.middleware.ts`
   (`notFoundHandler`) mount sau mọi router, trước `errorMiddleware`. **Đã VERIFY hành vi Nest thật**
   (boot `dist/main.js` trên wdp301_test): Nest 11 trả **JSON** `{"message":"Cannot <M> <url>",
   "error":"Not Found","statusCode":404}` (application/json) — backlog assumption ĐÚNG (KHÔNG phải
   HTML như tôi nghi ban đầu). Express giờ trả body byte-identical (kể cả thứ tự key message-first).
   `NotFoundException` từ service vẫn đi qua errorMiddleware như cũ, không ảnh hưởng.

### 🟣 Vercel serverless gate cho Express (2026-06-18) — A–D done (additive, CHƯA deploy)
Chuẩn bị cho Express chạy trên Vercel **song song**, KHÔNG đụng entrypoint Nest đang prod.
Tất cả additive: `vercel.json` (trỏ `serverless.ts` của Nest) GIỮ NGUYÊN, `main.ts`/`server.ts`
không đổi. **Chưa deploy, chưa Phase 5.**

- **A — `src/serverless.express.ts`** (mirror `serverless.ts` của Nest cho Express):
  - `createApp()` cache module-scope (build app 1 lần / warm instance, không I/O).
  - `bootstrapPromise` cache `connectDB() + seedDefaults()` — chạy **ĐÚNG 1 LẦN**, KHÔNG per-request
    (tránh cạn Mongo pool Atlas). `export default async (req,res) => { await bootstrapPromise; app(req,res); }`.
  - **KHÔNG `app.listen`**, **KHÔNG `registerCrons`** (node-cron không chạy trên serverless — instance
    freeze giữa các request; cron để **dormant**, khớp cách Nest chạy trên Vercel). Cron (Vercel Cron)
    là mục ngoài scope đợt này.
  - DNS workaround (`8.8.8.8`) chỉ khi `nodeEnv !== 'production'` (no-op trên Vercel) — giữ giống `server.ts`.
- **B — `vercel.preview.json`** (file RIÊNG, KHÔNG đụng `vercel.json` prod): build + route `/(.*)` →
  `src/serverless.express.ts` qua `@vercel/node`. Dùng cho preview deploy thủ công (`vercel --local-config`).
- **C — Env Preview** (liệt kê, KHÔNG set hộ — xem mục dưới + báo cáo): `DB_NAME=wdp301_test`,
  Redis test/namespaced, `PAYOS_WEBHOOK_URL=""` và **KHÔNG set `ENABLE_PAYOS_WEBHOOK`**, SMTP/Gemini
  test key. **TUYỆT ĐỐI KHÔNG copy nguyên prod env sang Preview.**
- **D — Guard PayOS webhook (fail-closed)** — `src/modules/order/payos.service.ts#registerWebhook`:
  chỉ gọi `webhooks.confirm` khi `process.env.ENABLE_PAYOS_WEBHOOK === 'true'`. Không flag → return sớm,
  **KHÔNG outward call**. ⚠️ **CỐ Ý KHÔNG key vào `NODE_ENV`**: Vercel đặt `NODE_ENV=production` cả trên
  Preview → guard bằng NODE_ENV sẽ vẫn register trên preview và **hijack webhook prod**. Phải dùng flag tường minh.
  - 🔴 **Phase 5 cutover prod PHẢI set `ENABLE_PAYOS_WEBHOOK=true` ở prod scope**, nếu không prod sẽ
    **ngừng register webhook** → đơn online kẹt UNPAID (PayOS không có nơi gửi notify).

**Build:** `pnpm run build` (nest build) PASS — `dist/serverless.express.js` sinh ra OK.

**Local smoke (handler `(req,res)` qua supertest, trên `wdp301_test`, GATE đọc-trước-ghi PASS
`CONNECTED_DB=wdp301_test`):**
| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 | `GET /api/health` → 200 `{status:ok}` | ✅ PASS |
| 2 | bootstrap/`connectDB` gọi **ĐÚNG 1 lần** qua 7 request (spy đếm) | ✅ PASS (`connectCount=1`) |
| 3 | `GET /api/me/orders` no-token → 401 `{statusCode:401,message:"Unauthorized"}` | ✅ PASS |
| 4 | route lạ → 404 JSON `{message,error:"Not Found",statusCode:404}` (qua đường serverless) | ✅ PASS |
| 5 | PayOS **KHÔNG** register lúc boot (flag chưa set) — không outward call | ✅ PASS (log skip; no registered/failed) |
| 6 | request #61 → 429 `{statusCode:429,message:"ThrottlerException: Too Many Requests"}` qua serverless | ✅ PASS |

**Dọn:** drop `wdp301_test` → `RESIDUAL_COLLECTIONS=0`; xoá rate-limit keys (`rl:global:`/`rl:chat:`);
file tạm `smoke-serverless.cjs` đã xoá. Prod `wdp301` không bị đụng.
**Còn lại (con người tự chạy — bước F):** set env Preview trên Vercel dashboard + `vercel` deploy preview
(KHÔNG `--prod`) với `--local-config vercel.preview.json`.

### 🧪 Smoke-test runtime (2026-06-17, DB+Redis THẬT) — KẾT QUẢ
Boot `node dist/server.js` với `.env` thật. Tổng kết:
| Step | Hạng mục | Kết quả |
|---|---|---|
| 1 | Boot + Redis + Mongo + seed + wire router | ✅ PASS (server `:3000/api`) |
| 1b | Wiring đầy đủ 27 router | ⚠️→✅ — smoke-test BẮT lỗi `service-type` (public+admin) **chưa mount** trong `app.ts`; đã **fix wiring** (thêm 2 `apiRouter.use`), verify lại 200/401 OK |
| 2 | register→login→JWT, /me, role pass(admin 200)+reject(customer 403), no-token 401 | ✅ PASS, body khớp Nest |
| 2 | verified-email route | ⚪ N/A — `VerifiedEmailGuard` không gắn `@UseGuards` vào route nào ở Nest → Express cũng không (parity) |
| 3 | order: preview (golden-hour+tier 2%), invalid-combo 400, available-slots, create cash 201 CONFIRMED | ✅ PASS |
| 3 | work-order: check-in 201 (order→checked_in, cash→paid), assign off-shift→400 guard, queue/get | ✅ PASS (assign→start→finish→QC bị gate "washer phải trong ca lúc này" — 19:00 ngoài giờ, parity Nest, không test được lúc đó) |
| 4 | dashboard `$facet/$lookup`: admin scope=full (số liệu thật + ranking tên KH), manager scope=manager (ranking redact `[]`) | ✅ PASS |
| 5 | node-cron fire | ✅ PASS — chèn order pending giả created_at−20′ → cron `order-expiry` log `Auto-cancelled 1 orders`, order→`cancelled/Payment timeout` |
| 6 | error body shape: validation(**message ARRAY**)+Bad Request, 409 Conflict, 401 Invalid credentials, 404 NotFound | ✅ PASS khớp Nest; chỉ route-404 lệch (mục 5 trên) |

**KHÔNG có lệch nào về business logic / response shape ở route đã mount.** Lệch duy nhất: (a) `service-type` thiếu mount — đã fix; (b) route-404 dùng HTML default — ghi backlog.
Side-effect dev DB: **ĐÃ DỌN SẠCH (2026-06-18)** — xoá khớp kỳ vọng users=3, loyalty_accounts=3,
orders=2, work_orders=1, vehicles=1, staff_shifts=1; residual=0. Audit xác nhận cron order-expiry
chỉ hủy đúng 1 order giả (note SMOKE-STALE-ORDER), KHÔNG dính order thật. File tạm `smoke-*.js` đã xoá.

### ✅ Work-order full chain (assign→start→finish→QC) — PASS trên DB TEST (2026-06-18)
Chạy trên **`wdp301_test`** (cùng cluster, DB riêng; GATE verify `CONNECTED_DB=wdp301_test`≠`wdp301`
trước khi ghi). Seed-on-boot dựng baseline (5 roles/4 tiers/2 golden/8 FAQ) vào DB rỗng OK. Tự seed
vehicle-type + service-type(+pricing) + ca sáng phủ now + admin/washer user.
| Transition | HTTP | order | work-order |
|---|---|---|---|
| check-in | 201 | confirmed→**checked_in** (+cash paid) | tạo WO, **auto-assigned** (washer on-shift now) |
| assign (explicit) | 200 | checked_in | assigned |
| start (washer) | 200 | **in_progress** | **in_progress** |
| finish (+photo) | 200 | in_progress | **quality_check** |
| QC pass (admin) | 200 | **completed** | **done** (qcPassed:true) |
- Loyalty earn hook fired: `markCompletedByWorkOrder→applyOrderCompleted` → pointsBalance **39**
  (39000/1000×1, tier None) — đúng công thức. KHÔNG lệch Nest.
- **Dọn:** drop cả DB `wdp301_test` (17 coll → 0). PROD `wdp301` xác nhận read-only nguyên vẹn.
- File tạm `smoke-*.js` đã xoá hết.

### ✅ Phase 4 hoàn tất — sẵn sàng Phase 5 (Cleanup)
Tất cả 18 module đã có bản Express song song dưới `src/modules/`, wire đủ trong `src/app.ts`,
seed + cron chạy trong `src/server.ts` bootstrap. `pnpm run build` PASS. **TRƯỚC khi vào Phase 5
(gỡ `@nestjs/*`, xoá `src/features`, `*.module.ts`, `main.ts`, `serverless.ts`...) phải DỪNG hỏi
xác nhận** theo đúng quy tắc.
- **Hạ tầng dùng chung phát sinh khi làm Phase 4 (tái dùng cho mọi module sau):**
  - `src/common/exceptions.ts` — bản thay `@nestjs/common` exception (BadRequest/Unauthorized/
    Forbidden/NotFound/Conflict/InternalServerError/ServiceUnavailable/PayloadTooLarge/
    UnprocessableEntity), khớp ĐÚNG body Nest (`{statusCode,message,error?}`, no-arg vs có message).
  - `src/common/params.ts` — `IdParam` để typing `Request<IdParam>` (Express 5: `req.params`
    là `string | string[]`).
  - **2 fix Express 5 cho hạ tầng nền:** `asyncHandler` đã thành generic giữ kiểu param;
    `validateDto` trả `RequestHandler<any>` để không ghim param-type khi đứng trước handler
    `Request<IdParam>` trên cùng route.
- **Khuôn mẫu module CRUD (áp dụng cho các module còn lại):** `entity → model` (plain Mongoose,
  giữ nguyên collection/field/index/timestamps), `repository` (bỏ `@InjectModel` → model trực tiếp),
  `service` (bỏ `@Injectable`, exception từ `common/exceptions`, `Logger`→`console`, reuse DTO `features/`),
  `controller` (`res.json`, status theo verb Nest), `router` (DI thủ công + `authMiddleware`/
  `roleMiddleware`/`validateDto`/`asyncHandler`). `@Controller('x')`+`@Controller('admin/x')` → 2 router.
- **`onModuleInit` seeding** (golden-hour, pricing-policy, tier-config) đã chuyển vào `server.ts`
  bootstrap, chạy sau `connectDB()` trước `listen()`. main.ts/serverless.ts (Nest) vẫn seed như cũ.
