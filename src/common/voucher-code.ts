import { randomBytes } from 'crypto';

/**
 * Voucher code minting + normalisation.
 *
 * The previous scheme was `PREFIX-YYYYMMDD-NNNN` off a Redis INCR, so anyone who
 * knew a campaign prefix could walk the whole batch (`...-0001`, `-0002`, ...).
 * Codes are now drawn from a CSPRNG instead.
 *
 * Alphabet is Crockford-style base32 minus I/L/O/U: no glyph pairs a customer
 * can misread off a banner (1/I/L, 0/O), and no accidental profanity from the
 * dropped vowel. 32 symbols = 5 bits each, so `RANDOM_CHARS = 10` gives 50 bits
 * ≈ 1.1e15 codes — brute-forcing one live code out of a 100k batch takes ~1e10
 * guesses, which the per-user claim limiter turns into geological time.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_CHARS = 10;

/** Rejection-sampling threshold: 256 % 32 === 0, so no modulo bias to correct. */
const BYTE_CEILING = 256 - (256 % ALPHABET.length);

/** Draws `count` uniformly-distributed symbols from ALPHABET. */
function randomSymbols(count: number): string {
  let out = '';
  while (out.length < count) {
    // Over-draw: some bytes get rejected, so ask for more than we need.
    const buf = randomBytes((count - out.length) * 2);
    for (const byte of buf) {
      if (out.length === count) break;
      if (byte >= BYTE_CEILING) continue; // biased tail — redraw
      out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

/**
 * Mints a code like `TET-4KP9XM2A7B` (or `4KP9XM2A7B` with no prefix).
 *
 * Uniqueness is NOT guaranteed here — the caller must rely on the unique index
 * on `vouchers.code` and retry on E11000. At 50 bits of entropy a collision is
 * vanishingly rare, but "rare" is not "impossible" and the DB is the authority.
 */
export function generateVoucherCode(prefix?: string): string {
  const body = randomSymbols(RANDOM_CHARS);
  const clean = prefix?.trim().toUpperCase();
  return clean ? `${clean}-${body}` : body;
}

/**
 * Canonical form for any customer-supplied code: uppercase, no whitespace
 * anywhere (people paste codes with trailing spaces or read them aloud with
 * gaps). Dashes are PRESERVED — legacy `PREFIX-YYYYMMDD-NNNN` codes are stored
 * with them, so stripping dashes would stop those vouchers being claimable.
 */
export function normalizeVoucherCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Log-safe rendering: `TET-4KP9XM2A7B` → `TET-4K****A7B`. A support agent can
 * still match it against a customer's screenshot, but a leaked log file does not
 * hand out live codes.
 */
export function maskVoucherCode(code: string): string {
  if (code.length <= 6) return '*'.repeat(code.length);
  return `${code.slice(0, -8)}${'*'.repeat(4)}${code.slice(-3)}`;
}
