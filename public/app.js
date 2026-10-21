/**
 * LAUNCHPAD — Innovation & Startup Incubation Operations System
 * Handcrafted, robust, executive UI logic (No AI Slop)
 */

// Utility Selectors and Sanitizers
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const fmt = (num) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(num || 0));
const date = (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const money = (num) => '₹' + fmt(num);

const stages = ['ideation', 'validation', 'incubation', 'acceleration', 'commercialization'];
const domains = ['Artificial Intelligence', 'Healthcare', 'FinTech', 'AgriTech', 'Cybersecurity', 'Green Energy', 'Other'];

// Application State
const state = {
  view: 'overview',
  detail: null,
  tab: {
    people: 'people',
    funding: 'investments',
    programs: 'events',
    research: 'patents'
  },
  search: '',
  domain: '',
  stage: '',
  viewMode: 'table', // 'table' | 'cards'
  sortCol: null,
  sortAsc: true,
  theme: localStorage.getItem('launchpad-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  cachedStartups: [],
  dashboardData: null
};

// Apply Initial Theme
document.documentElement.dataset.theme = state.theme;

// API Helper
async function api(url, options = {}) {
  const res = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_e) {
    throw new Error(res.status === 404 ? 'API route not found (404)' : `Server error (${res.status}): ${text.slice(0, 100)}`);
  }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Notification Toast
function notify(text, error = false) {
  const el = $('#notice');
  if (!el) return;
  el.textContent = text;
  el.className = error ? 'error' : '';
  if (text) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-button';
    closeBtn.textContent = '✕';
    closeBtn.style.marginLeft = '12px';
    closeBtn.onclick = () => { el.textContent = ''; el.className = ''; };
    el.appendChild(closeBtn);
  }
  setTimeout(() => {
    if (el.textContent.includes(text)) {
      el.textContent = '';
      el.className = '';
    }
  }, 5000);
}

// UI Badges & Helpers
function pill(stageName) {
  const clean = esc(stageName).toLowerCase();
  return `<span class="pill ${clean}">${clean}</span>`;
}

function domainBadge(domainName) {
  return `<span class="domain-badge">${esc(domainName)}</span>`;
}

function section(title, subtitle = '', action = '') {
  return `
    <div class="section-title">
      <div>
        <h2>${esc(title)}</h2>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="section-actions">${action}</div>
    </div>
  `;
}

function table(columns, rows, sortable = false) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((c, idx) => `
              <th class="${sortable ? 'sortable' : ''}" data-col-idx="${idx}">
                ${esc(c)}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.join('') : `
            <tr>
              <td class="empty-cell" colspan="${columns.length}">
                <div class="empty-state">
                  <span class="empty-icon">🗂</span>
                  <h3>No records found</h3>
                  <p>There are currently no items matching your criteria in this view.</p>
                </div>
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function optionRows(rows, labelKey = 'name') {
  return rows.map(r => ({ value: r.id, label: r[labelKey] }));
}

const select = (label, options, required = true) => ({ label, type: 'select', options, required });
const field = (label, type = 'text', required = true) => ({ label, type, required });

// Form Schema & Modal Dialog
let formResource = '', formExtra = {};

async function openForm(resource, extra = {}) {
  formResource = resource;
  formExtra = extra;

  const [startups, people, mentors, investors, events] = await Promise.all([
    api('/startups').catch(() => []),
    api('/people').catch(() => []),
    api('/mentors').catch(() => []),
    api('/investors').catch(() => []),
    api('/events').catch(() => [])
  ]);

  const startupOptions = optionRows(startups);
  const personOptions = people.map(p => ({ value: p.id, label: `${p.name} (${p.affiliation})` }));
  const mentorOptions = mentors.map(m => {
    const personObj = people.find(p => p.id === m.person_id);
    return { value: m.id, label: personObj ? `${personObj.name} · ${m.expertise}` : m.expertise };
  });
  const investorOptions = investors.map(i => ({ value: i.id, label: `${i.name} (${i.organization || 'Angel'})` }));
  const eventOptions = optionRows(events, 'title');

  const startupSelect = select('startup_id', startupOptions);
  const personSelect = select('person_id', personOptions);
  const mentorSelect = select('mentor_id', mentorOptions);
  const investorSelect = select('investor_id', investorOptions);

  const specs = {
    startups: [
      field('name'),
      select('domain', domains.map(x => ({ value: x, label: x }))),
      field('description', 'textarea', false),
      select('stage', stages.map(x => ({ value: x, label: x }))),
      field('founded_on', 'date', false)
    ],
    people: [
      field('name'),
      field('email', 'email'),
      select('affiliation', ['Student', 'Faculty', 'Alumni', 'Industry'].map(x => ({ value: x, label: x })))
    ],
    founders: [
      startupSelect,
      personSelect,
      field('role', 'text', false)
    ],
    mentors: [
      personSelect,
      field('expertise'),
      field('organization', 'text', false)
    ],
    mentor_assignments: [
      startupSelect,
      mentorSelect,
      field('assigned_on', 'date', false)
    ],
    investors: [
      field('name'),
      field('organization', 'text', false),
      field('email', 'email')
    ],
    evaluations: [
      startupSelect,
      mentorSelect,
      field('metric'),
      { ...field('score', 'number'), min: 1, max: 10 },
      field('evaluated_on', 'date', false),
      field('notes', 'textarea', false)
    ],
    investments: [
      startupSelect,
      investorSelect,
      field('round_name'),
      { ...field('amount', 'number'), min: 0.01, step: '0.01' },
      field('invested_on', 'date')
    ],
    pitch_meetings: [
      startupSelect,
      investorSelect,
      field('scheduled_at', 'datetime-local'),
      select('outcome', ['Scheduled', 'Interested', 'Declined', 'Funded'].map(x => ({ value: x, label: x })), false),
      field('notes', 'textarea', false)
    ],
    events: [
      field('title'),
      select('event_type', ['Workshop', 'Hackathon', 'Training', 'Demo Day', 'Networking'].map(x => ({ value: x, label: x }))),
      field('starts_at', 'datetime-local'),
      field('venue', 'text', false),
      field('description', 'textarea', false)
    ],
    event_attendance: [
      select('event_id', eventOptions),
      startupSelect
    ],
    patents: [
      startupSelect,
      field('title'),
      field('application_number'),
      select('status', ['Filed', 'Published', 'Granted'].map(x => ({ value: x, label: x }))),
      field('filed_on', 'date')
    ],
    publications: [
      startupSelect,
      field('title'),
      field('venue'),
      field('published_on', 'date'),
      field('doi', 'text', false)
    ],
    grants: [
      startupSelect,
      field('provider'),
      field('program'),
      { ...field('amount', 'number'), min: 0.01, step: '0.01' },
      field('awarded_on', 'date')
    ],
    stage_change: [
      select('stage', stages.map(x => ({ value: x, label: x }))),
      field('notes', 'textarea', false)
    ]
  };

  const list = specs[resource];
  if (!list) throw new Error('Unknown form resource: ' + resource);

  $('#modal-title').textContent = resource === 'stage_change' ? 'Update Incubation Stage' : 'New ' + resource.replaceAll('_', ' ').replace(/s$/, '');

  $('#form-fields').innerHTML = list
    .filter(f => !(extra[f.label] && ['startup_id'].includes(f.label)))
    .map(f => `
      <div class="field">
        <label for="f-${f.label}">
          ${esc(f.label.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()))}
          ${f.required ? '<span style="color:var(--accent-rose)">*</span>' : ''}
        </label>
        ${f.type === 'select' ? `
          <select id="f-${f.label}" name="${f.label}" ${f.required ? 'required' : ''}>
            <option value="">Select option…</option>
            ${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
          </select>
        ` : f.type === 'textarea' ? `
          <textarea id="f-${f.label}" name="${f.label}" ${f.required ? 'required' : ''} placeholder="Add description or notes…"></textarea>
        ` : `
          <input id="f-${f.label}" name="${f.label}" type="${f.type}"
            ${f.required ? 'required' : ''}
            ${f.min !== undefined ? `min="${f.min}"` : ''}
            ${f.max !== undefined ? `max="${f.max}"` : ''}
            ${f.step ? `step="${f.step}"` : ''}
            placeholder="Enter ${esc(f.label.replaceAll('_', ' '))}…">
        `}
      </div>
    `).join('');

  if (resource === 'stage_change' && extra.current) {
    const curStage = extra.current.trim().toLowerCase();
    const selectEl = $('#f-stage');
    if (selectEl) selectEl.value = curStage;
  }

  $('#modal').showModal();
}

// Modal Submission
$('#record-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = { ...formExtra };
  delete data.current;
  for (const [k, v] of new FormData(e.target)) {
    if (v !== '') data[k] = v;
  }
  try {
    if (formResource === 'stage_change') {
      await api(`/startups/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: data.stage, notes: data.notes || 'Stage updated from dashboard' })
      });
      notify('Incubation stage updated successfully.');
    } else {
      await api('/' + formResource, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      notify(`${formResource.replaceAll('_', ' ')} record created.`);
    }
    $('#modal').close();
    render();
  } catch (err) {
    notify(err.message, true);
  }
});

$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
$('#top-create').onclick = () => openForm('startups').catch(e => notify(e.message, true));

// Global Quick Action Trigger
$('#top-quick-action')?.addEventListener('click', () => {
  openCommandPalette();
});

// CSV Export Utility (High Value Enterprise Tool)
function exportTableToCSV(filename, rows) {
  if (!rows || !rows.length) {
    notify('No data available to export', true);
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      let val = row[h] ?? '';
      if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`;
      return val;
    }).join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  notify(`Exported ${rows.length} rows to ${filename}`);
}

// Visual Pipeline Stepper for Overview & Detail Views
function renderStageStepper(activeStage, stageCounts = {}, isClickable = true) {
  const activeIdx = stages.indexOf(activeStage?.toLowerCase());
  return `
    <div class="stage-pipeline">
      <div class="stage-pipeline-head">
        <span class="stage-pipeline-title">INCUBATION PROGRESSION PIPELINE</span>
        <span class="muted">${stages.length} Structured Phases</span>
      </div>
      <div class="pipeline-stepper">
        ${stages.map((stg, idx) => {
          const isDone = activeIdx > idx;
          const isActive = activeIdx === idx;
          const count = stageCounts[stg] !== undefined ? stageCounts[stg] : '';
          return `
            <button type="button" class="pipeline-step ${isDone ? 'completed' : ''} ${isActive ? 'active' : ''}"
              ${isClickable ? `data-action="filter-stage" data-stage="${stg}"` : ''}>
              <div class="step-circle">
                ${isDone ? '✓' : idx + 1}
              </div>
              <span class="step-label">${stg}</span>
              ${count !== '' ? `<span class="step-count-badge">${count} ventures</span>` : ''}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Navigation Handler
$('#nav').onclick = (e) => {
  const button = e.target.closest('[data-view]');
  if (button) {
    state.view = button.dataset.view;
    state.detail = null;
    state.search = '';
    // Close mobile drawer if open
    $('#sidebar')?.classList.remove('open');
    render();
  }
};

// Mobile Hamburger Navigation
$('#mobile-menu-btn')?.addEventListener('click', () => {
  $('#sidebar')?.classList.toggle('open');
});

// Theme Toggle Handler
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('launchpad-theme', state.theme);
  notify(`Switched to ${state.theme} mode`);
}

$('#theme-toggle')?.addEventListener('click', toggleTheme);
$('#mobile-theme-btn')?.addEventListener('click', toggleTheme);

// Content Delegated Events
$('#content').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]');
  if (action) {
    const act = action.dataset.action;
    if (act === 'form') {
      const extra = action.dataset.startup
        ? (action.dataset.resource === 'stage_change'
            ? { id: action.dataset.startup, current: document.querySelector('.detail-head .pill')?.textContent || '' }
            : { startup_id: action.dataset.startup })
        : {};
      openForm(action.dataset.resource, extra).catch(x => notify(x.message, true));
    }
    if (act === 'back') {
      state.detail = null;
      render();
    }
    if (act === 'tab') {
      state.tab[state.view] = action.dataset.tab;
      render();
    }
    if (act === 'toggle-view') {
      state.viewMode = action.dataset.mode;
      render();
    }
    if (act === 'filter-stage') {
      state.stage = state.stage === action.dataset.stage ? '' : action.dataset.stage;
      state.view = 'startups';
      state.detail = null;
      render();
    }
    if (act === 'export-startups') {
      exportTableToCSV('incubator_startups.csv', state.cachedStartups);
    }
    return;
  }

  // Row Click for Startup Navigation
  const row = e.target.closest('tr[data-id]');
  if (row) {
    state.view = 'startups';
    state.detail = row.dataset.id;
    render();
  }

  // Card Click for Startup Navigation
  const card = e.target.closest('.startup-card[data-id]');
  if (card) {
    state.view = 'startups';
    state.detail = card.dataset.id;
    render();
  }
});

// Content Input & Change Events
$('#content').addEventListener('change', (e) => {
  if (e.target.id === 'domain-filter') {
    state.domain = e.target.value;
    render();
  }
  if (e.target.id === 'stage-filter') {
    state.stage = e.target.value;
    render();
  }
});

$('#content').addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    state.search = e.target.value;
    const query = state.search.toLowerCase();
    document.querySelectorAll('tr[data-name]').forEach(row => {
      row.hidden = !row.dataset.name.toLowerCase().includes(query);
    });
    document.querySelectorAll('.startup-card[data-name]').forEach(card => {
      card.hidden = !card.dataset.name.toLowerCase().includes(query);
    });
  }
});

