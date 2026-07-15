# Realtime contract (web + mobile)

Web và mobile dùng **chung một Socket.IO server**. Không có namespace, path, port hay
backend riêng cho mobile. Nguồn: [src/core/realtime.ts](src/core/realtime.ts).

---

## 1. Connection

```text
Base URL:             cùng domain với REST API (không có host riêng cho realtime)
Path:                 /socket.io          (mặc định, không override)
Namespace:            /                   (mặc định, không có io.of())
Protocol:             Socket.IO v4 (server: socket.io ^4.8.3, Engine.IO 4)
Recommended transport: websocket
```

> **Bắt buộc dùng Socket.IO client.** Server chạy giao thức Engine.IO, **không phải**
> WebSocket thuần. `web_socket_channel` (Dart), `URLSessionWebSocketTask` (iOS) hay
> `WebSocket` API (RN) sẽ **fail ngay ở handshake**.

| Client | Thư viện |
| --- | --- |
| Flutter | `socket_io_client` (bản hỗ trợ Socket.IO v4 / EIO=4) |
| React Native | `socket.io-client` ^4.x |
| Android native | `io.socket:socket.io-client` 2.x |
| iOS native | `socket.io-client-swift` 16.x |

### Transport

Backend **cho phép cả `polling` và `websocket`** (không ép ở server, để không làm gãy
web client hiện tại). Mobile **nên** đặt `transports: ['websocket']` vì:

- Mobile không cần fallback polling.
- Polling khi chạy nhiều instance có thể cần sticky session.
- Reconnect đơn giản hơn với WebSocket-only.

Lưu ý: WebSocket-only **không** tự động giải quyết mọi giới hạn của Vercel Fluid
Compute — phần này chưa được kiểm thử trên production (xem mục 7).

---

## 2. Authentication

JWT **access token** (cùng token dùng cho REST). Không dùng cookie, không dùng query param.

Ưu tiên `auth.token`:

```json
{
  "auth": {
    "token": "<access-token>"
  }
}
```

Hoặc header (client native):

```text
Authorization: Bearer <access-token>
```

Server verify token ở handshake, rồi **tự** đưa socket vào room dựa trên payload đã verify:

- `user:{sub}` — mọi thiết bị của user đó (web + iOS + Android cùng nhận).
- `role:{role}` — feed theo vai trò (manager/admin).

> Client **không** gửi `userId`, `role` hay tên room. Không có event `join-room`.
> Mọi giá trị client tự khai trong handshake đều bị bỏ qua.

### Authentication errors

Handshake bị từ chối → client nhận `connect_error`. Socket.IO bọc lỗi lại, nên gói thật
sự đi trên dây (đã kiểm chứng bằng Engine.IO polling handshake) là:

```json
{
  "message": "Authentication failed",
  "data": { "code": "AUTH_TOKEN_EXPIRED", "message": "Access token has expired" }
}
```

Client đọc **`err.data.code`** (không phải `err.code`). Bốn giá trị có thể có:

```text
AUTH_TOKEN_MISSING     Không gửi token
AUTH_TOKEN_INVALID     Token sai định dạng / sai chữ ký
AUTH_TOKEN_EXPIRED     Token hết hạn
AUTH_USER_INVALID      Payload token thiếu `sub` hợp lệ
```

Riêng event `auth:error` (token chết giữa chừng) thì payload phẳng, không bọc:

```json
{ "code": "AUTH_TOKEN_EXPIRED", "message": "Access token has expired" }
```

**Token hết hạn khi socket đang mở:** access token TTL mặc định 15 phút. Server hẹn
timer tới đúng thời điểm `exp`, emit event `auth:error` (cùng payload trên) rồi
**disconnect**. Server **không bao giờ** tự refresh token — client phải refresh qua REST
rồi kết nối lại.

---

## 3. Server events (server → client)

Đúng theo source code, không thêm event nào khác.

| Event | Payload | Ai nhận |
| --- | --- | --- |
| `notification:new` | `{ id, type, title, body, data?, isRead, createdAt }` | user liên quan |
| `wash:assigned` | `WorkOrderResponseDto` | washer được giao + manager/admin + khách của đơn |
| `wash:started` | `WorkOrderResponseDto` | manager/admin + khách của đơn |
| `wash:completed` | `WorkOrderResponseDto` | manager/admin + khách của đơn |
| `order:created` | `OrderResponseDto` | manager/admin/cashier |
| `order:status` | `OrderResponseDto` | manager/admin/cashier + khách của đơn |
| `slots:changed` | `{ date: 'YYYY-MM-DD' }` (ngày giờ VN, UTC+7) | mọi customer đang kết nối |
| `feedback:created` | `FeedbackResponseDto` | manager/admin |
| `auth:error` | `{ code, message }` | socket bị ảnh hưởng (rồi disconnect) |

