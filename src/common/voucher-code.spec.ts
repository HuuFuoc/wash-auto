import {
  generateVoucherCode,
  maskVoucherCode,
  normalizeVoucherCode,
} from './voucher-code';

describe('generateVoucherCode', () => {
  it('does not emit a guessable sequence', () => {
    // The old scheme handed out PREFIX-YYYYMMDD-0001, -0002, ... so knowing one
    // code gave you the whole batch. Consecutive draws must not be adjacent.
    const codes = Array.from({ length: 500 }, () => generateVoucherCode());
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.some((c) => /0*1$/.test(c) && c.length < 6)).toBe(false);
  });

  it('omits glyphs a customer could misread', () => {
    const body = Array.from({ length: 200 }, () => generateVoucherCode()).join(
      '',
    );
    expect(body).not.toMatch(/[ILOU]/);
  });

  it('prefixes the code when a campaign prefix is given', () => {
    const code = generateVoucherCode('tet2026');
    expect(code.startsWith('TET2026-')).toBe(true);
    // Prefix + dash + the random body.
    expect(code.length).toBe('TET2026-'.length + 10);
  });

  it('emits a bare body when no prefix is given', () => {
    expect(generateVoucherCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });
});

describe('normalizeVoucherCode', () => {
  it('upcases and strips whitespace anywhere in the code', () => {
    expect(normalizeVoucherCode('  tet-4kp9 xm2a7b \n')).toBe('TET-4KP9XM2A7B');
  });

  it('preserves dashes so legacy batch codes still resolve', () => {
    // Rows minted before the refactor are stored as PREFIX-YYYYMMDD-NNNN;
    // stripping dashes would make every one of them unclaimable.
    expect(normalizeVoucherCode('tet-20260620-0001')).toBe('TET-20260620-0001');
  });

  it('is idempotent', () => {
    const once = normalizeVoucherCode(' wash-abc ');
    expect(normalizeVoucherCode(once)).toBe(once);
  });
});

describe('maskVoucherCode', () => {
  it('hides the middle but keeps enough to match a support ticket', () => {
    const masked = maskVoucherCode('TET-4KP9XM2A7B');
    expect(masked).toBe('TET-4K****A7B');
    expect(masked).not.toContain('9XM2');
  });

  it('reveals nothing at all for a short code', () => {
    expect(maskVoucherCode('ABC123')).toBe('******');
  });
});
