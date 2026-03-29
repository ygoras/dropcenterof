import { describe, it, expect } from 'vitest';

describe('Pagination Rules', () => {
  const parsePagination = (query: { limit?: string; offset?: string }) => {
    const limit = Math.min(parseInt(query.limit || '50'), 200);
    const offset = parseInt(query.offset || '0');
    return { limit: isNaN(limit) ? 50 : limit, offset: isNaN(offset) ? 0 : offset };
  };

  it('should use defaults when no params provided', () => {
    const { limit, offset } = parsePagination({});
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });

  it('should accept custom limit and offset', () => {
    const { limit, offset } = parsePagination({ limit: '20', offset: '40' });
    expect(limit).toBe(20);
    expect(offset).toBe(40);
  });

  it('should cap limit at 200', () => {
    const { limit } = parsePagination({ limit: '500' });
    expect(limit).toBe(200);
  });

  it('should handle NaN gracefully', () => {
    const { limit, offset } = parsePagination({ limit: 'abc', offset: 'xyz' });
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });

  it('should handle negative values', () => {
    const { limit, offset } = parsePagination({ limit: '-10', offset: '-5' });
    expect(limit).toBe(-10); // backend should clamp, but parser returns raw
    expect(offset).toBe(-5);
  });
});
