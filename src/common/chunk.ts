export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
