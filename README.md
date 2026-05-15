# SWD_SU26_BE

Wash Automation & VIP Experience

Backend API cho dự án môn WDP301 - Kỳ 8 FPT University, xây dựng bằng [NestJS](https://nestjs.com) và TypeScript.

## Yêu cầu hệ thống

- Node.js >= 18
- npm >= 9

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

```bash
# Chế độ phát triển (có hot-reload)
npm run start:dev

# Chế độ thông thường
npm run start

# Chế độ production
npm run start:prod
```

Mặc định server chạy tại: `http://localhost:3000`

## Kiểm thử

```bash
# Unit test
npm run test

# End-to-end test
npm run test:e2e

# Kiểm tra độ phủ test
npm run test:cov
```

## Build

```bash
npm run build
```

Output được tạo ra trong thư mục `/dist`.

## Cấu trúc thư mục

```
src/
├── app.module.ts        # Module gốc
├── app.controller.ts    # Controller mẫu
├── app.service.ts       # Service mẫu
└── main.ts              # Entry point
```

## Tạo module mới

Dùng NestJS CLI để sinh code tự động:

```bash
# Chỉ tạo module
nest g mo <tên-module>

# Tạo module + controller + service
nest g resource <tên-module>
```

Ví dụ:

```bash
nest g resource users
```

CLI sẽ hỏi kiểu API (REST, GraphQL, ...) rồi tạo đầy đủ file và tự đăng ký vào `AppModule`.

## Công nghệ sử dụng

- **NestJS** v11 — framework backend
- **TypeScript** v5.7
- **Jest** — unit & e2e testing
- **ESLint + Prettier** — linting & formatting
