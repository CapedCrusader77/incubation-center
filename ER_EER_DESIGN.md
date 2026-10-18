# Technical Design Document: University Incubation Management System

```
Document ID : DBMS-EER-2026-01
Topic       : University Innovation & Startup Incubation Management
Database    : CockroachDB (Distributed SQL / PostgreSQL Wire Protocol)
Backend     : Node.js / Express
Frontend    : Vanilla HTML5 / CSS3 / JavaScript (SPA)
Normal Form : Boyce-Codd Normal Form (BCNF)
```

---

## 1. System Requirements & Domain Scope

The system models the end-to-end lifecycle of university-affiliated ventures, from initial ideation through equity funding, mentorship, IP protection, and public programs.

```
       [Entrepreneurs] ──(co-found)──> [Startups] <──(evaluations)── [Mentors]
          (Student/                      │      │
          Faculty/Alumni)                │      └──(participate)──> [Events]
                                         │
                                   [Investments] <──(fund)── [Investors]
                                   [Patents/IP]
                                   [Grants]
```

### Scope Boundaries
1. **Founders & Affiliations**: Tracks university innovators across four defined groups: Student, Faculty, Alumni, and Industry. A person can co-found multiple startups, and a startup can have multiple founders with distinct roles (CEO, CTO, Lead Researcher).
2. **Venture Progression**: Startups advance through five linear stages: `ideation` &rarr; `validation` &rarr; `incubation` &rarr; `acceleration` &rarr; `commercialization`. Every transition requires a non-null timestamp, reason/notes, and creates an audit record in `stage_history`.
3. **Mentorship & Metric Evaluations**: Mentors are specialized personnel possessing domain expertise. Mentors conduct evaluations on defined metrics (e.g., *Product Readiness*, *Market Traction*, *Financial Health*) scored on an integer scale of 1 to 10.
4. **Capital & Pitching**: Tracks angel and venture capital firms. Startups pitch to investors with tracked outcomes (`Scheduled`, `Interested`, `Declined`, `Funded`). Closed rounds capture investor identity, round stage (Seed, Pre-Series A), and capital amount.
5. **Events & Intellectual Property**: Records incubation programs (workshops, hackathons, demo days) with attendance logs. Tracks research outputs (patents filed with application IDs, peer-reviewed publications with DOIs, and non-dilutive government grants).

---

## 2. Architecture Decision: Database Engine Selection

### Decision
Use **CockroachDB** as the primary storage engine.

### Context & Evaluated Options

| Evaluation Criterion | CockroachDB | MongoDB | Apache Cassandra | Neo4j |
| :--- | :--- | :--- | :--- | :--- |
| **Data Model** | Distributed Relational | Document Store | Wide-Column Family | Property Graph |
| **Transaction Isolation** | Serializable ACID (Raft) | Document-level | Tunable / Eventual | ACID (Single-Node) |
| **Referential Integrity** | Enforced Foreign Keys (`CASCADE`) | Application-enforced | Unsupported | Graph edges (no cascade) |
| **Aggregation Efficiency** | Native Cost-Based Optimizer | Pipeline aggregation | Inefficient without Spark | Cypher path traversal |
| **Horizontal Scaling** | Range-based auto-rebalancing | Manual shard keys | Consistent hashing ring | Read replicas only |
| **Wire Protocol** | PostgreSQL Standard | Custom BSON / Driver | CQL binary protocol | Bolt Protocol |

### Rationale
- **Financial & Audit Accuracy**: Equity rounds, stage transitions, and patent tracking require strict referential integrity. An orphaned investment or founder record violates data invariants. CockroachDB guarantees atomicity through Raft consensus across write ranges.
- **Relational Complexity**: The domain is fundamentally interconnected: founders link to people, mentors link to assignments, and investments link to investors. Graph databases excel at path-finding but underperform on standard tabular financial reports; document stores require unnormalized duplicate data.
- **Transactional Stage History**: Progressing a startup's stage executes as a single serializable transaction:
  ```sql
  BEGIN;
  UPDATE startups SET stage = 'acceleration' WHERE id = $1;
  INSERT INTO stage_history (startup_id, stage, notes) VALUES ($1, 'acceleration', $2);
  COMMIT;
  ```

