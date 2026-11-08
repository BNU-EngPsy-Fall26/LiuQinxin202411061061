import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { loadAuthConfig } from './auth.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const dbPath = path.resolve(process.env.DB_PATH ?? path.join(dataDir, 'lab.db'));
const auth = loadAuthConfig(dataDir);
const db = createDatabase(dbPath);
const staticDir = path.resolve('dist');

const app = createApp({
  db,
  auth,
  staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('  ✦ Dreamy Attention Lab');
  console.log(`  API   http://localhost:${port}/api/health`);
  console.log(`  DB    ${dbPath}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `  Admin researcher / ${process.env.RESEARCHER_PASSWORD ?? 'dreamlab'} (development default)`,
    );
  }
  console.log('');
});

function shutdown(signal: string) {
  console.log(`\n${signal} received, closing server…`);
  server.close(() => {
    try {
      db.close();
    } catch {
      // DatabaseSync may already be closed.
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
