import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Project Setup', () => {
  it('should have vitest working', () => {
    expect(true).toBe(true);
  });

  it('should have fast-check working with property-based tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Commutative property of addition
        expect(a + b).toBe(b + a);
      }),
      { numRuns: 100 }
    );
  });
});
