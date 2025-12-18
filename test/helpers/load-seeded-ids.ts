// test/helpers/load-seeded-ids.ts
import * as fs from 'fs';
import * as path from 'path';

interface SeededIds {
  users: {
    adminId: number;
    customer1Id: number;
    customer2Id: number;
  };
  providers: number[];
  plans: number[];
  esims: number[];
  orders: number[];
}

let cachedIds: SeededIds | null = null;

/**
 * Load the seeded IDs from the JSON file created during global setup.
 * This function caches the result for subsequent calls.
 */
export function getSeededIds(): SeededIds {
  if (cachedIds) {
    return cachedIds;
  }

  const idsPath = path.join(__dirname, 'seeded-ids.json');

  if (!fs.existsSync(idsPath)) {
    throw new Error(
      'seeded-ids.json not found. Make sure the global setup has run.',
    );
  }

  const idsContent = fs.readFileSync(idsPath, 'utf-8');
  cachedIds = JSON.parse(idsContent) as SeededIds;
  return cachedIds;
}

/**
 * Clear the cached IDs (useful for testing)
 */
export function clearCachedIds(): void {
  cachedIds = null;
}
