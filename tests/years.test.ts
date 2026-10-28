import { describe, expect, it } from 'vitest';
import { addYears, fixRange, formatRange, formatYear, parseYear, MIN_YEAR, MAX_YEAR } from '../src/years';
import { tToYear, yearToT } from '../src/timescale';

describe('years', () => {
  it('formats BCE and CE', () => {
    expect(formatYear(-500)).toBe('500 BCE');
    expect(formatYear(1250)).toBe('1250 CE');
    expect(formatYear(-123000)).toBe('123,000 BCE');
    expect(formatRange(-753, -509)).toBe('753–509 BCE');
    expect(formatRange(-27, 476)).toBe('27 BCE – 476 CE');
  });

  it('skips year 0 when stepping', () => {
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(addYears(-5, 10)).toBe(6);
    expect(addYears(100, -100)).toBe(-1);
    expect(addYears(MAX_YEAR, 10)).toBe(MAX_YEAR);
    expect(addYears(MIN_YEAR, -10)).toBe(MIN_YEAR);
  });

  it('fixes ranges touching year 0', () => {
    expect(fixRange(-14, 0)).toEqual([-14, -1]);
    expect(fixRange(0, 50)).toEqual([1, 50]);
    expect(fixRange(0, 0)).toEqual([-1, -1]);
  });

  it('parses user input', () => {
    expect(parseYear('-500')).toBe(-500);
    expect(parseYear('500 BC')).toBe(-500);
    expect(parseYear('500 bce')).toBe(-500);
    expect(parseYear('10,000 BC')).toBe(-10000);
    expect(parseYear('AD 1250')).toBe(1250);
    expect(parseYear('1250 CE')).toBe(1250);
    expect(parseYear('0')).toBeNull();
    expect(parseYear('rome')).toBeNull();
    expect(parseYear('-500 BC')).toBeNull();
  });
});

describe('timescale', () => {
  it('maps the ends', () => {
    expect(tToYear(0)).toBe(MIN_YEAR);
    expect(tToYear(1)).toBe(MAX_YEAR);
    expect(yearToT(MIN_YEAR)).toBe(0);
    expect(yearToT(MAX_YEAR)).toBe(1);
  });

  it('round-trips years in the detailed range', () => {
    for (const y of [-3000, -500, -1, 1, 117, 999]) {
      expect(Math.abs(tToYear(yearToT(y)) - y)).toBeLessThanOrEqual(1);
    }
  });

  it('never returns year 0', () => {
    for (let i = 0; i <= 10000; i++) expect(tToYear(i / 10000)).not.toBe(0);
  });
});
