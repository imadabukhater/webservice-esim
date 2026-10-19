/**
 * Apply hand-written SQL migration files to an EXISTING database, safely
 * re-runnable: statements that were already applied are skipped.
 *
 *   DATABASE_URL=mysql://... node deploy/apply-migration.js migrations/0004_*.sql
 *
 * For a brand-new empty database use `pnpm db:migrate` instead.
 */
const fs = require('fs');
const mysql = require('mysql2/promise');

const SKIP_CODES = new Set([
  'ER_DUP_FIELDNAME', // column already added
  'ER_DUP_KEYNAME', // index/constraint already added
  'ER_TABLE_EXISTS_ERROR', // table already created
  'ER_CANT_DROP_FIELD_OR_KEY', // FK already dropped
  'ER_FK_DUP_NAME', // FK already added
]);

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node deploy/apply-migration.js <file.sql> [...]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (run via: npx env-cmd -f .env node deploy/apply-migration.js ...)');
    process.exit(1);
  }
  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  try {
    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      const statements = sql
        .split('--> statement-breakpoint')
        .map((part) => part.replace(/^(\s*--[^\n]*\n)+/, '').trim())
        .filter(Boolean);
      console.log(`==> ${file}: ${statements.length} statements`);
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          if (SKIP_CODES.has(error.code)) {
            console.log(`    skip (already applied): ${statement.slice(0, 70).replace(/\s+/g, ' ')}...`);
            continue;
          }
          console.error(`FAILED: ${statement.slice(0, 160)}\n${error.message}`);
          process.exit(1);
        }
      }
    }
    console.log('==> migrations applied');
  } finally {
    await connection.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
