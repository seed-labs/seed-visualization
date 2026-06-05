import tleText from '../../../../starlink-used.txt?raw';
import type { TleRecord } from '@/features/starlink/types';

export function parseTleRecords(text = tleText): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const records: TleRecord[] = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1?.startsWith('1 ') && line2?.startsWith('2 ')) {
      records.push({
        id: line1.slice(2, 7),
        name,
        line1,
        line2,
      });
    }
  }

  return records;
}
