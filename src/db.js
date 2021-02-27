import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {
  DATABASE_URL: connectionString,
  NODE_ENV: nodeEnv = 'development',
} = process.env;

if (!connectionString) {
  console.error('Vantar DATABASE_URL');
  process.exit(1);
}

const ssl = nodeEnv !== 'development' ? { rejectUnauthorized: false } : false;

const pool = new pg.Pool({ connectionString, ssl });

pool.on('error', (err) => {
  console.error('Villa í tengingu við gagnagrunn, forrit hættir', err);
  process.exit(-1);
});

export async function query(_query, values = []) {
  const client = await pool.connect();

  try {
    const result = await client.query(_query, values);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Insert a single registration into the registration table.
 *
 * @param {string} entry.name – Name of registrant
 * @param {string} entry.nationalId – National ID of registrant
 * @param {string} entry.comment – Comment, if any from registrant
 * @param {boolean} entry.anonymous – If the registrants name should be displayed or not
 * @returns {Promise<boolean>} Promise, resolved as true if inserted, otherwise false
 */
export async function insert({
  name, nationalId, comment, anonymous,
} = {}) {
  let success = true;

  const q = `
    INSERT INTO signatures
      (name, nationalId, comment, anonymous)
    VALUES
      ($1, $2, $3, $4);
  `;
  const values = [name, nationalId, comment, anonymous === 'on'];

  try {
    await query(q, values);
  } catch (e) {
    console.error('Error inserting signature', e);
    success = false;
  }

  return success;
}

export async function counter() {
  let result = [];
  try {
    const queryResult = await query(
      'SELECT COUNT(*) AS count FROM signatures',
    );

    if (queryResult) {
      result = queryResult.rows;
    }
  } catch (e) {
    console.error('Error counting signatures', e);
  }

  return result;
}

// Helper to remove pg from the event loop
export async function end() {
  await pool.end();
}

export async function selectFromInterval(offset, limit) {
  const client = await pool.connect();

  try {
    const q = 'SELECT * FROM signatures ORDER BY id OFFSET $1 LIMIT $2';
    const res = await client.query(q, [offset, limit]);

    return res.rows;
  } catch (e) {
    console.error('Error selecting', e);
  } finally {
    client.release();
  }

  return [];
}

export async function deleteSigniture(id) {
  const q = 'DELETE FROM signatures WHERE id = $1';
  return query(q, id);
}
