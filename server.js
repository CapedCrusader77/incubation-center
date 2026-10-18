const express = require('express');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const resources = {
  startups: { table: 'startups', fields: ['name', 'domain', 'description', 'stage', 'founded_on'], required: ['name', 'domain'], order: 'created_at DESC' },
  people: { table: 'people', fields: ['name', 'email', 'affiliation'], required: ['name', 'email', 'affiliation'], order: 'name' },
  founders: { table: 'founders', fields: ['startup_id', 'person_id', 'role'], required: ['startup_id', 'person_id'], order: 'startup_id' },
  mentors: { table: 'mentors', fields: ['person_id', 'expertise', 'organization'], required: ['person_id', 'expertise'], order: 'id' },
  mentor_assignments: { table: 'mentor_assignments', fields: ['startup_id', 'mentor_id', 'assigned_on'], required: ['startup_id', 'mentor_id'], order: 'startup_id' },
  evaluations: { table: 'evaluations', fields: ['startup_id', 'mentor_id', 'metric', 'score', 'notes', 'evaluated_on'], required: ['startup_id', 'mentor_id', 'metric', 'score'], order: 'evaluated_on DESC' },
  investors: { table: 'investors', fields: ['name', 'organization', 'email'], required: ['name', 'email'], order: 'name' },
  pitch_meetings: { table: 'pitch_meetings', fields: ['startup_id', 'investor_id', 'scheduled_at', 'outcome', 'notes'], required: ['startup_id', 'investor_id', 'scheduled_at'], order: 'scheduled_at DESC' },
  investments: { table: 'investments', fields: ['startup_id', 'investor_id', 'round_name', 'amount', 'invested_on'], required: ['startup_id', 'investor_id', 'round_name', 'amount', 'invested_on'], order: 'invested_on DESC' },
  events: { table: 'events', fields: ['title', 'event_type', 'starts_at', 'venue', 'description'], required: ['title', 'event_type', 'starts_at'], order: 'starts_at DESC' },
  event_attendance: { table: 'event_attendance', fields: ['event_id', 'startup_id'], required: ['event_id', 'startup_id'], order: 'event_id' },
  patents: { table: 'patents', fields: ['startup_id', 'title', 'application_number', 'status', 'filed_on'], required: ['startup_id', 'title', 'application_number', 'status', 'filed_on'], order: 'filed_on DESC' },
  publications: { table: 'publications', fields: ['startup_id', 'title', 'venue', 'published_on', 'doi'], required: ['startup_id', 'title', 'venue', 'published_on'], order: 'published_on DESC' },
  grants: { table: 'grants', fields: ['startup_id', 'provider', 'program', 'amount', 'awarded_on'], required: ['startup_id', 'provider', 'program', 'amount', 'awarded_on'], order: 'awarded_on DESC' }
};

const stages = ['ideation', 'validation', 'incubation', 'acceleration', 'commercialization'];
const domains = ['Artificial Intelligence', 'Healthcare', 'FinTech', 'AgriTech', 'Cybersecurity', 'Green Energy', 'Other'];

