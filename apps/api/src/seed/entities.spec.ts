import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedEntity {
  name: string;
  slug: string;
}

// The entity list the seed reads (spec §5.4, §5.5).
const entities: unknown = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'prisma', 'seed', 'entities.json'),
    'utf-8',
  ),
);

// The seeded demo requests depend on these (spec §5.4).
const DEMO_ENTITIES: SeedEntity[] = [
  { slug: 'moh', name: 'Ministry of Health' },
  { slug: 'zatca', name: 'Zakat, Tax and Customs Authority' },
  { slug: 'gosi', name: 'General Organization for Social Insurance' },
  { slug: 'hrsd', name: 'Ministry of Human Resources and Social Development' },
];

function duplicates(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) !== i);
}

describe('prisma/seed/entities.json', () => {
  const list = entities as SeedEntity[];

  it('is a list of { name, slug } entries', () => {
    expect(Array.isArray(entities)).toBe(true);
    for (const entry of list) {
      expect(Object.keys(entry).sort()).toEqual(['name', 'slug']);
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.slug).toBe('string');
    }
  });

  it('has short, lowercase slugs of letters and digits only', () => {
    for (const { slug } of list) expect(slug).toMatch(/^[a-z0-9]{2,16}$/);
  });

  it('has unique slugs', () => {
    expect(duplicates(list.map((e) => e.slug))).toEqual([]);
  });

  it('has unique, trimmed names', () => {
    for (const { name } of list) {
      expect(name).toBe(name.trim());
      expect(name).not.toBe('');
    }
    expect(duplicates(list.map((e) => e.name.toLowerCase()))).toEqual([]);
  });

  it('keeps the four demo entities unchanged', () => {
    for (const demo of DEMO_ENTITIES) expect(list).toContainEqual(demo);
  });
});
