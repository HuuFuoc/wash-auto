import { setDefaultResultOrder } from 'dns';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config';

export interface IOrderConfirmationContext {
  customerName: string;
  orderId: string;
  scheduledAt: Date;
  serviceName: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  /** Present only when paymentMethod=online. */
  checkoutUrl?: string;
}

export class EmailService {
  private readonly transporter: Transporter;

  // Replaces Nest's onModuleInit: the transporter is built once when the
  // service is instantiated (a single shared instance — see getEmailService).
  constructor() {
    setDefaultResultOrder('ipv4first');
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });
    this.transporter
      .verify()
      .then(() => console.log('[EmailService] SMTP transporter ready'))
      .catch((err: Error) =>
        console.error(`[EmailService] SMTP verify failed: ${err.message}`),
      );
  }

  /**
   * Sends a transactional OTP email. Never logs the code. Resolves once
   * SMTP accepts the message - callers should await so we don't persist
   * an OTP record without successful dispatch.
   */
  async sendOtpEmail(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const ttlMin = Math.round(ttlSeconds / 60);
    const from = config.email.from;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Wash-Auto verification code',
        text: this.otpPlainBody(code, ttlMin),
        html: this.otpHtmlBody(code, ttlMin),
        headers: { 'X-Entity-Ref-ID': `otp-${Date.now()}` },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[EmailService] SMTP send failed (otp) to=${to} reason=${msg}`);
      throw err;
    }
  }

  /**
   * Sends an order confirmation email after a successful create-order call.
   * Caller is expected to swallow errors - failing the API on SMTP hiccup
   * is worse than a missed email.
   */
  async sendOrderConfirmationEmail(
    to: string,
    ctx: IOrderConfirmationContext,
  ): Promise<void> {
    const from = config.email.from;
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Xác nhận đặt lịch rửa xe #${ctx.orderId.slice(-6).toUpperCase()}`,
        text: this.orderPlainBody(ctx),
        html: this.orderHtmlBody(ctx),
        headers: { 'X-Entity-Ref-ID': `order-${ctx.orderId}` },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[EmailService] SMTP send failed (order) to=${to} orderId=${ctx.orderId} reason=${msg}`,
      );
      throw err;
    }
  }

  // ---------- templates ----------

  private otpPlainBody(code: string, ttlMin: number): string {
    return [
      'Your Wash-Auto verification code is:',
      '',
      `    ${code}`,
      '',
      `This code expires in ${ttlMin} minutes.`,
      'If you did not request it, ignore this email.',
    ].join('\n');
  }

  private otpHtmlBody(code: string, ttlMin: number): string {
    return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1f2937;">
  <p>Your <strong>Wash-Auto</strong> verification code is:</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:24px 0;">${code}</p>
  <p>This code expires in <strong>${ttlMin} minutes</strong>.</p>
  <p style="color:#6b7280;font-size:12px;">If you did not request it, please ignore this email.</p>
</body></html>`;
  }

  private orderPlainBody(ctx: IOrderConfirmationContext): string {
    const scheduled = this.formatVnDate(ctx.scheduledAt);
    const amount = this.formatVnd(ctx.amount);
    const lines = [
      `Chào ${ctx.customerName},`,
      '',
      `Cảm ơn bạn đã đặt lịch rửa xe tại Wash-Auto.`,
      '',
      `Mã đơn:       ${ctx.orderId}`,
      `Dịch vụ:      ${ctx.serviceName}`,
      `Thời gian:    ${scheduled}`,
      `Tổng tiền:    ${amount}`,
      `Thanh toán:   ${ctx.paymentMethod.toUpperCase()} (${ctx.paymentStatus})`,
    ];
    if (ctx.checkoutUrl) {
      lines.push('', `Thanh toán tại: ${ctx.checkoutUrl}`);
    } else if (ctx.paymentMethod === 'cash') {
      lines.push('', 'Vui lòng thanh toán tại quầy khi tới cửa hàng.');
    }
    lines.push('', 'Hẹn gặp bạn!');
    return lines.join('\n');
  }

  private orderHtmlBody(ctx: IOrderConfirmationContext): string {
    const scheduled = this.formatVnDate(ctx.scheduledAt);
    const amount = this.formatVnd(ctx.amount);
    const payBtn = ctx.checkoutUrl
      ? `<p style="margin:24px 0;"><a href="${ctx.checkoutUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Thanh toán ngay</a></p>`
      : ctx.paymentMethod === 'cash'
        ? `<p style="color:#6b7280;">Vui lòng thanh toán tại quầy khi tới cửa hàng.</p>`
        : '';

    return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1f2937;background:#f9fafb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px;color:#111827;">Xác nhận đặt lịch rửa xe</h2>
    <p>Chào <strong>${this.esc(ctx.customerName)}</strong>,</p>
    <p>Cảm ơn bạn đã đặt lịch tại <strong>Wash-Auto</strong>. Chi tiết đơn:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;">Mã đơn</td><td style="padding:8px 0;font-family:monospace;">${this.esc(ctx.orderId)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Dịch vụ</td><td style="padding:8px 0;">${this.esc(ctx.serviceName)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Thời gian</td><td style="padding:8px 0;"><strong>${scheduled}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Tổng tiền</td><td style="padding:8px 0;"><strong>${amount}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Thanh toán</td><td style="padding:8px 0;">${ctx.paymentMethod.toUpperCase()} · ${ctx.paymentStatus}</td></tr>
    </table>
    ${payBtn}
    <p style="color:#6b7280;font-size:12px;margin-top:32px;">Hẹn gặp bạn tại cửa hàng. Liên hệ tổng đài nếu cần hỗ trợ.</p>
  </div>
</body></html>`;
  }

  private formatVnDate(d: Date): string {
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatVnd(n: number): string {
    return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
  }

  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Shared singleton — the transporter uses a connection pool, so all callers
// (otp, order) must reuse one instance instead of `new`-ing their own.
let instance: EmailService | null = null;
export function getEmailService(): EmailService {
  if (!instance) instance = new EmailService();
  return instance;
}