const fallbackSchema = `
CREATE TABLE IF NOT EXISTS people (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, affiliation TEXT NOT NULL CHECK (affiliation IN ('Student','Faculty','Alumni','Industry')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS startups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, domain TEXT NOT NULL CHECK (domain IN ('Artificial Intelligence','Healthcare','FinTech','AgriTech','Cybersecurity','Green Energy','Other')), description TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT 'ideation' CHECK (stage IN ('ideation','validation','incubation','acceleration','commercialization')), founded_on DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS founders (startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, person_id UUID NOT NULL REFERENCES people(id), role TEXT NOT NULL DEFAULT 'Founder', PRIMARY KEY (startup_id,person_id));
CREATE TABLE IF NOT EXISTS mentors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), person_id UUID NOT NULL UNIQUE REFERENCES people(id), expertise TEXT NOT NULL, organization TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS mentor_assignments (startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, mentor_id UUID NOT NULL REFERENCES mentors(id), assigned_on DATE NOT NULL DEFAULT CURRENT_DATE, PRIMARY KEY (startup_id,mentor_id));
CREATE TABLE IF NOT EXISTS stage_history (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, stage TEXT NOT NULL CHECK (stage IN ('ideation','validation','incubation','acceleration','commercialization')), changed_on TIMESTAMPTZ NOT NULL DEFAULT now(), notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS evaluations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, mentor_id UUID NOT NULL REFERENCES mentors(id), metric TEXT NOT NULL, score INT NOT NULL CHECK (score BETWEEN 1 AND 10), notes TEXT NOT NULL DEFAULT '', evaluated_on DATE NOT NULL DEFAULT CURRENT_DATE);
CREATE TABLE IF NOT EXISTS investors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, organization TEXT NOT NULL DEFAULT '', email TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS pitch_meetings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, investor_id UUID NOT NULL REFERENCES investors(id), scheduled_at TIMESTAMPTZ NOT NULL, outcome TEXT NOT NULL DEFAULT 'Scheduled' CHECK (outcome IN ('Scheduled','Interested','Declined','Funded')), notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS investments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, investor_id UUID NOT NULL REFERENCES investors(id), round_name TEXT NOT NULL, amount DECIMAL(18,2) NOT NULL CHECK (amount > 0), invested_on DATE NOT NULL, UNIQUE(startup_id,investor_id,round_name));
CREATE TABLE IF NOT EXISTS events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, event_type TEXT NOT NULL CHECK (event_type IN ('Workshop','Hackathon','Training','Demo Day','Networking')), starts_at TIMESTAMPTZ NOT NULL, venue TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS event_attendance (event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, PRIMARY KEY(event_id,startup_id));
CREATE TABLE IF NOT EXISTS patents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, title TEXT NOT NULL, application_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK (status IN ('Filed','Published','Granted')), filed_on DATE NOT NULL);
CREATE TABLE IF NOT EXISTS publications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, title TEXT NOT NULL, venue TEXT NOT NULL, published_on DATE NOT NULL, doi TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS grants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE, provider TEXT NOT NULL, program TEXT NOT NULL, amount DECIMAL(18,2) NOT NULL CHECK (amount > 0), awarded_on DATE NOT NULL);
CREATE INDEX IF NOT EXISTS startups_domain_stage_idx ON startups(domain,stage);
CREATE INDEX IF NOT EXISTS evaluations_startup_date_idx ON evaluations(startup_id,evaluated_on DESC);
CREATE INDEX IF NOT EXISTS investments_startup_idx ON investments(startup_id);
CREATE INDEX IF NOT EXISTS events_starts_idx ON events(starts_at);
`;