---

## 3. Entity-Relationship (ER) Model

### Entity Sets

| Entity | Primary Key | Description |
| :--- | :--- | :--- |
| `STARTUP` | `id` (UUID) | Incubation venture, domain classification, current stage, founding date |
| `PERSON` | `id` (UUID) | Individual identity, email, university/industry affiliation |
| `MENTOR` | `id` (UUID) | Subject-matter specialist linked to a Person entity |
| `INVESTOR` | `id` (UUID) | Institutional or angel funding entity |
| `EVENT` | `id` (UUID) | Workshop, hackathon, demo day, or networking session |
| `EVALUATION` | `id` (UUID) | Quantitative performance evaluation by a mentor (1–10 scale) |
| `INVESTMENT` | `id` (UUID) | Closed funding round (round name, amount, date) |
| `PITCH_MEETING` | `id` (UUID) | Assessment session between an investor and startup |
| `STAGE_HISTORY` | `id` (UUID) | Immutable audit log of stage progressions |
| `PATENT` | `id` (UUID) | Intellectual property filing (application number, status, filing date) |
| `PUBLICATION` | `id` (UUID) | Research paper, conference venue, date, DOI |
| `GRANT` | `id` (UUID) | Non-dilutive innovation grant awarded by a sponsor |

### Relationship Sets

- **Founders** (`STARTUP` &harr; `PERSON`): Many-to-Many ($M:N$). A person co-founds multiple startups; a startup has one or more founders. Descriptive attribute: `role`.
- **Mentor_Assignments** (`STARTUP` &harr; `MENTOR`): Many-to-Many ($M:N$). Mentors advise multiple startups. Descriptive attribute: `assigned_on`.
- **Event_Attendance** (`EVENT` &harr; `STARTUP`): Many-to-Many ($M:N$). Startups attend multiple programs.
- **Startup_Evaluations** (`STARTUP` &larr; `EVALUATION`): One-to-Many ($1:N$). A startup has multiple reviews; each review belongs to one venture.
- **Investor_Investments** (`INVESTOR` &larr; `INVESTMENT`): One-to-Many ($1:N$). An investor participates in multiple rounds.

```mermaid
erDiagram
    PERSON ||--o{ FOUNDER : "acts as"
    STARTUP ||--o{ FOUNDER : "co-founded by"

    PERSON ||--o| MENTOR : "specializes as"
    MENTOR ||--o{ MENTOR_ASSIGNMENT : "assigned to"
    STARTUP ||--o{ MENTOR_ASSIGNMENT : "guided by"

    STARTUP ||--o{ STAGE_HISTORY : "logs"
    STARTUP ||--o{ EVALUATION : "reviewed in"
    MENTOR ||--o{ EVALUATION : "evaluates"

    STARTUP ||--o{ INVESTMENT : "receives"
    INVESTOR ||--o{ INVESTMENT : "finances"

    STARTUP ||--o{ PITCH_MEETING : "presents"
    INVESTOR ||--o{ PITCH_MEETING : "hosts"

    EVENT ||--o{ EVENT_ATTENDANCE : "schedules"
    STARTUP ||--o{ EVENT_ATTENDANCE : "participates"

    STARTUP ||--o{ PATENT : "files"
    STARTUP ||--o{ PUBLICATION : "authors"
    STARTUP ||--o{ GRANT : "awarded"
```

---

## 4. Enhanced Entity-Relationship (EER) Model

### Specialization / Generalization Hierarchy

The EER schema implements **disjoint total specialization** on the `PERSON` superclass, alongside **optional role specialization** for mentors.

```
                         ┌──────────────┐
                         │    PERSON    │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │ (d, t)                │ (o)
              ┌─────┴─────┐           ┌─────┴─────┐
              │Affiliation│           │   MENTOR  │
              └─────┬─────┘           └───────────┘
     ┌────────┬─────┴──────┬────────┐
┌────┴────┐┌──┴────┐ ┌─────┴──┐ ┌───┴────┐
│ Student ││Faculty│ │ Alumni │ │Industry│
└─────────┘└───────┘ └────────┘ └────────┘
```