`WorkOrderResponseDto` gồm: `id, orderId, code, vehicleSnapshot { plate, vehicleTypeName, color? },
serviceName, status, assignedWasherId?, assignedWasherName?, checkinPhotos[], checkoutPhotos[],
scheduledAt?, startedAt?, finishedAt?, estimatedMinutes, createdAt, updatedAt`.

`order:status` phát khi: khách hủy / dời lịch, PayOS webhook (paid → CONFIRMED,
fail → CANCELLED), staff đổi trạng thái tay, đơn hoàn tất, cashier xác nhận
tiền mặt (payment_status → PAID, status giữ nguyên), cron NO_SHOW / hết hạn
thanh toán. Payload luôn là `OrderResponseDto` đầy đủ — client cập nhật thẳng,
không cần gọi REST bù.

`slots:changed` phát khi slot một ngày thay đổi (đơn tạo/hủy/dời/no-show).
Client đang mở màn đặt lịch: nếu `date` trùng ngày đang xem → refetch
`GET /orders/available-slots`. Client khác: bỏ qua.

## 4. Client events (client → server)

```text
Hiện không có event nghiệp vụ client → server.
Các thao tác nghiệp vụ sử dụng REST API.
```

Socket **chỉ** để báo có dữ liệu mới. Nhận việc, bắt đầu rửa, hoàn tất, đánh dấu đã đọc
thông báo… đều gọi REST như web.

---

## 5. Reconnect flow

```text
1. Nhận connect_error (handshake bị từ chối) hoặc auth:error (token chết giữa chừng).
2. Đọc error code.
3. Nếu AUTH_TOKEN_EXPIRED → gọi REST refresh token.
4. Cập nhật socket.auth.token bằng access token mới.
5. Disconnect socket cũ nếu cần.
6. Connect lại.
7. Gọi REST để đồng bộ dữ liệu đã bỏ lỡ trong lúc offline.
```

**Bước 7 là bắt buộc.** Event phát ra lúc app offline sẽ mất vĩnh viễn trên socket
(không có replay). Notification đã được **lưu DB trước khi emit**, nên REST là nguồn sự thật:

```text
GET   /api/me/notifications?page=&limit=
GET   /api/me/notifications/unread-count
PATCH /api/me/notifications/:id/read
PATCH /api/me/notifications/read-all
```

Gọi lại các endpoint này mỗi khi app resume từ background hoặc sau khi reconnect.

> ⚠️ **Cạm bẫy lớn nhất của mobile:** socket.io-client gửi lại **đúng object `auth` cũ**
> khi tự reconnect. Nếu không cập nhật `socket.auth.token`, sau 15 phút client sẽ reconnect
> bằng token đã hết hạn và bị từ chối liên tục. Luôn set lại token trước khi reconnect.

---

## 6. Flutter example

```dart
final socket = IO.io(
  baseUrl,
  IO.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({'token': accessToken})
      .disableAutoConnect()
      .enableReconnection()
      .build(),
);

// Luôn gắn token MỚI NHẤT trước mỗi lần (re)connect.
socket.onReconnectAttempt((_) async {
  socket.auth = {'token': await tokenStore.validAccessToken()};
});

socket.onConnectError((err) {
  // err là Map: { message: 'Authentication failed', data: { code: ..., message: ... } }
  final code = (err is Map) ? err['data']?['code'] : null;
  if (code == 'AUTH_TOKEN_EXPIRED' || code == 'AUTH_TOKEN_INVALID') {
    // refresh token qua REST rồi socket.connect() lại
  }
});

// Token chết trong lúc socket đang mở.
socket.on('auth:error', (data) {
  // refresh token qua REST, cập nhật socket.auth, rồi connect lại
});

socket.on('notification:new', (data) { /* ... */ });
socket.on('wash:assigned', (data) { /* ... */ });

socket.connect();
```

React Native dùng `socket.io-client` với cùng option (`transports: ['websocket']`,
`auth: { token }`), và cập nhật `socket.auth.token` trong handler `reconnect_attempt`.

---

## 7. Giới hạn đã biết

**Push notification: CHƯA CÓ.**

```text
Socket.IO phục vụ realtime khi app đang hoạt động.
Push notification cần được triển khai riêng nếu muốn nhận thông báo khi app bị kill
hoặc chạy nền lâu (hệ điều hành sẽ ngắt socket).
```

Backend hiện không có FCM / APNs / Expo và không lưu device token.

**Multi-instance:** server đã hỗ trợ Socket.IO Redis adapter
([src/core/realtime-adapter.ts](src/core/realtime-adapter.ts)), bật khi có `REDIS_URL`
(tắt bằng `SOCKET_REDIS_ENABLED=false`, ép bắt buộc bằng `SOCKET_REDIS_REQUIRED=true`).
Khi **không** có Redis, server vẫn chạy bình thường ở chế độ single-instance, nhưng emit
chỉ tới được các socket nằm trên **cùng một instance**.

Hành vi thực tế của WebSocket dài hạn + Redis Pub/Sub trên Vercel Fluid Compute
**chưa được kiểm thử trên production**.
