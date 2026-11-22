// Minimal Cloudflare D1 stand-in on node:sqlite, enough to run the real SQL of the Worker.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  async first() { const row = this.db.prepare(this.sql).get(...this.params); return row ? { ...row } : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params).map(row => ({ ...row })) }; }
  async run() { this.db.prepare(this.sql).run(...this.params); return { success: true }; }
}

export function createD1(migration) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(migration, 'utf8'));
  return {
    raw: db,
    prepare: sql => new Statement(db, sql),
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
}
