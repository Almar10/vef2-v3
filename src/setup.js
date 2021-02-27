import { readFile } from 'fs/promises';
import faker from 'faker';
import dotenv from 'dotenv';
import { query, insert } from './db.js';

dotenv.config();

const {
  DATABASE_URL: connectionString,
} = process.env;

if (!connectionString) {
  console.error('Vantar DATABASE_URL');
  process.exit(1);
}

async function initialize() {
  await query('DROP TABLE IF EXISTS signatures');

  try {
    const createTable = await readFile('./sql/schema.sql');
    await query(createTable.toString('utf8'));
    console.info('Table made');
  } catch (e) {
    console.error(e.message);
  }

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 510; i++) {
    // eslint-disable-next-line no-await-in-loop
    const data = await {
      name: faker.name.findName(),
      nationalId: Math.floor(Math.random() * (9999999999 - 1000000000 + 1) + 1000000000),
      comment: (Math.random() > 0.4) ? faker.lorem.sentence() : '',
      anonymous: Math.random() > 0.4,
    };

    try {
      // eslint-disable-next-line no-await-in-loop
      await insert(data);
    } catch (e) {
      console.error(e.message);
    }
  }
}

initialize().catch((err) => {
  console.error(err);
});
