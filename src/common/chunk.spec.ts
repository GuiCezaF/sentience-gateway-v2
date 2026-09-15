import { describe, it, expect } from 'vitest';
import { chunk } from './chunk.js';

describe('chunk', () => {
  it('retorna array vazio quando recebe array vazio', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('retorna um único chunk quando o array é menor que o tamanho', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it('divide exatamente quando o array é múltiplo do tamanho', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('divide com último chunk menor quando não é múltiplo', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('divide em elementos individuais quando size é 1', () => {
    expect(chunk(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']]);
  });

  it('lança erro se o tamanho for menor ou igual a zero', () => {
    expect(() => chunk([1], 0)).toThrow('Chunk size must be greater than 0');
    expect(() => chunk([1], -1)).toThrow('Chunk size must be greater than 0');
  });
});
