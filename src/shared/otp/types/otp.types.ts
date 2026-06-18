export interface IStoredOtp {
  /** Hex-encoded sha256 of the 6-digit OTP code. */
  hash: string;
  attempts: number;
  /** Epoch ms when the record was created. */
  createdAt: number;
}

export interface IOtpSendResult {
  /** True if no email was sent because the recipient is already verified within the skip window. */
  skipped: boolean;
}
