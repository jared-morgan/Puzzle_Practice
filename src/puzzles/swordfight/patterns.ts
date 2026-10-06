import data from './patterns.json';

/** The same selection offered by RenderProbe's TrainingBot dialog, plus the starter foil. */
export const SWORDS = [
  { value: 127, label: 'Stick' }, { value: 6, label: 'Cutlass' }, { value: 2, label: 'Long sword' },
  { value: 9, label: 'Stiletto' }, { value: 18, label: 'Katana' }, { value: 17, label: 'Trunk' },
  { value: 11, label: 'Falchion' }, { value: 12, label: 'Cleaver' }, { value: 0, label: 'Foil' },
];
export const SWORD_COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Black'];
export interface Sword { type: number; color1: number; color2: number; }

/** Port of Sword.createShaftMap: permutation, horizontal mirror, then bottom-up rows. */
export function swordPattern(sword: Sword): number[][] {
  const prototype = sword.type === 127 ? data.stick : data.prototypes[sword.type];
  if (!prototype || prototype.some(row => row.some(color => color > 3))) throw new Error('Unsupported sword pattern');
  let variation = sword.type === 127 ? 0 : sword.color1 * 8 + sword.color2;
  const remaining = [0, 1, 2, 3], map: number[] = [];
  for (const radix of [4, 3, 2, 1]) { map.push(remaining.splice(variation % radix, 1)[0]); variation = Math.floor(variation / radix); }
  const mirror = variation % 2 === 1;
  return [...prototype].reverse().map(row => (mirror ? [...row].reverse() : row).map(color => map[color]));
}
export function patternColor(pattern: number[][], column: number, row: number, strike: boolean): number {
  const height = pattern.length, wrap = Math.min(height, 4);
  const y = strike ? row < height ? row : (row - height) % wrap + height - wrap : row % 2;
  return pattern[y][column];
}