function btn(label, resource, startup) {
  return `<button class="outline mini" data-action="form" data-resource="${resource}" ${startup ? `data-startup="${startup}"` : ''}>＋ ${label}</button>`;
}

function listPanel(title, items, renderItem, action = '') {
  return `
    <section class="panel">
      <div class="panel-header">
        <h3>${esc(title)}</h3>
        ${action}
      </div>
      <div class="panel-content">
        ${items.length ? items.map(renderItem).join('') : '<div class="muted">No records registered yet.</div>'}
      </div>
    </section>
  `;
}

// VIEW 1: Overview Dashboard
async function overview() {
  const [d, startups, events] = await Promise.all([
    api('/dashboard'),
    api('/startups'),
    api('/events')
  ]);
  state.dashboardData = d;
  state.cachedStartups = startups;

  const domainsList = d.domains || [];
  const stagesList = d.stages || [];
  const counts = d.counts || {};
  const maxDomain = Math.max(...(domainsList.length ? domainsList.map(x => x.count) : [1]));
  const stageCounts = {};
  for (const s of stagesList) stageCounts[s.stage] = s.count;

  return `
    <!-- Executive Hero -->
    <div class="hero-banner">
      <div>
        <div class="hero-tag">
          <span>✦</span>
          <span>CAMPUS VENTURE OPERATIONS</span>
        </div>
        <h2 class="hero-title">Incubation Management System</h2>
        <p class="hero-desc">
          Unified administrative console for academic spin-outs, mentor caseloads, research commercialization, and seed investments.
        </p>
      </div>
      <div class="hero-kpis">
        <div class="hero-kpi-block">
          <div class="hero-kpi-label">Active Portfolio</div>
          <div class="hero-kpi-value">${counts.startups || 0}</div>
        </div>
        <div class="hero-kpi-block">
          <div class="hero-kpi-label">Capital Deployed</div>
          <div class="hero-kpi-value">${money(d.total_funding)}</div>
        </div>
      </div>
    </div>

    <!-- Metric KPI Grid -->
    <div class="cards">
      ${[
        ['Active Startups', counts.startups || 0, 'Across 5 development stages', '◈', 'ventures'],
        ['Certified Mentors', counts.mentors || 0, 'Faculty & industry advisors', '♙', 'network'],
        ['Total Investment', money(d.total_funding), 'Institutional & angel rounds', '◇', 'capital'],
        ['Upcoming Programs', counts.events || 0, 'Workshops, demo days & sprints', '▦', 'events']
      ].map(([label, val, sub, icon, tag]) => `
        <div class="card">
          <div class="card-top">
            <span class="card-label">${label}</span>
            <span class="card-icon">${icon}</span>
          </div>
          <div class="card-value">${val}</div>
          <div class="card-sub">
            <span class="card-sub-highlight">●</span>
            <span>${sub}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Interactive Pipeline Visualizer -->
    ${renderStageStepper(null, stageCounts, true)}

    <!-- Split Section: Recent Activity & Domain Distribution -->
    <div class="grid-2">
      ${listPanel(
        'Recent Incubated Ventures',
        startups.slice(0, 5),
        s => `
          <div class="list-row" style="cursor:pointer;" data-action="detail" onclick="navigateToStartup('${s.id}')">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="avatar">${esc(s.name.slice(0, 2).toUpperCase())}</span>
              <div>
                <div class="item-title">${esc(s.name)}</div>
                <div class="muted">${esc(s.domain)} · Founded ${date(s.founded_on)}</div>
              </div>
            </div>
            <div>
              ${pill(s.stage)}
            </div>
          </div>
        `,
        `<button class="outline mini" data-action="filter-stage" data-stage="">View all →</button>`
      )}

      <div class="panel">
        <div class="panel-header">
          <h3>Innovation Domain Distribution</h3>
          <span class="muted">${domainsList.length} verticals</span>
        </div>
        ${domainsList.map(x => `
          <div class="bar-row">
            <div class="bar-meta">
              <span>${esc(x.domain)}</span>
              <strong>${x.count} startups</strong>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${(x.count / maxDomain) * 100}%"></div>
            </div>
          </div>
        `).join('') || '<div class="muted">No domain data registered</div>'}
      </div>
    </div>

    <!-- Secondary Operations Summary -->
    ${section('Ecosystem Snapshot', 'Key university intellectual assets & community network')}
    <div class="cards cards-compact">
      ${[
        ['People & Founders', counts.people || 0, 'Registered university members'],
        ['Completed Rounds', counts.investments || 0, 'Closed funding milestones'],
        ['Filed Patents', counts.patents || 0, 'Intellectual property assets'],
        ['Awarded Grants', counts.grants || 0, 'Non-dilutive university funding']
      ].map(([label, val, sub]) => `
        <div class="card">
          <div class="card-label">${label}</div>
          <div class="card-value" style="font-size:22px;">${val}</div>
          <div class="muted" style="margin-top:4px;">${sub}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Global Startup Navigator
window.navigateToStartup = function(id) {
  state.view = 'startups';
  state.detail = id;
  render();
};

// VIEW 2: Startups Portfolio
async function startupsView() {
  if (state.detail) return detailView(state.detail);

  const query = new URLSearchParams();
  if (state.domain) query.set('domain', state.domain);
  if (state.stage) query.set('stage', state.stage);

  const data = await api('/startups?' + query);
  state.cachedStartups = data;

  return `
    ${section(
      'Startup Portfolio',
      `Managing ${data.length} university ventures across validation and growth`,
      `
        <div style="display:flex;gap:8px;">
          <button class="outline mini" data-action="export-startups">↓ Export CSV</button>
          ${btn('Add Startup', 'startups')}
        </div>
      `
    )}

    <!-- Filter Toolbar -->
    <div class="toolbar">
      <div class="search-input-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" placeholder="Search startups by name…" value="${esc(state.search)}">
        ${state.search ? '<button class="search-clear-btn" onclick="clearSearch()">✕</button>' : ''}
      </div>

      <div class="filter-group">
        <select id="domain-filter">
          <option value="">All Domains</option>
          ${domains.map(x => `<option value="${x}" ${x === state.domain ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select>
        <select id="stage-filter">
          <option value="">All Stages</option>
          ${stages.map(x => `<option value="${x}" ${x === state.stage ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select>

        <div class="view-toggle">
          <button type="button" data-action="toggle-view" data-mode="table" class="${state.viewMode === 'table' ? 'active' : ''}" title="Table View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button type="button" data-action="toggle-view" data-mode="cards" class="${state.viewMode === 'cards' ? 'active' : ''}" title="Grid Cards View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Stage Filter Chips -->
    <div class="stage-chips">
      <span class="muted" style="margin-right:6px;font-size:11px;font-weight:700;">STAGE:</span>
      <button type="button" class="stage-chip ${!state.stage ? 'active' : ''}" data-action="filter-stage" data-stage="">
        All Stages (${data.length})
      </button>
      ${stages.map(stg => {
        const count = data.filter(s => s.stage === stg).length;
        return `
          <button type="button" class="stage-chip ${state.stage === stg ? 'active' : ''}" data-action="filter-stage" data-stage="${stg}">
            ${stg} ${count ? `(${count})` : ''}
          </button>
        `;
      }).join('')}
    </div>

    <!-- Main Data Presentation -->
    ${state.viewMode === 'table' ? `
      ${table(
        ['Venture Name & Description', 'Innovation Domain', 'Stage', 'Founded On', 'Actions'],
        data.map(s => `
          <tr data-id="${s.id}" data-name="${esc(s.name)}">
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="avatar">${esc(s.name.slice(0, 2).toUpperCase())}</span>
                <div>
                  <strong>${esc(s.name)}</strong>
                  <br>
                  <span class="muted">${esc(s.description).slice(0, 75)}${s.description.length > 75 ? '…' : ''}</span>
                </div>
              </div>
            </td>
            <td>${domainBadge(s.domain)}</td>
            <td>${pill(s.stage)}</td>
            <td>${date(s.founded_on)}</td>
            <td class="link">View dossier →</td>
          </tr>
        `),
        true
      )}
    ` : `
      <div class="startup-grid">
        ${data.map(s => `
          <div class="startup-card" data-id="${s.id}" data-name="${esc(s.name)}">
            <div>
              <div class="startup-card-top">
                <span class="avatar">${esc(s.name.slice(0, 2).toUpperCase())}</span>
                ${pill(s.stage)}
              </div>
              <div class="startup-card-name">${esc(s.name)}</div>
              <div style="margin-bottom:8px;">${domainBadge(s.domain)}</div>
              <p class="startup-card-desc">${esc(s.description) || 'No venture description recorded.'}</p>
            </div>
            <div class="startup-card-footer">
              <span>Founded ${date(s.founded_on)}</span>
              <span class="link">Open profile →</span>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

window.clearSearch = function() {
  state.search = '';
  render();
};

// VIEW 3: Startup Deep-Dive Dossier
async function detailView(id) {
  const s = await api('/startups/' + id);

  const totalRaised = s.investments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalGrants = s.grants.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  return `
    <button class="back" data-action="back">
      <span>←</span> Back to Venture Directory
    </button>

    <!-- Venture Header Profile -->
    <div class="detail-head">
      <div class="detail-head-main">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="modal-eyebrow">PORTFOLIO COMPANY</span>
          <span class="breadcrumb-sep">·</span>
          ${domainBadge(s.domain)}
        </div>
        <h2>
          <span>${esc(s.name)}</span>
          ${pill(s.stage)}
        </h2>
        <p>${esc(s.description) || 'No venture overview provided.'}</p>

        <!-- Meta Summary Strip -->
        <div class="detail-meta-strip">
          <div class="detail-meta-item">
            <span>Founded</span>
            <strong>${date(s.founded_on)}</strong>
          </div>
          <div class="detail-meta-item">
            <span>Capital Raised</span>
            <strong style="color:var(--accent-brand);">${money(totalRaised)}</strong>
          </div>
          <div class="detail-meta-item">
            <span>Grant Funding</span>
            <strong>${money(totalGrants)}</strong>
          </div>
          <div class="detail-meta-item">
            <span>Founding Team</span>
            <strong>${s.founders.length} members</strong>
          </div>
          <div class="detail-meta-item">
            <span>Assigned Mentors</span>
            <strong>${s.mentors.length} advisors</strong>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
        <button class="primary mini" data-action="form" data-resource="stage_change" data-startup="${id}">
          ✦ Advance / Change Stage
        </button>
        <button class="outline mini" data-action="form" data-resource="investments" data-startup="${id}">
          ＋ Record Investment
        </button>
      </div>
    </div>

    <!-- Visual Progression Stepper for this Startup -->
    ${renderStageStepper(s.stage, {}, false)}

    <!-- Bento Grid Breakdown -->
    <div class="detail-grid">
      <!-- 1. Founding Team -->
      ${listPanel(
        'Founding Team & Key Personnel',
        s.founders,
        f => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(f.name)}</div>
              <div class="muted">${esc(f.affiliation)} · <a href="mailto:${esc(f.email)}">${esc(f.email)}</a></div>
            </div>
            <span class="domain-badge">${esc(f.role || 'Founder')}</span>
          </div>
        `,
        btn('Add Founder', 'founders', id)
      )}

      <!-- 2. Mentors & Advisors -->
      ${listPanel(
        'Assigned Mentors',
        s.mentors,
        m => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(m.name)}</div>
              <div class="muted">${esc(m.expertise)} ${m.organization ? `· ${esc(m.organization)}` : ''}</div>
            </div>
            <span class="muted">Advisor</span>
          </div>
        `,
        btn('Assign Mentor', 'mentor_assignments', id)
      )}

      <!-- 3. Performance Evaluations -->
      ${listPanel(
        'Performance & Mentor Evaluations',
        s.evaluations,
        e => {
          const scoreClass = e.score >= 8 ? 'high' : 'med';
          return `
            <div class="list-row">
              <div>
                <div class="item-title">${esc(e.metric)}</div>
                <div class="muted">
                  By ${esc(e.mentor_name)} · ${date(e.evaluated_on)}
                  ${e.notes ? `<br>"${esc(e.notes)}"` : ''}
                </div>
              </div>
              <span class="score-badge ${scoreClass}">${e.score} / 10</span>
            </div>
          `;
        },
        btn('Add Evaluation', 'evaluations', id)
      )}

      <!-- 4. Investment Rounds -->
      ${listPanel(
        'Capitalization & Investment Rounds',
        s.investments,
        i => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(i.round_name)} Round · ${esc(i.investor_name)}</div>
              <div class="muted">Closed ${date(i.invested_on)}</div>
            </div>
            <strong style="color:var(--accent-brand);font-family:var(--font-mono);">${money(i.amount)}</strong>
          </div>
        `,
        btn('Add Round', 'investments', id)
      )}

      <!-- 5. Pitch Meetings -->
      ${listPanel(
        'Investor Pitches & Scheduled Meetings',
        s.pitch_meetings,
        p => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(p.investor_name)}</div>
              <div class="muted">${date(p.scheduled_at)} ${p.notes ? `· ${esc(p.notes)}` : ''}</div>
            </div>
            ${pill(p.outcome)}
          </div>
        `,
        btn('Schedule Pitch', 'pitch_meetings', id)
      )}

      <!-- 6. Intellectual Property (Patents) -->
      ${listPanel(
        'Patent Filings & IP Assets',
        s.patents,
        p => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(p.title)}</div>
              <div class="muted">App: ${esc(p.application_number)} · Filed ${date(p.filed_on)}</div>
            </div>
            ${pill(p.status)}
          </div>
        `,
        btn('Add Patent', 'patents', id)
      )}

      <!-- 7. Academic Publications -->
      ${listPanel(
        'Publications & Conference Papers',
        s.publications,
        p => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(p.title)}</div>
              <div class="muted">${esc(p.venue)} · ${date(p.published_on)} ${p.doi ? `· DOI: ${esc(p.doi)}` : ''}</div>
            </div>
          </div>
        `,
        btn('Add Paper', 'publications', id)
      )}

      <!-- 8. Innovation Grants -->
      ${listPanel(
        'Non-Dilutive Grants & Subsidies',
        s.grants,
        g => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(g.program)}</div>
              <div class="muted">Provider: ${esc(g.provider)} · Awarded ${date(g.awarded_on)}</div>
            </div>
            <strong style="color:var(--accent-amber);font-family:var(--font-mono);">${money(g.amount)}</strong>
          </div>
        `,
        btn('Add Grant', 'grants', id)
      )}

      <!-- 9. Program & Event Attendance -->
      ${listPanel(
        'Campus Events & Programs Attended',
        s.events,
        e => `
          <div class="list-row">
            <div>
              <div class="item-title">${esc(e.title)}</div>
              <div class="muted">${esc(e.event_type)} · ${date(e.starts_at)}</div>
            </div>
          </div>
        `,
        btn('Register Event', 'event_attendance', id)
      )}

      <!-- 10. Audit History of Stage Transitions -->
      ${listPanel(
        'Incubation Stage Audit Log',
        s.stage_history,
        h => `
          <div class="list-row">
            <div>
              ${pill(h.stage)}
              <span class="muted" style="margin-left:8px;">${esc(h.notes || 'Stage updated')}</span>
            </div>
            <span class="muted">${date(h.changed_on)}</span>
          </div>
        `,
        ''
      )}
    </div>
  `;
}

// VIEW 4: Group Hub Views (People, Funding, Programs, Research)
const groups = {
  people: [
    ['people', 'Directory'],
    ['mentors', 'Mentors'],
    ['founders', 'Founders'],
    ['mentor_assignments', 'Assignments']
  ],
  funding: [
    ['investments', 'Investment Rounds'],
    ['investors', 'Investors'],
    ['pitch_meetings', 'Pitch Meetings']
  ],
  programs: [
    ['events', 'Events'],
    ['event_attendance', 'Participation']
  ],
  research: [
    ['patents', 'Patents'],
    ['publications', 'Publications'],
    ['grants', 'Grants']
  ]
};

async function groupView(viewKey) {
  const activeTab = state.tab[viewKey];
  const [rows, startups, people, mentors, investors, events] = await Promise.all([
    api('/' + activeTab),
    api('/startups').catch(() => []),
    api('/people').catch(() => []),
    api('/mentors').catch(() => []),
    api('/investors').catch(() => []),
    api('/events').catch(() => [])
  ]);

  const find = (arr, id) => arr.find(x => x.id === id)?.name || '—';
  const look = {
    startup_id: id => find(startups, id),
    person_id: id => find(people, id),
    mentor_id: id => find(people, mentors.find(m => m.id === id)?.person_id),
    investor_id: id => find(investors, id),
    event_id: id => events.find(e => e.id === id)?.title || '—'
  };

  const cols = {
    people: ['name', 'email', 'affiliation'],
    mentors: ['person_id', 'expertise', 'organization'],
    founders: ['startup_id', 'person_id', 'role'],
    mentor_assignments: ['startup_id', 'mentor_id', 'assigned_on'],
    investors: ['name', 'organization', 'email'],
    investments: ['startup_id', 'investor_id', 'round_name', 'amount', 'invested_on'],
    pitch_meetings: ['startup_id', 'investor_id', 'scheduled_at', 'outcome'],
    events: ['title', 'event_type', 'starts_at', 'venue'],
    event_attendance: ['event_id', 'startup_id'],
    patents: ['startup_id', 'title', 'application_number', 'status', 'filed_on'],
    publications: ['startup_id', 'title', 'venue', 'published_on'],
    grants: ['startup_id', 'provider', 'program', 'amount', 'awarded_on']
  };

  const dateFields = ['assigned_on', 'invested_on', 'scheduled_at', 'starts_at', 'filed_on', 'published_on', 'awarded_on'];
  const tabs = groups[viewKey];
  const activeTabConfig = tabs.find(x => x[0] === activeTab) || tabs[0];

  return `
    ${section(
      activeTabConfig[1],
      `${rows.length} records registered in this repository category`,
      `
        <div style="display:flex;gap:8px;">
          <button class="outline mini" onclick="exportTableToCSV('${activeTab}_records.csv', window._currentGroupRows)">↓ Export CSV</button>
          ${btn('Add ' + activeTabConfig[1].replace(/s$/, ''), activeTab)}
        </div>
      `
    )}

    <!-- Category Sub-Tabs -->
    <div class="tabs">
      ${tabs.map(([key, label]) => `
        <button data-action="tab" data-tab="${key}" class="${activeTab === key ? 'active' : ''}">
          <span>${label}</span>
          <span class="tab-badge">${key === activeTab ? rows.length : '•'}</span>
        </button>
      `).join('')}
    </div>

    <!-- Group Table Presentation -->
    ${(() => {
      window._currentGroupRows = rows;
      const colKeys = cols[activeTab] || Object.keys(rows[0] || {});
      return table(
        colKeys.map(x => x.replaceAll('_', ' ')),
        rows.map(r => `
          <tr>
            ${colKeys.map((c, i) => {
              const val = look[c]
                ? look[c](r[c])
                : c === 'amount'
                  ? money(r[c])
                  : dateFields.includes(c)
                    ? date(r[c])
                    : ['status', 'outcome', 'stage'].includes(c)
                      ? pill(r[c])
                      : r[c];
              return `<td>${i === 0 ? '<strong>' : ''}${esc(val)}${i === 0 ? '</strong>' : ''}</td>`;
            }).join('')}
          </tr>
        `),
        true
      );
    })()}
  `;
}

// VIEW 5: Executive Analytical Reports
async function reports() {
  const r = await api('/reports');
  const fundingList = r.funding || [];
  const mentorLoadList = r.mentor_load || [];
  const evaluationsList = r.evaluations || [];

  const totalFunded = fundingList.reduce((acc, curr) => acc + Number(curr.total || 0), 0);
  const totalRounds = fundingList.reduce((acc, curr) => acc + Number(curr.rounds || 0), 0);
  const avgCaseload = mentorLoadList.length ? (mentorLoadList.reduce((acc, curr) => acc + curr.startups, 0) / mentorLoadList.length).toFixed(1) : '0';

  return `
    ${section(
      'Executive Incubation Analytics',
      'Capital deployment summaries, advisor workload distribution, and readiness metrics',
      `<button class="outline mini" onclick="window.print()">⎙ Print / Save PDF</button>`
    )}

    <!-- Executive Summary KPI Cards -->
    <div class="cards" style="margin-bottom:24px;">
      <div class="card">
        <div class="card-label">TOTAL CAPITAL TRANSACTED</div>
        <div class="card-value" style="color:var(--accent-brand);">${money(totalFunded)}</div>
        <div class="muted">Across ${totalRounds} verified rounds</div>
      </div>
      <div class="card">
        <div class="card-label">FUNDED VENTURES</div>
        <div class="card-value">${fundingList.filter(x => Number(x.total) > 0).length} / ${fundingList.length}</div>
        <div class="muted">Active ventures with capital</div>
      </div>
      <div class="card">
        <div class="card-label">AVG MENTOR CASELOAD</div>
        <div class="card-value">${avgCaseload}</div>
        <div class="muted">Assigned ventures per advisor</div>
      </div>
      <div class="card">
        <div class="card-label">EVALUATION METRICS</div>
        <div class="card-value">${evaluationsList.length}</div>
        <div class="muted">Performance scorecards logged</div>
      </div>
    </div>

    <!-- Report 1: Capitalization Leaderboard -->
    ${section('1. Venture Capitalization Leaderboard', 'Ranked by total external investments secured')}
    ${table(
      ['Rank', 'Startup', 'Domain', 'Stage', 'Rounds Closed', 'Total Capital Raised'],
      fundingList.map((x, idx) => `
        <tr data-id="${x.id}" style="cursor:pointer;" onclick="navigateToStartup('${x.id}')">
          <td>
            <span class="report-rank-badge ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}">
              ${idx + 1}
            </span>
          </td>
          <td><strong>${esc(x.name)}</strong></td>
          <td>${domainBadge(x.domain)}</td>
          <td>${pill(x.stage)}</td>
          <td>${x.rounds}</td>
          <td><strong style="color:var(--accent-brand);font-family:var(--font-mono);">${money(x.total)}</strong></td>
        </tr>
      `)
    )}

    <!-- Report 2: Advisor Workload Distribution -->
    ${section('2. Mentor & Advisory Workload', 'Startups actively assigned to each advisor')}
    ${table(
      ['Mentor Name', 'Area of Expertise', 'Assigned Startups', 'Capacity Status'],
      mentorLoadList.map(x => `
        <tr>
          <td><strong>${esc(x.name)}</strong></td>
          <td>${esc(x.expertise)}</td>
          <td><strong>${x.startups}</strong></td>
          <td>
            <span class="pill ${x.startups >= 3 ? 'acceleration' : 'incubation'}">
              ${x.startups >= 3 ? 'High Load' : 'Available'}
            </span>
          </td>
        </tr>
      `)
    )}

    <!-- Report 3: Evaluation Metrics -->
    ${section('3. Evaluation Criteria & Average Readiness', 'Consolidated scores across faculty reviews (Out of 10)')}
    ${table(
      ['Startup', 'Evaluated Metric', 'Total Reviews', 'Average Score'],
      evaluationsList.map(x => {
        const avg = Number(x.average);
        const scoreClass = avg >= 8 ? 'high' : 'med';
        return `
          <tr>
            <td><strong>${esc(x.startup)}</strong></td>
            <td>${esc(x.metric)}</td>
            <td>${x.reviews} reviews</td>
            <td><span class="score-badge ${scoreClass}">${esc(x.average)} / 10</span></td>
          </tr>
        `;
      })
    )}
  `;
}

// Global Command Palette & Quick Search
const commandModal = $('#command-modal');
const cmdInput = $('#cmd-input');
const cmdResults = $('#cmd-results');

function openCommandPalette() {
  if (!commandModal) return;
  commandModal.showModal();
  cmdInput.value = '';
  renderCommandResults('');
  cmdInput.focus();
}

function closeCommandPalette() {
  if (!commandModal) return;
  commandModal.close();
}

function renderCommandResults(query) {
  const q = query.toLowerCase().trim();
  const baseActions = [
    { label: 'Go to Overview Dashboard', category: 'Navigation', icon: '◫', action: () => { state.view = 'overview'; render(); } },
    { label: 'Browse All Startups', category: 'Navigation', icon: '◈', action: () => { state.view = 'startups'; state.detail = null; render(); } },
    { label: 'View People & Mentors', category: 'Navigation', icon: '♙', action: () => { state.view = 'people'; render(); } },
    { label: 'Review Funding & Pitches', category: 'Navigation', icon: '◇', action: () => { state.view = 'funding'; render(); } },
    { label: 'Events & Programs', category: 'Navigation', icon: '▦', action: () => { state.view = 'programs'; render(); } },
    { label: 'IP & Patent Registry', category: 'Navigation', icon: '⌘', action: () => { state.view = 'research'; render(); } },
    { label: 'Executive Analytics & Reports', category: 'Navigation', icon: '▤', action: () => { state.view = 'reports'; render(); } },
    { label: 'Create New Startup', category: 'Quick Action', icon: '＋', action: () => openForm('startups') },
    { label: 'Record Investment Round', category: 'Quick Action', icon: '＋', action: () => openForm('investments') },
    { label: 'Register Research Grant', category: 'Quick Action', icon: '＋', action: () => openForm('grants') },
    { label: 'Switch Color Theme', category: 'Preferences', icon: '◑', action: toggleTheme }
  ];

  // Also include cached startups as jump targets!
  const startupActions = state.cachedStartups.map(s => ({
    label: `Open ${s.name} (${s.domain})`,
    category: 'Venture',
    icon: '◈',
    action: () => navigateToStartup(s.id)
  }));

  const allActions = [...baseActions, ...startupActions];
  const filtered = q ? allActions.filter(a => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)) : allActions;

  cmdResults.innerHTML = filtered.length ? filtered.slice(0, 10).map((a, i) => `
    <div class="cmd-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
      <div class="cmd-item-left">
        <span>${a.icon}</span>
        <span>${esc(a.label)}</span>
      </div>
      <span class="cmd-item-badge">${esc(a.category)}</span>
    </div>
  `).join('') : '<div class="muted" style="padding:16px;text-align:center;">No matching actions found</div>';

  $$('.cmd-item').forEach((item, idx) => {
    item.onclick = () => {
      closeCommandPalette();
      filtered[idx].action();
    };
  });
}

cmdInput?.addEventListener('input', (e) => {
  renderCommandResults(e.target.value);
});

cmdInput?.addEventListener('keydown', (e) => {
  const items = $$('.cmd-item');
  if (!items.length) return;
  let selectedIdx = items.findIndex(el => el.classList.contains('selected'));

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[selectedIdx]?.classList.remove('selected');
    selectedIdx = (selectedIdx + 1) % items.length;
    items[selectedIdx]?.classList.add('selected');
    items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[selectedIdx]?.classList.remove('selected');
    selectedIdx = (selectedIdx - 1 + items.length) % items.length;
    items[selectedIdx]?.classList.add('selected');
    items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[selectedIdx]) items[selectedIdx].click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
});

// Shortcut Listener: Ctrl+K / Cmd+K
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
});

$('#quick-search-trigger')?.addEventListener('click', openCommandPalette);

// Master View Renderer
async function render() {
  try {
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));

    const titles = {
      overview: 'Overview',
      startups: state.detail ? 'Venture Dossier' : 'Startups',
      people: 'People & Mentors',
      funding: 'Funding & Pitches',
      programs: 'Events & Programs',
      research: 'IP & Grants',
      reports: 'Executive Reports'
    };

    $('#page-title').textContent = titles[state.view] || 'Workspace';
    $('#breadcrumb-current').textContent = titles[state.view] || 'Workspace';

    $('#content').innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Retrieving incubator records…</p>
      </div>
    `;

    if (state.view === 'overview') {
      $('#content').innerHTML = await overview();
    } else if (state.view === 'startups') {
      $('#content').innerHTML = await startupsView();
    } else if (state.view === 'reports') {
      $('#content').innerHTML = await reports();
    } else {
      $('#content').innerHTML = await groupView(state.view);
    }
  } catch (err) {
    $('#content').innerHTML = `
      <div class="panel" style="border-left: 4px solid var(--accent-rose);">
        <h3>Unable to load incubator records</h3>
        <p class="muted" style="margin-top:6px;">${esc(err.message)}</p>
        <button class="primary mini" style="margin-top:14px;" onclick="render()">Retry Connection</button>
      </div>
    `;
    notify(err.message, true);
  }
}

// Database Status & Initial Render
api('/health')
  .then(res => {
    const statusDot = $('#db-status-dot');
    const statusText = $('#db-status');
    if (res.ok) {
      if (statusDot) statusDot.className = 'status-pulse-dot';
      if (statusText) statusText.textContent = res.database?.includes('CockroachDB') ? 'CockroachDB Connected' : 'Database Connected';
    } else {
      if (statusDot) statusDot.className = 'status-pulse-dot error';
      if (statusText) statusText.textContent = 'Database Unconfigured';
    }
  })
  .catch(() => {
    const statusDot = $('#db-status-dot');
    const statusText = $('#db-status');
    if (statusDot) statusDot.className = 'status-pulse-dot error';
    if (statusText) statusText.textContent = 'Database Unavailable';
  });

// Live clock display
function updateLiveClock() {
  const timeEl = $('#time-display');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST';
  }
}
setInterval(updateLiveClock, 30000);
updateLiveClock();

// Start
render();