#### Constraints
1. **Total Specialization on Affiliation**:
   $$\bigcup (\text{Student}, \text{Faculty}, \text{Alumni}, \text{Industry}) = \text{Person}$$
   Every record in `people` must belong to exactly one affiliation category. Enforced by:
   `CHECK (affiliation IN ('Student', 'Faculty', 'Alumni', 'Industry'))`.
2. **Disjointness Constraint ($d$)**:
   $$\text{Student} \cap \text{Faculty} \cap \text{Alumni} \cap \text{Industry} = \emptyset$$
   An individual holds a single primary affiliation identifier within the university registry.
3. **Role Specialization (`Mentor`)**:
   - A `Person` may optionally serve as a `Mentor` ($0..1$).
   - Represented as a separate relation `mentors` with `person_id UUID UNIQUE REFERENCES people(id)`.
   - Mentors inherit all generic personal attributes (`name`, `email`) while adding domain-specific fields (`expertise`, `organization`).

---

## 5. Relational Schema & Normalization

### Relational Schema Notation

- `PEOPLE` ( <ins>id</ins>, name, email, affiliation, created_at )
- `STARTUPS` ( <ins>id</ins>, name, domain, description, stage, founded_on, created_at )
- `FOUNDERS` ( <ins>startup_id, person_id</ins>, role )
- `MENTORS` ( <ins>id</ins>, person_id*, expertise, organization )
- `MENTOR_ASSIGNMENTS` ( <ins>startup_id, mentor_id</ins>, assigned_on )
- `STAGE_HISTORY` ( <ins>id</ins>, startup_id*, stage, changed_on, notes )
- `EVALUATIONS` ( <ins>id</ins>, startup_id*, mentor_id*, metric, score, notes, evaluated_on )
- `INVESTORS` ( <ins>id</ins>, name, organization, email )
- `PITCH_MEETINGS` ( <ins>id</ins>, startup_id*, investor_id*, scheduled_at, outcome, notes )
- `INVESTMENTS` ( <ins>id</ins>, startup_id*, investor_id*, round_name, amount, invested_on )
- `EVENTS` ( <ins>id</ins>, title, event_type, starts_at, venue, description )
- `EVENT_ATTENDANCE` ( <ins>event_id, startup_id</ins> )
- `PATENTS` ( <ins>id</ins>, startup_id*, title, application_number, status, filed_on )
- `PUBLICATIONS` ( <ins>id</ins>, startup_id*, title, venue, published_on, doi )
- `GRANTS` ( <ins>id</ins>, startup_id*, provider, program, amount, awarded_on )

*(Underline = Primary Key; Asterisk = Foreign Key)*

---

### Normalization Proof (1NF &rarr; BCNF)

#### 1NF (Atomicity)
- Every column holds atomic, non-divisible values.
- Repeating groups (e.g. multiple founders, multiple investments) are decomposed into independent child relations (`founders`, `investments`) linked by foreign keys.

#### 2NF (Full Functional Dependency)
- Composite primary keys exist only in associative link tables:
  - `founders(startup_id, person_id)`
  - `mentor_assignments(startup_id, mentor_id)`
  - `event_attendance(event_id, startup_id)`
- In `founders`, non-key attribute `role` depends strictly on the joint participation $(startup\_id, person\_id)$, not on either key alone.
- No partial functional dependency exists in any relation.

#### 3NF (Transitive Dependencies)
- No non-prime attribute determines another non-prime attribute ($X \to Y \to Z$).
- Example: `evaluations` stores `mentor_id`, but does **not** store the mentor's name or organization. Mentor details resolve through `mentors` $\bowtie$ `people`.