async function migrate(pool) {
  let sql = fallbackSchema;
  const sqlPath = path.join(__dirname, 'schema.sql');
  try {
    if (fs.existsSync(sqlPath)) {
      sql = fs.readFileSync(sqlPath, 'utf8');
    }
  } catch (_e) {
    // fallbackSchema used
  }
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

async function seed(pool) {
  const samples = [
    ['Aarogya AI', 'Healthcare', 'AI-assisted early screening and clinical triage', 'incubation', '2023-08-12'],
    ['KisanGrid', 'AgriTech', 'Farm analytics and water-efficient crop planning', 'validation', '2024-02-08'],
    ['VoltLoop', 'Green Energy', 'Battery reuse and neighborhood energy storage', 'acceleration', '2022-11-20'],
    ['CipherNest', 'Cybersecurity', 'Accessible security tooling for small businesses', 'ideation', '2025-01-14']
  ];
  for (const [name, domain, description, stage, founded_on] of samples) {
    await pool.query('INSERT INTO startups (name,domain,description,stage,founded_on) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING', [name, domain, description, stage, founded_on]);
  }
  const people = [
    ['Ananya Rao', 'ananya@incubation.example', 'Student'],
    ['Rohan Mehta', 'rohan@incubation.example', 'Alumni'],
    ['Dr. Priya Sen', 'priya@incubation.example', 'Faculty'],
    ['Vikram Shah', 'vikram@incubation.example', 'Industry'],
    ['Meera Iyer', 'meera@incubation.example', 'Student']
  ];
  for (const p of people) {
    await pool.query('INSERT INTO people (name,email,affiliation) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING', p);
  }
  await pool.query("INSERT INTO mentors (person_id,expertise,organization) SELECT id,'Product strategy and clinical AI','University Innovation Lab' FROM people WHERE email='priya@incubation.example' ON CONFLICT (person_id) DO NOTHING");
  await pool.query("INSERT INTO mentors (person_id,expertise,organization) SELECT id,'Growth and fundraising','Venture Partners' FROM people WHERE email='vikram@incubation.example' ON CONFLICT (person_id) DO NOTHING");
  for (const [startup, email, role] of [['Aarogya AI', 'ananya@incubation.example', 'Founder'], ['Aarogya AI', 'rohan@incubation.example', 'Co-founder'], ['KisanGrid', 'meera@incubation.example', 'Founder']]) {
    await pool.query('INSERT INTO founders (startup_id,person_id,role) SELECT s.id,p.id,$3 FROM startups s,people p WHERE s.name=$1 AND p.email=$2 ON CONFLICT DO NOTHING', [startup, email, role]);
  }
  await pool.query("INSERT INTO mentor_assignments (startup_id,mentor_id) SELECT s.id,m.id FROM startups s,mentors m JOIN people p ON m.person_id=p.id WHERE s.name='Aarogya AI' AND p.email='priya@incubation.example' ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO investors (name,organization,email) VALUES ('Nisha Kapoor','Catalyst Ventures','nisha@catalyst.example'),('Arjun Batra','SeedBridge Capital','arjun@seedbridge.example') ON CONFLICT (name) DO NOTHING");
  await pool.query("INSERT INTO investments (startup_id,investor_id,round_name,amount,invested_on) SELECT s.id,i.id,'Seed',2500000,'2024-10-15' FROM startups s,investors i WHERE s.name='VoltLoop' AND i.name='Nisha Kapoor' ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO evaluations (startup_id,mentor_id,metric,score,notes,evaluated_on) SELECT s.id,m.id,'Product readiness',8,'Successful pilot with partner clinics','2025-07-10' FROM startups s,mentors m JOIN people p ON m.person_id=p.id WHERE s.name='Aarogya AI' AND p.email='priya@incubation.example' AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.startup_id=s.id AND e.metric='Product readiness' AND e.evaluated_on='2025-07-10')");
  await pool.query("INSERT INTO events (title,event_type,starts_at,venue,description) SELECT 'Innovation Demo Day','Demo Day','2027-02-12T10:00:00+05:30','Innovation Hall','Startup pitches and networking' WHERE NOT EXISTS (SELECT 1 FROM events WHERE title='Innovation Demo Day')");
  await pool.query("INSERT INTO patents (startup_id,title,application_number,status,filed_on) SELECT id,'Low-cost clinical risk classification','IN-2025-001','Filed','2025-03-08' FROM startups WHERE name='Aarogya AI' ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO grants (startup_id,provider,program,amount,awarded_on) SELECT s.id,'National Innovation Agency','Campus Innovation Grant',500000,'2025-04-01' FROM startups s WHERE s.name='KisanGrid' AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.startup_id=s.id AND g.program='Campus Innovation Grant')");
  await pool.query("INSERT INTO stage_history (startup_id,stage,notes,changed_on) SELECT s.id,'incubation','Transitioned from validation after clinical pilot approval','2024-06-15' FROM startups s WHERE s.name='Aarogya AI' AND NOT EXISTS (SELECT 1 FROM stage_history sh WHERE sh.startup_id=s.id)");
  await pool.query("INSERT INTO stage_history (startup_id,stage,notes,changed_on) SELECT s.id,'acceleration','Moved to acceleration after Seed round closing','2024-11-01' FROM startups s WHERE s.name='VoltLoop' AND NOT EXISTS (SELECT 1 FROM stage_history sh WHERE sh.startup_id=s.id)");
  await pool.query("INSERT INTO pitch_meetings (startup_id,investor_id,scheduled_at,outcome,notes) SELECT s.id,i.id,'2024-09-20T14:00:00+05:30','Funded','Successful pitch leading to Seed round investment' FROM startups s,investors i WHERE s.name='VoltLoop' AND i.name='Nisha Kapoor' AND NOT EXISTS (SELECT 1 FROM pitch_meetings pm WHERE pm.startup_id=s.id AND pm.investor_id=i.id)");
  await pool.query("INSERT INTO pitch_meetings (startup_id,investor_id,scheduled_at,outcome,notes) SELECT s.id,i.id,'2025-05-18T11:00:00+05:30','Interested','Preliminary pitch deck review; follow-up scheduled' FROM startups s,investors i WHERE s.name='Aarogya AI' AND i.name='Arjun Batra' AND NOT EXISTS (SELECT 1 FROM pitch_meetings pm WHERE pm.startup_id=s.id AND pm.investor_id=i.id)");
  await pool.query("INSERT INTO event_attendance (event_id,startup_id) SELECT e.id,s.id FROM events e,startups s WHERE e.title='Innovation Demo Day' AND s.name IN ('Aarogya AI','VoltLoop','KisanGrid') ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO publications (startup_id,title,venue,published_on,doi) SELECT s.id,'Federated Learning for Resource-Constrained Triage in Rural Healthcare','ACM/IEEE CHASE','2024-12-05','10.1145/3678512.3678550' FROM startups s WHERE s.name='Aarogya AI' ON CONFLICT DO NOTHING");
}

function createPool(customConnectionString) {
  const connectionString = customConnectionString || process.env.DATABASE_URL || 'postgresql://root@127.0.0.1:26257/incubation?sslmode=disable';
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const poolConfig = {
    connectionString,
    max: process.env.VERCEL ? 5 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  if (!isLocal) {
    // Cloud database (Neon, CockroachDB Cloud, Supabase, etc.) requires SSL
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  const pool = new Pool(poolConfig);
  pool.on('error', (err) => {
    console.error('Unexpected database client error:', err.message);
  });
  return pool;
}

function createApp(pool) {
  const app = express();
  app.use(express.json());

  // Enable CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Serve static files from public folder
  app.use(express.static(path.join(__dirname, 'public')));

  const api = express.Router();

  // Health check
  api.get('/health', async (_req, res) => {
    if (!pool) {
      return res.status(503).json({
        ok: false,
        database: 'unconfigured',
        error: 'DATABASE_URL environment variable is not configured. Please set DATABASE_URL in your Vercel project settings.'
      });
    }
    try {
      const r = await pool.query('SELECT version() AS version');
      res.json({ ok: true, database: r.rows[0].version });
    } catch (e) {
      res.status(503).json({
        ok: false,
        database: 'unavailable',
        error: 'Database connection failed: ' + e.message,
        hint: 'Verify DATABASE_URL credentials and SSL settings.'
      });
    }
  });

  // Database availability check for remaining API endpoints
  api.use((_req, res, next) => {
    if (!pool) {
      return res.status(503).json({
        error: 'Database not configured. Please set the DATABASE_URL environment variable in your Vercel project settings.'
      });
    }
    next();
  });

  api.get('/dashboard', async (_req, res, next) => {
    try {
      const counts = {};
      for (const name of ['startups', 'people', 'mentors', 'investors', 'investments', 'events', 'patents', 'grants']) {
        counts[name] = Number((await pool.query(`SELECT count(*) AS n FROM ${name}`)).rows[0].n);
      }
      const stagesList = (await pool.query('SELECT stage,count(*)::INT AS count FROM startups GROUP BY stage ORDER BY stage')).rows;
      const domainsList = (await pool.query('SELECT domain,count(*)::INT AS count FROM startups GROUP BY domain ORDER BY domain')).rows;
      const funding = (await pool.query('SELECT COALESCE(sum(amount),0) AS total FROM investments')).rows[0].total;
      res.json({ counts, stages: stagesList, domains: domainsList, total_funding: funding });
    } catch (e) { next(e); }
  });

  api.get('/reports', async (_req, res, next) => {
    try {
      const funding = (await pool.query('SELECT s.id,s.name,s.domain,s.stage,COALESCE(sum(i.amount),0) AS total,count(i.id)::INT AS rounds FROM startups s LEFT JOIN investments i ON i.startup_id=s.id GROUP BY s.id,s.name,s.domain,s.stage ORDER BY total DESC,s.name')).rows;
      const mentor_load = (await pool.query('SELECT m.id,p.name,m.expertise,count(a.startup_id)::INT AS startups FROM mentors m JOIN people p ON p.id=m.person_id LEFT JOIN mentor_assignments a ON a.mentor_id=m.id GROUP BY m.id,p.name,m.expertise ORDER BY p.name')).rows;
      const evaluations = (await pool.query('SELECT s.name AS startup,e.metric,round(avg(e.score)::DECIMAL,1) AS average,count(*)::INT AS reviews FROM evaluations e JOIN startups s ON s.id=e.startup_id GROUP BY s.name,e.metric ORDER BY s.name,e.metric')).rows;
      res.json({ funding, mentor_load, evaluations });
    } catch (e) { next(e); }
  });

  api.get('/startups/:id', async (req, res, next) => {
    try {
      const startup = (await pool.query('SELECT * FROM startups WHERE id=$1', [req.params.id])).rows[0];
      if (!startup) return res.status(404).json({ error: 'Startup not found' });
      const queries = {
        founders: 'SELECT p.id,p.name,p.email,p.affiliation,f.role FROM founders f JOIN people p ON p.id=f.person_id WHERE f.startup_id=$1 ORDER BY p.name',
        mentors: 'SELECT m.id,p.name,m.expertise,m.organization FROM mentor_assignments a JOIN mentors m ON m.id=a.mentor_id JOIN people p ON p.id=m.person_id WHERE a.startup_id=$1 ORDER BY p.name',
        evaluations: 'SELECT e.*,p.name AS mentor_name FROM evaluations e JOIN mentors m ON m.id=e.mentor_id JOIN people p ON p.id=m.person_id WHERE e.startup_id=$1 ORDER BY e.evaluated_on DESC',
        investments: 'SELECT i.*,v.name AS investor_name FROM investments i JOIN investors v ON v.id=i.investor_id WHERE i.startup_id=$1 ORDER BY i.invested_on DESC',
        pitch_meetings: 'SELECT p.*,i.name AS investor_name FROM pitch_meetings p JOIN investors i ON i.id=p.investor_id WHERE p.startup_id=$1 ORDER BY p.scheduled_at DESC',
        patents: 'SELECT * FROM patents WHERE startup_id=$1 ORDER BY filed_on DESC',
        publications: 'SELECT * FROM publications WHERE startup_id=$1 ORDER BY published_on DESC',
        grants: 'SELECT * FROM grants WHERE startup_id=$1 ORDER BY awarded_on DESC',
        stage_history: 'SELECT * FROM stage_history WHERE startup_id=$1 ORDER BY changed_on DESC',
        events: 'SELECT e.* FROM events e JOIN event_attendance a ON a.event_id=e.id WHERE a.startup_id=$1 ORDER BY e.starts_at DESC'
      };
      for (const [key, sql] of Object.entries(queries)) startup[key] = (await pool.query(sql, [req.params.id])).rows;
      res.json(startup);
    } catch (e) { next(e); }
  });

  api.patch('/startups/:id', async (req, res, next) => {
    try {
      const fields = ['name', 'domain', 'description', 'founded_on', 'stage'].filter(f => Object.hasOwn(req.body, f));
      if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
      if (fields.includes('stage') && !stages.includes(req.body.stage)) return res.status(400).json({ error: 'Invalid stage' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const previous = (await client.query('SELECT stage FROM startups WHERE id=$1', [req.params.id])).rows[0];
        if (!previous) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Startup not found' }); }
        const result = (await client.query(`UPDATE startups SET ${fields.map((f, i) => `${f}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [req.params.id, ...fields.map(f => req.body[f])])).rows[0];
        if (fields.includes('stage') && result.stage !== previous.stage) await client.query('INSERT INTO stage_history(startup_id,stage,notes) VALUES($1,$2,$3)', [req.params.id, result.stage, req.body.notes || 'Stage updated']);
        await client.query('COMMIT'); res.json(result);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (e) { next(e); }
  });

  api.get('/:resource', async (req, res, next) => {
    try {
      const config = resources[req.params.resource];
      if (!config) return res.status(404).json({ error: 'Unknown resource' });
      let sql = `SELECT * FROM ${config.table}`, values = [];
      if (req.params.resource === 'startups') {
        const clauses = [];
        if (req.query.domain) { values.push(req.query.domain); clauses.push(`domain=$${values.length}`); }
        if (req.query.stage) { values.push(req.query.stage); clauses.push(`stage=$${values.length}`); }
        if (req.query.search) { values.push(`%${req.query.search}%`); clauses.push(`name ILIKE $${values.length}`); }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      res.json((await pool.query(`${sql} ORDER BY ${config.order}`, values)).rows);
    } catch (e) { next(e); }
  });

  api.post('/:resource', async (req, res, next) => {
    try {
      const config = resources[req.params.resource];
      if (!config) return res.status(404).json({ error: 'Unknown resource' });
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'JSON object required' });
      const unknown = Object.keys(req.body).filter(k => !config.fields.includes(k));
      if (unknown.length) return res.status(400).json({ error: `Unknown fields: ${unknown.join(', ')}` });
      const missing = config.required.filter(k => req.body[k] === undefined || req.body[k] === null || req.body[k] === '');
      if (missing.length) return res.status(400).json({ error: `Required: ${missing.join(', ')}` });
      const fields = config.fields.filter(f => req.body[f] !== undefined && req.body[f] !== null && req.body[f] !== '');
      const result = await pool.query(`INSERT INTO ${config.table} (${fields.join(',')}) VALUES (${fields.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, fields.map(f => req.body[f]));
      res.status(201).json(result.rows[0]);
    } catch (e) { next(e); }
  });

  // Mount router under /api
  app.use('/api', api);

  // Fallback for direct invocations where /api may be stripped
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/style.css') || req.path.startsWith('/app.js')) {
      return next();
    }
    api(req, res, next);
  });

  // Error handling middleware
  app.use((error, _req, res, _next) => {
    const code = error.code;
    const status = code === '23505' ? 409 : ['23503', '23514', '22P02', '22007', '22008', '22003', '23502'].includes(code) ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Database/server error' : code === '23505' ? 'Duplicate record' : error.message });
  });

  return app;
}

let defaultPool = null;
let defaultApp = null;
let initPromise = null;

function getPool() {
  if (!defaultPool) {
    if (!process.env.DATABASE_URL && process.env.VERCEL) {
      console.warn('DATABASE_URL is not set in Vercel environment.');
      return null;
    }
    defaultPool = createPool();
  }
  return defaultPool;
}

async function ensureInit(pool) {
  if (!pool) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await migrate(pool);
        await seed(pool);
      } catch (e) {
        console.error('Migration/seed warning:', e.message);
      }
    })();
  }
  return initPromise;
}

async function getApp() {
  if (!defaultApp) {
    const pool = getPool();
    if (pool) {
      await ensureInit(pool);
    }
    defaultApp = createApp(pool);
  }
  return defaultApp;
}

if (require.main === module) {
  const pool = createPool();
  (async () => {
    await migrate(pool);
    await seed(pool);
    const port = Number(process.env.PORT || 3000);
    createApp(pool).listen(port, () => console.log(`Incubation Center: http://localhost:${port}`));
  })().catch(e => {
    console.error('Startup failed:', e);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  migrate,
  seed,
  createPool,
  getPool,
  getApp
};
