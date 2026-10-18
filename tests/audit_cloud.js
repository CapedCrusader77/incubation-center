const { createPool, seed } = require('../server');

const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('Error: DATABASE_URL or TEST_DATABASE_URL environment variable is required.');
  console.error('Example: DATABASE_URL="postgresql://<user>:<password>@<host>:26257/<dbname>?sslmode=verify-full" node tests/audit_cloud.js');
  process.exit(1);
}
const pool = createPool(url);

async function check() {
  console.log('Connecting to CockroachDB Cloud...');
  const v = await pool.query('SELECT version()');
  console.log('Database Engine:', v.rows[0].version.split('\n')[0]);
  console.log('Seeding any missing records...');
  await seed(pool);

  const tables = [
    'people',
    'startups',
    'founders',
    'mentors',
    'mentor_assignments',
    'stage_history',
    'evaluations',
    'investors',
    'pitch_meetings',
    'investments',
    'events',
    'event_attendance',
    'patents',
    'publications',
    'grants'
  ];

  console.log('\n--- VERIFYING ALL 15 PROBLEM STATEMENT TABLES ---');
  for (const t of tables) {
    const r = await pool.query(`SELECT count(*) AS n FROM ${t}`);
    console.log(`✓ Table [${t.padEnd(20)}] exists with ${r.rows[0].n} rows`);
  }

  console.log('\n--- TESTING COMPLEX QUERIES & AGGREGATIONS ---');
  // 1. Funding by startup
  const funding = await pool.query(`
    SELECT s.name, s.domain, s.stage, COALESCE(sum(i.amount),0) AS total_funding
    FROM startups s LEFT JOIN investments i ON i.startup_id = s.id
    GROUP BY s.name, s.domain, s.stage
    ORDER BY total_funding DESC
  `);
  console.log('Startup Funding Summary:', funding.rows);

  // 2. Mentors with their affiliated person name and assigned startup count
  const mentors = await pool.query(`
    SELECT p.name AS mentor_name, p.affiliation, m.expertise, count(a.startup_id) AS assigned_startups
    FROM mentors m
    JOIN people p ON p.id = m.person_id
    LEFT JOIN mentor_assignments a ON a.mentor_id = m.id
    GROUP BY p.name, p.affiliation, m.expertise
  `);
  console.log('Mentors & Caseload:', mentors.rows);

  // 3. Evaluations with average score
  const evals = await pool.query(`
    SELECT s.name AS startup, e.metric, avg(e.score) AS avg_score
    FROM evaluations e JOIN startups s ON s.id = e.startup_id
    GROUP BY s.name, e.metric
  `);
  console.log('Evaluations Metrics:', evals.rows);

  await pool.end();
  console.log('\nALL CHECKS PASSED SUCCESSFULLY!');
}

check().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
