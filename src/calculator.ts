// Simple calculator - intentionally has a bug (subtract instead of add)
export function add(a: number, b: number): number {
  return a - b;  // BUG: should be a + b
}

export function multiply(a: number, b: number): number {
  return a * b;
}