#### BCNF (Boyce-Codd Normal Form)
- In every non-trivial functional dependency $X \to Y$, $X$ is a superkey:
  - `people`: $\text{id} \to (\text{name}, \text{email}, \text{affiliation})$; alternate key: $\text{email} \to (\text{id}, \text{name}, \text{affiliation})$.
  - `startups`: $\text{id} \to (\text{name}, \text{domain}, \dots)$; alternate key: $\text{name} \to (\text{id}, \text{domain}, \dots)$.
  - `patents`: $\text{id} \to (\text{title}, \text{application\_number}, \dots)$; alternate key: $\text{application\_number} \to \text{all}$.
  - `investments`: Unique constraint $(\text{startup\_id}, \text{investor\_id}, \text{round\_name})$ forms a candidate key.

---

## 6. Data Dictionary & Integrity Constraints

| Table Name | Column | Data Type | Nullable | Constraints & References | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `people` | `id` | UUID | No | PK, `gen_random_uuid()` | Unique person identifier |
| | `name` | TEXT | No | &mdash; | Full legal name |
| | `email` | TEXT | No | UNIQUE | University or work email |
| | `affiliation` | TEXT | No | `IN ('Student','Faculty','Alumni','Industry')` | Primary institutional role |
| `startups` | `id` | UUID | No | PK, `gen_random_uuid()` | Unique startup identifier |
| | `name` | TEXT | No | UNIQUE | Venture trading name |
| | `domain` | TEXT | No | `IN ('Artificial Intelligence', ...)` | Innovation domain |
| | `stage` | TEXT | No | `IN ('ideation', ...)` | Current incubation stage |
| `founders` | `startup_id` | UUID | No | PK, FK &rarr; `startups(id) ON DELETE CASCADE` | Venture reference |
| | `person_id` | UUID | No | PK, FK &rarr; `people(id)` | Founder reference |
| | `role` | TEXT | No | Default: `'Founder'` | Organizational role |
| `mentors` | `id` | UUID | No | PK, `gen_random_uuid()` | Unique mentor record ID |
| | `person_id` | UUID | No | FK &rarr; `people(id)`, UNIQUE | Linked individual |
| | `expertise` | TEXT | No | &mdash; | Core mentoring areas |
| `evaluations`| `score` | INT | No | `CHECK (score BETWEEN 1 AND 10)` | Integer performance score |
| `investments`| `amount` | DECIMAL(18,2)| No | `CHECK (amount > 0)` | Funding amount in INR |
| | `round_name`| TEXT | No | Part of UNIQUE composite key | Seed, Pre-Series A, etc. |
| `patents` | `status` | TEXT | No | `IN ('Filed','Published','Granted')` | Patent Office filing state |
| `events` | `event_type` | TEXT | No | `IN ('Workshop','Hackathon', ...)` | Program classification |

---

## 7. Analytical Query Implementations

### Portfolio Capital Aggregation
Computes total capital raised and closed investment rounds per venture, including ventures with zero funding:
```sql
SELECT 
    s.id,
    s.name,
    s.domain,
    s.stage,
    COALESCE(SUM(i.amount), 0) AS total_funding,
    COUNT(i.id)::INT AS completed_rounds
FROM startups s
LEFT JOIN investments i ON i.startup_id = s.id
GROUP BY s.id, s.name, s.domain, s.stage
ORDER BY total_funding DESC, s.name;
```

### Mentor Caseload Analysis
Tracks workload distribution across academic and industry advisors:
```sql
SELECT 
    m.id,
    p.name AS mentor_name,
    m.expertise,
    COUNT(a.startup_id)::INT AS active_startups
FROM mentors m
JOIN people p ON p.id = m.person_id
LEFT JOIN mentor_assignments a ON a.mentor_id = m.id
GROUP BY m.id, p.name, m.expertise
ORDER BY active_startups DESC;
```

### Evaluation Metric Averages
Calculates the mean score awarded per performance dimension:
```sql
SELECT 
    s.name AS startup_name,
    e.metric,
    ROUND(AVG(e.score)::DECIMAL, 1) AS average_score,
    COUNT(*)::INT AS total_evaluations
FROM evaluations e
JOIN startups s ON s.id = e.startup_id
GROUP BY s.name, e.metric
ORDER BY s.name, e.metric;
```
