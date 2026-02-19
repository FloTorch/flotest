export function gaussianRandom(mean: number, stddev: number): number {
  let u1 = Math.random();
  const u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

export function clampedGaussian(mean: number, stddev: number, min: number, max: number): number {
  const value = gaussianRandom(mean, stddev);
  return Math.max(min, Math.min(max, Math.round(value)));
}
