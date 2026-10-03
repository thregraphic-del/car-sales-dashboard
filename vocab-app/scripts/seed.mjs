// Local development: replace the local database content with fresh demo data.
//   npm run seed
// Never use against production data (it clears the learning data first).
import { config } from '../server/config.js';
import { resetDemo } from '../server/data/demo.js';
import { close } from '../server/db/index.js';

if (config.app.production || config.db.url) {
  console.error('Refusing to reset: this command is for the local SQLite database only.');
  process.exit(1);
}
console.log('Demo data:', await resetDemo());
await close();
