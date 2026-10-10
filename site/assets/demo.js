// The clickable demo on the website.
//
// It is not a screenshot and not a mock-up. The stylesheet is the product's own
// (app.css, copied from internal/web/assets/style.css), the charts are the
// product's own code (charts.js), and the markup a rendering function produces
// is the markup app.js produces for the same data. The only invented part is the
// data itself, and the bar at the top says so.
//
// That matters because a demo that drifts is worse than no demo: it promises a
// dashboard the container does not have. Keeping the shapes identical means a
// visitor's expectations are calibrated before they run anything.
//
// Nothing is fetched. There is no server here — which is also why the numbers
// cannot be wrong about anyone's homelab: there is no homelab to be wrong about.

import * as C from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = C.esc;

const MINUTE = 60_000;
const PROBE_SECONDS = 60;
const SPARK_SAMPLES = 44;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/**
 * A deterministic generator. The demo must draw the same chart every time a
 * range chip is clicked — a history that reshuffles when you look at it twice
 * reads as broken, not as random.
 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function toast(message) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.append(el);
  window.setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3400);
}

function store(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (err) {
    // A private window, or storage switched off. Every one of these settings is
    // a convenience, so losing it is not worth an error message.
  }
  return null;
}

// ---------------------------------------------------------------------------
// invented data
// ---------------------------------------------------------------------------

/**
 * The sensors on the demo dashboard. `base` and `spread` describe the latency
 * distribution; `downFrom` is the moment a probe stopped succeeding, and it is
 * what makes the sparkline, the chart, the uptime strip and the incident list
 * agree with each other instead of being four unrelated fictions.
 */
/**
 * The places the demo's sensors live.
 *
 * Two of them, one of each kind, so the tree shows what it looks like when a
 * homelab and somebody else's datacentre are on the same dashboard. The
 * coordinates are real and are what the map would draw if a static page had a
 * tile server to draw behind them.
 */
const SITES = [
  { name: 'Homelab', kind: 'local', lat: 48.1372, lon: 11.5756 },
  { name: 'Hetzner Cloud', kind: 'external', lat: 50.4761, lon: 12.3697 },
];

function buildSensors() {
  const now = Date.now();
  return [
    {
      id: 1, name: 'This dashboard', type: 'http', group: 'Weatherglass',
      site: 'Homelab',
      target: 'http://weatherglass.lan:8080/healthz', status: 'up',
      base: 4.2, spread: 1.7, uptime: [100, 99.99, 99.98], downFrom: null,
    },
    {
      id: 2, name: 'Internet gateway', type: 'ping', group: 'Network',
      site: 'Homelab',
      target: '192.168.1.1', status: 'up',
      base: 2.6, spread: 1.0, uptime: [99.97, 99.94, 99.88], downFrom: null,
    },
    {
      id: 3, name: 'Public DNS', type: 'dns', group: 'Network',
      site: 'Homelab',
      target: 'one.one.one.one', status: 'up',
      base: 21, spread: 8, uptime: [99.9, 99.86, 99.91], downFrom: null,
    },
    {
      id: 4, name: 'Example website', type: 'http', group: 'External',
      site: 'Hetzner Cloud',
      target: 'https://example.org', status: 'up',
      base: 210, spread: 65, uptime: [99.6, 99.41, 99.52], downFrom: null,
    },
    {
      id: 5, name: 'NAS', type: 'tcp', group: 'Home',
      site: 'Homelab',
      target: 'nas.lan:5001', status: 'down',
      base: 12, spread: 3.5, uptime: [98.42, 99.72, 99.91],
      downFrom: now - 6 * MINUTE,
      message: 'connect: connection refused',
      failMessage: 'connect: connection refused',
    },
    {
      id: 6, name: 'Home Assistant', type: 'http', group: 'Home',
      site: 'Homelab',
      target: 'http://ha.lan:8123/', status: 'down',
      base: 34, spread: 11, uptime: [99.14, 99.83, 99.9],
      downFrom: now - 3 * MINUTE,
      message: 'unexpected status 502 Bad Gateway',
      failMessage: 'unexpected status 502 Bad Gateway',
    },
    {
      id: 7, name: 'Printer', type: 'ping', group: 'Home', enabled: false,
      site: 'Homelab',
      target: '192.168.1.42', status: 'paused',
      base: 8, spread: 3, uptime: [null, null, null], downFrom: null,
    },
    {
      id: 8, name: 'Backup host', type: 'tcp', group: 'Home',
      site: 'Homelab',
      target: 'backup.lan:22', status: 'unknown',
      base: 6.5, spread: 2.1, uptime: [99.72, 99.9, 99.94],
      downFrom: now - 40_000,
      message: '1 of 3 probes failed — waiting for the next before calling it down',
      failMessage: 'i/o timeout after 10s',
    },
  ].map((sensor) => ({
    enabled: true,
    tags: [],
    latency: null,
    ...sensor,
    spark: buildSpark(sensor),
    avg: sensor.enabled === false ? null : Math.round(sensor.base * 1.08 * 10) / 10,
    lastMs: sensor.downFrom ?? now - 12_000,
  }));
}

/** One latency per minute for the last SPARK_SAMPLES minutes, 0 where the probe failed. */
function buildSpark(sensor, seedExtra = 0) {
  if (sensor.enabled === false) return [];
  const rand = rng(sensor.id * 2654435761 + 12345 + seedExtra);
  const now = Date.now();
  const out = [];
  for (let i = SPARK_SAMPLES - 1; i >= 0; i--) {
    const at = now - i * MINUTE;
    if (sensor.downFrom !== null && at >= sensor.downFrom) {
      out.push(0);
      continue;
    }
    const value = sensor.base + (rand() - 0.5) * sensor.spread * 2;
    out.push(Math.round(Math.max(0.4, value) * 10) / 10);
  }
  return out;
}

/** One more sample, for the live tick. */
function nextSample(sensor) {
  const value = sensor.base + (Math.random() - 0.5) * sensor.spread * 2;
  return Math.round(Math.max(0.4, value) * 10) / 10;
}

/** The incidents the demo knows about, newest first. */
function buildIncidents() {
  const now = Date.now();
  return [
    {
      id: 101, sensor_id: 5, cause: 'connect: connection refused',
      started_at: new Date(now - 6 * MINUTE).toISOString(), resolved_at: null,
      acked_at: null, ack_note: '',
    },
    {
      id: 102, sensor_id: 6, cause: 'unexpected status 502 Bad Gateway',
      started_at: new Date(now - 3 * MINUTE).toISOString(), resolved_at: null,
      acked_at: new Date(now - 2 * MINUTE).toISOString(),
      ack_note: 'Rolling update — back in about ten minutes.',
    },
    {
      id: 103, sensor_id: 8, cause: 'i/o timeout after 10s',
      started_at: new Date(now - 5 * 3_600_000).toISOString(),
      resolved_at: new Date(now - 5 * 3_600_000 + 4 * MINUTE).toISOString(),
      acked_at: null, ack_note: '',
    },
    {
      id: 104, sensor_id: 2, cause: 'no ICMP reply (3 of 3 probes)',
      started_at: new Date(now - 26 * 3_600_000).toISOString(),
      resolved_at: new Date(now - 26 * 3_600_000 + 11 * MINUTE).toISOString(),
      acked_at: null, ack_note: '',
    },
    {
      id: 105, sensor_id: 3, cause: 'lookup one.one.one.one: i/o timeout',
      started_at: new Date(now - 3 * 86_400_000).toISOString(),
      resolved_at: new Date(now - 3 * 86_400_000 + 2 * MINUTE).toISOString(),
      acked_at: null, ack_note: '',
    },
  ];
}

const RANGES = {
  '1h': { buckets: 60, stepMs: MINUTE },
  '24h': { buckets: 72, stepMs: 20 * MINUTE },
  '7d': { buckets: 84, stepMs: 2 * 3_600_000 },
  '30d': { buckets: 60, stepMs: 12 * 3_600_000 },
};

/**
 * The history behind a sensor, at the resolution the range asks for. A bucket
 * that the outage covers only partly loses only that share of its uptime, which
 * is why a six-minute outage is a visible gap in the hour view and a rounding
 * error in the thirty-day view — the same way it is in the real thing.
 */
function seriesFor(sensor, range) {
  const cfg = RANGES[range];
  const rand = rng(sensor.id * 7919 + cfg.buckets * 31);
  const now = Date.now();
  const points = [];

  for (let i = cfg.buckets - 1; i >= 0; i--) {
    const start = now - i * cfg.stepMs;
    const span = i === 0 ? Math.max(1000, now - start) : cfg.stepMs;
    const total = Math.max(1, Math.round(span / (PROBE_SECONDS * 1000)));

    if (sensor.enabled === false) {
      points.push({ ts: new Date(start).toISOString(), avg_ms: 0, min_ms: 0, max_ms: 0, total: 0, uptime_pct: null });
      continue;
    }

    // How much of this bucket the outage covers. A bucket spanning twelve hours
    // that contains a six-minute outage loses six minutes of uptime, not all of
    // it — which is why the gap is obvious in the hour view and invisible in the
    // thirty-day one.
    const overlap = sensor.downFrom === null
      ? 0
      : Math.max(0, (start + span) - Math.max(start, sensor.downFrom));
    const failedShare = Math.min(1, overlap / span);

    if (failedShare >= 0.999) {
      // Nothing answered in this bucket. Zero latency rather than a missing
      // value: the probes happened, they just all failed, and the chart draws
      // that as a break in the line.
      points.push({ ts: new Date(start).toISOString(), avg_ms: 0, min_ms: 0, max_ms: 0, total, uptime_pct: 0 });
      continue;
    }

    const avg = sensor.base * (0.9 + rand() * 0.3);
    const min = avg * (0.6 + rand() * 0.15);
    const max = avg * (1.25 + rand() * 0.5);
    points.push({
      ts: new Date(start).toISOString(),
      avg_ms: Math.round(avg * 10) / 10,
      min_ms: Math.round(min * 10) / 10,
      max_ms: Math.round(max * 10) / 10,
      total,
      uptime_pct: Math.round((1 - failedShare) * 10000) / 100,
    });
  }
  return points;
}

function resultsFor(sensor) {
  if (sensor.enabled === false) return [];
  const rand = rng(sensor.id * 977 + 41);
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < 26; i++) {
    const at = now - i * MINUTE - 4_000;
    const failed = sensor.downFrom !== null && at >= sensor.downFrom;
    const latency = Math.round((sensor.base * (0.85 + rand() * 0.4)) * 10) / 10;
    rows.push({
      ts: new Date(at).toISOString(),
      success: !failed,
      latency_ms: failed ? 0 : latency,
      message: failed ? (sensor.failMessage || 'probe failed') : successMessage(sensor),
    });
  }
  return rows;
}

function successMessage(sensor) {
  switch (sensor.type) {
    case 'ping': return '3 packets transmitted, 3 received';
    case 'tcp': return 'connected, closed cleanly';
    case 'dns': return 'A record in 1 answer';
    default: return 'HTTP 200';
  }
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const state = {
  route: 'dashboard',
  range: '24h',
  query: '',
  sensors: buildSensors(),
  sites: SITES,
  incidents: buildIncidents(),
  detail: null,
  // One object for the filter line, the way the product holds it: the state the
  // controls are drawn from and the query that is built from them.
  incidentFilter: { status: '', sensor: 0, range: 'all', query: '' },
  live: true,
  mode: 'advanced',
  theme: 'auto',
  accent: 'azure',
  density: 'comfortable',
  layout: 'grid',
};

function sensorById(id) {
  return state.sensors.find((s) => s.id === id);
}

function incidentById(id) {
  return state.incidents.find((inc) => inc.id === id);
}

/** The open incident on a sensor, if it is down and nothing has been resolved. */
function openIncident(sensorId) {
  return state.incidents.find((inc) => inc.sensor_id === sensorId && !inc.resolved_at) || null;
}

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

function visibleSensors() {
  if (!state.query) return state.sensors;
  return state.sensors.filter((sensor) => [sensor.name, sensor.target, sensor.type, sensor.group]
    .join(' ').toLowerCase().includes(state.query));
}

function statusPill(status) {
  const label = { up: 'Up', down: 'Down', paused: 'Paused' }[status] || 'Pending';
  return `<span class="pill st-${esc(status)}"><i class="dot"></i>${esc(label)}</span>`;
}

function summaryOf(sensors) {
  const up = sensors.filter((s) => s.status === 'up').length;
  const down = sensors.filter((s) => s.status === 'down').length;
  const paused = sensors.filter((s) => s.status === 'paused').length;
  const unknown = sensors.filter((s) => s.status === 'unknown').length;
  return { up, down, paused, unknown };
}

function renderSummary() {
  const sensors = state.sensors;
  const s = summaryOf(sensors);

  const donut = C.donut([
    { value: s.up, cls: 's-ok', label: 'Up' },
    { value: s.down, cls: 's-crit', label: 'Down' },
    { value: s.unknown, cls: 's-unknown', label: 'Pending' },
    { value: s.paused, cls: 's-paused', label: 'Paused' },
  ], { size: 96, thickness: 12 });

  const counts = [
    ['up', s.up, 's-ok'],
    ['down', s.down, 's-crit'],
    ['pending', s.unknown, 's-unknown'],
    ['paused', s.paused, 's-paused'],
  ].filter(([, value]) => value > 0)
    .map(([word, value, cls]) => `<li class="count ${cls}"><span class="count-n">${value}</span> ${word}</li>`)
    .join('');

  // Averages over what is actually up, so a paused sensor neither drags the
  // latency down nor counts as a probe.
  const measured = sensors.filter((x) => x.status === 'up' && x.latency !== null);
  const avg = measured.length
    ? measured.reduce((sum, x) => sum + x.latency, 0) / measured.length
    : null;
  const uptimes = sensors.map((x) => x.uptime[0]).filter((v) => typeof v === 'number');
  const uptime = uptimes.length ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : null;
  const probes = sensors.filter((x) => x.enabled).length * Math.round(86_400 / PROBE_SECONDS);
  $('#summary').innerHTML = `
    <div class="summary-card">
      <div class="summary-ring">${donut}</div>
      <ul class="summary-counts">${counts}</ul>
    </div>
    <div class="stat"><span class="stat-label">Uptime 24h</span>
      <span class="stat-value">${esc(C.fmtPct(uptime))}</span></div>
    <div class="stat"><span class="stat-label">Latency</span>
      <span class="stat-value">${esc(C.fmtLatency(avg))}</span></div>
    <div class="stat"><span class="stat-label">Probes 24h</span>
      <span class="stat-value">${probes}</span></div>
    <div class="stat"><span class="stat-label">Monitoring since</span>
      <span class="stat-value small">${esc(C.fmtDateTime(new Date(Date.now() - 12 * 86_400_000).toISOString()))}</span></div>`;
}

function cardActions(sensor) {
  const open = openIncident(sensor.id);
  const ack = open
    ? (open.acked_at
      ? `<button class="icon-btn is-acked" data-action="unack" data-id="${sensor.id}" title="Undo acknowledgement" aria-label="Undo acknowledgement">🔔</button>`
      : `<button class="icon-btn" data-action="ack" data-id="${sensor.id}" title="Acknowledge" aria-label="Acknowledge">🔕</button>`)
    : '';
  return `
    <div class="card-actions">
      ${ack}
      <button class="icon-btn" data-action="up" data-id="${sensor.id}" title="Move up" aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="down" data-id="${sensor.id}" title="Move down" aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="probe" data-id="${sensor.id}" title="Run now" aria-label="Run now">⟳</button>
      <button class="icon-btn" data-action="toggle" data-id="${sensor.id}" title="${sensor.enabled ? 'Pause' : 'Resume'}" aria-label="${sensor.enabled ? 'Pause' : 'Resume'}">${sensor.enabled ? '⏸' : '▶'}</button>
      <button class="icon-btn" data-action="edit" data-id="${sensor.id}" title="Edit sensor" aria-label="Edit sensor">✎</button>
    </div>`;
}

function renderCard(sensor) {
  const down = sensor.status === 'down';
  const acked = openIncident(sensor.id)?.acked_at;
  return `
    <article class="card st-${esc(sensor.status)}${down ? ' is-down' : ''}${acked ? ' is-acked' : ''}" data-id="${sensor.id}" tabindex="0">
      <header class="card-head">
        ${statusPill(sensor.status)}
        <h3 class="card-name">${esc(sensor.name)}</h3>
        ${acked ? `<span class="pill st-acked" title="This outage has been acknowledged; reminders are paused.">🔕 acknowledged</span>` : ''}
      </header>
      <p class="card-target" title="${esc(sensor.target)}">${esc(sensor.target)}</p>
      ${sensor.status === 'down' && sensor.message ? `<p class="card-message">${esc(sensor.message)}</p>` : ''}
      <div class="card-spark">${C.sparkline(sensor.spark, { width: 240, height: 34 })}</div>
      <footer class="card-foot">
        <div class="card-stats">
          <span title="Uptime 24h">24h <b>${esc(C.fmtPct(sensor.uptime[0]))}</b></span>
          <span>7d <b>${esc(C.fmtPct(sensor.uptime[1]))}</b></span>
          <span>30d <b>${esc(C.fmtPct(sensor.uptime[2]))}</b></span>
          <span class="muted">avg ${esc(C.fmtLatency(sensor.avg))}</span>
        </div>
        <span class="card-meta muted">${esc(C.fmtAgo(new Date(sensor.lastMs).toISOString()))}</span>
        ${cardActions(sensor)}
      </footer>
    </article>`;
}

function renderDashboard() {
  renderSummary();
  const sensors = visibleSensors();
  const groups = $('#groups');

  $('#dashboard-empty').hidden = sensors.length !== 0;
  if (!sensors.length) {
    groups.innerHTML = '';
    return;
  }

  if (state.layout === 'list') {
    groups.innerHTML = renderList(sensors);
    return;
  }
  if (state.layout === 'tree') {
    groups.innerHTML = renderTree(sensors);
    return;
  }

  const byGroup = new Map();
  for (const sensor of sensors) {
    if (!byGroup.has(sensor.group)) byGroup.set(sensor.group, []);
    byGroup.get(sensor.group).push(sensor);
  }

  let html = '';
  for (const [group, items] of byGroup) {
    // Whatever is broken sorts to the front of its group, so the thing that
    // needs attention is never below the fold.
    const sorted = items.slice().sort((a, b) => rank(a.status) - rank(b.status));
    html += `<h2 class="group-title">${esc(group)}</h2>`;
    html += `<div class="cards">${sorted.map(renderCard).join('')}</div>`;
  }
  groups.innerHTML = html;
}

/**
 * The list view: one row per sensor, for scanning rather than watching.
 *
 * It is the product's table with the product's class names, drawn over the
 * demo's own sensor shape. The columns are the ones that answer "which one is
 * slow, and which one is down" without opening anything.
 */
function renderList(sensors) {
  const rows = sensors.map((sensor) => `
    <tr class="row st-${esc(sensor.status)}${sensor.status === 'down' ? ' is-down' : ''}" data-id="${sensor.id}">
      <td>${statusPill(sensor.status)}</td>
      <td class="cell-name">
        <b>${esc(sensor.name)}</b>
        <span class="muted">${esc(sensor.target)}</span>
      </td>
      <td>${C.sparkline(sensor.spark, { width: 140, height: 26 })}</td>
      <td class="num">${esc(C.fmtPct(sensor.uptime[0]))}</td>
      <td class="num">${esc(C.fmtLatency(sensor.latency))}</td>
      <td class="muted">${esc(C.fmtAgo(new Date(sensor.lastMs).toISOString()))}</td>
      <td>${cardActions(sensor)}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="sensors-table">
    <thead><tr>
      <th></th><th>Sensor</th><th></th>
      <th class="num">24h</th><th class="num">Latency</th>
      <th>Last probe</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/**
 * Gather the sensors into places, and inside each place into groups.
 *
 * The places come out in the order they were configured, so the tree does not
 * reshuffle itself when a sensor moves between groups. A sensor with no site is
 * not an error — it lands under "No site", which is where one added in the demo
 * goes, and where most sensors are on an installation nobody has told about
 * places yet.
 */
function groupBySite(sensors) {
  const known = new Map(state.sites.map((site) => [site.name, site]));
  const buckets = new Map();
  const order = [];

  const bucketFor = (name) => {
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = { name, site: known.get(name) || null, groups: [], byGroup: new Map() };
      buckets.set(name, bucket);
      order.push(name);
    }
    return bucket;
  };

  for (const site of state.sites) bucketFor(site.name);
  for (const sensor of sensors) {
    const bucket = bucketFor(sensor.site || '');
    const group = sensor.group || '';
    if (!bucket.byGroup.has(group)) {
      bucket.byGroup.set(group, []);
      bucket.groups.push(group);
    }
    bucket.byGroup.get(group).push(sensor);
  }

  const out = [];
  for (const name of order) {
    const bucket = buckets.get(name);
    if (!bucket.byGroup.size) continue;
    const all = [];
    for (const group of bucket.groups) all.push(...bucket.byGroup.get(group));
    out.push({
      name: bucket.name,
      site: bucket.site,
      groups: bucket.groups.map((group) => ({ name: group, sensors: bucket.byGroup.get(group) })),
      sensors: all,
      worst: worstStatus(all),
    });
  }
  return out;
}

/**
 * worstStatus is the most serious status in a set.
 *
 * A site heading has to answer "is anything wrong in here?" at a glance, and the
 * answer is the worst thing in it, not the average: one dead sensor among twenty
 * healthy ones is the case the heading exists to surface. Paused ranks below
 * unknown — a paused sensor is a decision somebody made, an unknown one is a
 * question nobody has answered yet.
 */
function worstStatus(sensors) {
  const RANK = { down: 3, unknown: 2, paused: 1, up: 0 };
  let found = 'unknown';
  let best = -1;
  for (const sensor of sensors) {
    const r = RANK[sensor.status] ?? RANK.unknown;
    if (r > best) {
      best = r;
      found = sensor.status;
    }
  }
  return best < 0 ? 'unknown' : found;
}

const SITE_CARET = '<svg class="site-caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
  '<path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * The tree: folded by place, then by group, like a monitoring console.
 *
 * `<details>` rather than a hand-rolled expander, so the keyboard, the screen
 * reader and the browser's own find-in-page already understand it. The summary
 * carries no `data-id` — everything else in the container does, and a click on a
 * heading would otherwise open whichever sensor happened to be nearest.
 */
function renderTree(sensors) {
  return groupBySite(sensors).map((bucket) => `
    <details class="site-node" open>
      <summary class="site-head">
        ${SITE_CARET}
        <span class="legend-dot st-${esc(bucket.worst)}" aria-hidden="true"></span>
        <span class="site-name">${esc(bucket.name || 'No site')}</span>
        ${bucket.site ? `<span class="kind-tag k-${esc(bucket.site.kind)}">${esc(bucket.site.kind === 'local' ? 'Homelab' : 'External')}</span>` : ''}
        <span class="site-count">${esc(countLabel(bucket))}</span>
      </summary>
      <div class="site-body">
        ${bucket.groups.map((group) => `
          <div class="group-node">
            ${group.name ? `<div class="group-label">${esc(group.name)}</div>` : ''}
            ${group.sensors.map((sensor) => `
              <div class="tree-row st-${esc(sensor.status)}" data-id="${sensor.id}" tabindex="0">
                ${statusPill(sensor.status)}
                <span class="row-name">${esc(sensor.name)}
                  <span class="row-target">${esc(sensor.target)}</span></span>
                <span class="row-spark">${C.sparkline(sensor.spark, { width: 120, height: 24 })}</span>
                <span class="num" title="Uptime 24h">${esc(C.fmtPct(sensor.uptime[0]))}</span>
                ${cardActions(sensor)}
              </div>`).join('')}
          </div>`).join('')}
      </div>
    </details>`).join('');
}

/** How much is in a place, and how much of it is broken. */
function countLabel(bucket) {
  const down = bucket.sensors.filter((sensor) => sensor.status === 'down').length;
  const n = bucket.sensors.length;
  return down > 0 ? `${n} sensor(s), ${down} down` : `${n} sensor(s)`;
}

function rank(status) {
  return { down: 0, unknown: 1, up: 2, paused: 3 }[status] ?? 4;
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

/**
 * The chips and the acknowledge button above the detail body. Rebuilt on every
 * change, because acknowledging adds or removes the button and there is no
 * finer-grained way to say that here.
 */
function renderDetailActions(id) {
  const open = openIncident(id);
  const ackButton = open
    ? (open.acked_at
      ? `<button class="btn btn-ghost" data-action="unack">🔔 Undo acknowledgement</button>`
      : `<button class="btn" data-action="ack">🔕 Acknowledge</button>`)
    : '';
  $('#detail-actions').innerHTML = `
    <div class="range-picker" id="range-picker">
      ${['1h', '24h', '7d', '30d'].map((r) => `<button type="button" class="chip${r === state.range ? ' active' : ''}" data-range="${r}">${esc(RANGE_LABEL[r])}</button>`).join('')}
    </div>
    ${ackButton ? `<div class="detail-ack">${ackButton}</div>` : ''}`;
}

function openDetail(id) {
  const sensor = sensorById(id);
  if (!sensor) return;
  state.detail = id;

  $('#detail-title').textContent = sensor.name;
  renderDetailActions(id);
  $('#detail-body').innerHTML = detailMarkup(id);
  $('#detail').showModal();
}

const RANGE_LABEL = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

function detailMarkup(id) {
  const sensor = sensorById(id);
  if (!sensor) return '';
  const points = seriesFor(sensor, state.range);
  const results = resultsFor(sensor);
  // The sheet is min(880px, 100vw - 32px) and its body carries 18px of padding
  // on each side, so this is the width the chart can actually have. Measured
  // rather than hard-coded because the dialog is not open yet at this point and
  // measuring it now would return zero.
  const width = Math.max(320, Math.min(842, window.innerWidth - 72));

  const stats = uptimeStats(sensor, points);
  const outage = openIncident(id);
  const acked = outage?.acked_at
    ? `<span class="ack-note">🔕 acknowledged · ${esc(C.fmtDateTime(outage.acked_at))}${outage.ack_note ? ` · ${esc(outage.ack_note)}` : ''}</span>`
    : '';
  const openBanner = outage
    ? `<div class="banner crit">Down since ${esc(C.fmtDateTime(outage.started_at))} · ${esc(C.fmtDuration(Date.now() - new Date(outage.started_at).getTime()))} ${acked}</div>`
    : '';
  const paused = sensor.status === 'paused'
    ? `<div class="banner">This sensor is paused. Nothing is being probed, so there is no new history to draw.</div>`
    : '';

  const rows = results.slice(0, 18).map((r) => `
    <tr class="${r.success ? '' : 'row-crit'}">
      <td class="muted">${esc(C.fmtDateTime(r.ts))}</td>
      <td>${r.success ? 'Up' : 'Down'}</td>
      <td class="num">${esc(C.fmtLatency(r.latency_ms))}</td>
      <td class="muted">${esc(r.message)}</td>
    </tr>`).join('');

  return `
    ${openBanner}
    ${paused}
    <p class="muted detail-sub">${esc(sensor.type)} · ${esc(sensor.target)} · ${esc(sensor.group)}</p>
    <div class="detail-stats">
      <div class="stat"><span class="stat-label">Uptime</span><span class="stat-value">${esc(C.fmtPct(stats.percent))}</span></div>
      <div class="stat"><span class="stat-label">Average</span><span class="stat-value">${esc(C.fmtLatency(stats.latency))}</span></div>
      <div class="stat"><span class="stat-label">Incidents in this window</span><span class="stat-value">${incidentsInWindow(sensor, state.range).length}</span></div>
      <div class="stat"><span class="stat-label">Total downtime</span><span class="stat-value">${esc(C.fmtDuration(downtimeInWindow(sensor, state.range)))}</span></div>
    </div>
    <h3 class="section-title">Latency</h3>
    ${C.latencyChart(points, { width, height: 190, emptyText: 'No probes recorded in this window yet.' })}
    <h3 class="section-title">History</h3>
    ${C.uptimeStrip(points, { width, height: 32 })}
    <h3 class="section-title">Recent probes</h3>
    <div class="table-wrap"><table class="results-table">
      <thead><tr><th>Time</th><th>Result</th><th class="num">Latency</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">A paused sensor records no probes.</td></tr>'}</tbody>
    </table></div>`;
}

function uptimeStats(sensor, points) {
  let total = 0;
  let ok = 0;
  let weighted = 0;
  for (const p of points) {
    if (p.total <= 0) continue;
    total += p.total;
    ok += p.total * ((p.uptime_pct ?? 0) / 100);
    if (p.avg_ms > 0) weighted += p.avg_ms * p.total;
  }
  return {
    percent: total > 0 ? Math.round((ok / total) * 10000) / 100 : null,
    latency: ok > 0 ? Math.round((weighted / ok) * 10) / 10 : null,
  };
}

function windowMs(range) {
  return {
    '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000,
    '30d': 30 * 86_400_000, '90d': 90 * 86_400_000,
  }[range];
}

function incidentsInWindow(sensor, range) {
  const from = Date.now() - windowMs(range);
  return state.incidents.filter((inc) => inc.sensor_id === sensor.id
    && new Date(inc.started_at).getTime() >= from);
}

function downtimeInWindow(sensor, range) {
  const from = Date.now() - windowMs(range);
  return incidentsInWindow(sensor, range).reduce((sum, inc) => {
    const started = new Date(inc.started_at).getTime();
    const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now();
    return sum + Math.max(0, end - Math.max(started, from));
  }, 0);
}

// ---------------------------------------------------------------------------
// incidents and acknowledgement
// ---------------------------------------------------------------------------

// The four values the period chips stand for, in the order the product lists
// them. "all" is not a window at all and is handled as such rather than as a
// very wide one.
const INCIDENT_RANGES = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

/** Whether anything is narrowed at all — the reset button and the two
 *  different readings of an empty list both hang off this. */
function incidentFilterActive() {
  const f = state.incidentFilter;
  return Boolean(f.status || f.sensor || f.range !== 'all' || f.query || state.query);
}

/** Fills the controls from the state. Called once at boot and again whenever
 *  the reset button puts the state back, so the two never disagree. */
function buildIncidentFilter() {
  const f = state.incidentFilter;

  for (const button of $$('#incident-status .seg-btn')) {
    button.setAttribute('aria-pressed', String(button.dataset.state === f.status));
  }

  const select = $('#incident-sensor');
  select.innerHTML = '<option value="0">All sensors</option>'
    + state.sensors.map((sensor) => `<option value="${sensor.id}">${esc(sensor.name)}</option>`).join('');
  select.value = String(f.sensor);

  $('#incident-range').innerHTML = INCIDENT_RANGES
    .map((r) => `<button type="button" class="chip${r.value === f.range ? ' active' : ''}"
      data-range="${r.value}" aria-pressed="${r.value === f.range}">${esc(r.label)}</button>`).join('');

  $('#incident-query').value = f.query;
  $('#incident-reset').hidden = !incidentFilterActive();
}

function renderIncidents() {
  const f = state.incidentFilter;
  // The top bar searches everything in the product; here it searches the list
  // that is on screen, which on this tab is the incident list.
  const text = f.query || state.query;
  const from = f.range === 'all' ? 0 : Date.now() - windowMs(f.range);

  const rows = state.incidents
    .filter((inc) => !f.status || (f.status === 'open' ? !inc.resolved_at : Boolean(inc.resolved_at)))
    .filter((inc) => !f.sensor || inc.sensor_id === f.sensor)
    .filter((inc) => new Date(inc.started_at).getTime() >= from)
    .filter((inc) => {
      if (!text) return true;
      const sensor = sensorById(inc.sensor_id) || {};
      return [inc.cause, sensor.name, inc.ack_note].join(' ').toLowerCase().includes(text);
    })
    .slice()
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

  // An empty list means one of two things, and they are not the same news. The
  // page says which one it is rather than leaving the reader to work it out —
  // and saying "nothing has failed" under a filter that is hiding everything
  // would send somebody looking for a fault in their installation that is
  // really a setting on this page.
  const filtered = incidentFilterActive();
  $('#incident-reset').hidden = !filtered;
  $('#incidents-empty').hidden = rows.length > 0;
  $('#incidents-empty-body').hidden = filtered;
  $('#incidents-empty-filtered').hidden = !filtered;

  $('#incident-list').innerHTML = !rows.length ? '' : `<table class="incidents-table">
    <thead><tr>
      <th>Sensor</th><th>Started</th><th>Resolved</th><th class="num">Duration</th><th>Message</th><th></th>
    </tr></thead>
    <tbody>${rows.map((inc) => {
      const sensor = sensorById(inc.sensor_id) || {};
      const started = new Date(inc.started_at).getTime();
      const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now();
      const ongoing = !inc.resolved_at;
      const ack = ongoing
        ? (inc.acked_at
          ? `<span class="pill st-acked">🔕 acknowledged</span>
             <button class="btn btn-ghost btn-small" data-action="unack" data-incident="${inc.id}">Undo</button>`
          : `<button class="btn btn-ghost btn-small" data-action="ack" data-incident="${inc.id}">Acknowledge</button>`)
        : '';
      return `<tr class="${ongoing ? 'row-crit' : ''}" data-id="${inc.sensor_id}">
        <td><b>${esc(sensor.name || '')}</b><br><span class="muted">${esc(sensor.target || '')}</span></td>
        <td class="muted">${esc(C.fmtDateTime(inc.started_at))}</td>
        <td>${ongoing ? '<span class="pill st-down"><i class="dot"></i>ongoing</span>' : `<span class="muted">${esc(C.fmtDateTime(inc.resolved_at))}</span>`}</td>
        <td class="num">${esc(C.fmtDuration(end - started))}</td>
        <td class="muted">${esc(inc.cause)}${inc.ack_note ? `<br><span class="ack-note">🔕 ${esc(inc.ack_note)}</span>` : ''}</td>
        <td class="incident-actions">${ack}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

/** The acknowledgement dialog, which is a note field and nothing else. */
function openAckDialog(incidentId) {
  const inc = incidentById(incidentId);
  if (!inc) return;
  const form = $('#modal-form');
  form.dataset.mode = 'ack';
  form.dataset.id = incidentId;
  $('#modal-title').textContent = 'Acknowledge this outage';
  $('#modal-body').innerHTML = `
    <p class="muted">Weatherglass keeps probing and stops repeating the reminder. The recovery
    message still arrives, so you will still hear when it is back.</p>
    <label class="field"><span>A note ${helpButton('help.ack.note')}</span>
      <input name="note" type="text" maxlength="200" placeholder="known reboot, on it" autocomplete="off"></label>`;
  $('#modal-save').textContent = 'Acknowledge';
  $('#modal').showModal();
}

function acknowledge(incidentId, note) {
  const inc = incidentById(incidentId);
  if (!inc) return;
  inc.acked_at = new Date().toISOString();
  inc.ack_note = (note || '').trim();
  afterOutageChange();
  toast('Outage acknowledged — reminders are paused.');
}

function unacknowledge(incidentId) {
  const inc = incidentById(incidentId);
  if (!inc) return;
  inc.acked_at = null;
  inc.ack_note = '';
  afterOutageChange();
  toast('Acknowledgement removed — the reminder will go out again.');
}

function afterOutageChange() {
  renderDashboard();
  renderIncidents();
  if (state.detail !== null && $('#detail').open) {
    renderDetailActions(state.detail);
    $('#detail-body').innerHTML = detailMarkup(state.detail);
  }
}

// ---------------------------------------------------------------------------
// the new-sensor form
// ---------------------------------------------------------------------------

const SENSOR_TYPES = [
  {
    value: 'http', label: 'HTTP(S)', targetLabel: 'URL', placeholder: 'https://example.org/health',
    fields: [
      { key: 'expected_status', label: 'Expected status', type: 'text', placeholder: '200-299' },
      { key: 'method', label: 'HTTP method', type: 'select', options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'follow_redirects', label: 'Follow redirects', type: 'bool' },
      { key: 'body_contains', label: 'Body contains', type: 'text' },
      { key: 'body_not_contains', label: 'Body must not contain', type: 'text' },
      { key: 'body_regex', label: 'Body matches regex', type: 'text' },
      { key: 'headers', label: 'Request headers', type: 'map' },
      { key: 'expected_headers', label: 'Expected response headers', type: 'map' },
      { key: 'cert_warn_days', label: 'Warn when certificate expires in (days)', type: 'number', placeholder: '14' },
      { key: 'bearer_token', label: 'Bearer token', type: 'password' },
      { key: 'basic_auth_user', label: 'Basic auth user', type: 'text' },
      { key: 'basic_auth_pass', label: 'Basic auth password', type: 'password' },
      { key: 'insecure_skip_verify', label: 'Skip TLS verification', type: 'bool' },
    ],
  },
  {
    value: 'tcp', label: 'TCP port', targetLabel: 'Host:port', placeholder: 'db.internal:5432',
    fields: [
      { key: 'tls', label: 'Use TLS', type: 'bool' },
      { key: 'server_name', label: 'TLS server name (SNI)', type: 'text', placeholder: 'db.internal' },
      { key: 'cert_warn_days', label: 'Warn when certificate expires in (days)', type: 'number', placeholder: '14' },
      { key: 'send', label: 'Send on connect', type: 'text' },
      { key: 'expect', label: 'Expect in reply', type: 'text' },
      { key: 'insecure_skip_verify', label: 'Skip TLS verification', type: 'bool' },
    ],
  },
  {
    value: 'ping', label: 'Ping (ICMP)', targetLabel: 'Host', placeholder: '192.168.1.1',
    fields: [{ key: 'count', label: 'Pings per probe', type: 'number', placeholder: '3' }],
  },
  {
    value: 'dns', label: 'DNS', targetLabel: 'Name', placeholder: 'example.org',
    fields: [
      { key: 'record_type', label: 'Record type', type: 'select', options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'] },
      { key: 'resolver', label: 'Custom resolver', type: 'text', placeholder: '1.1.1.1:53' },
      { key: 'expected', label: 'Expected answers', type: 'list' },
      { key: 'expect_all', label: 'All expected answers must be present', type: 'bool' },
    ],
  },
];

function typeDef(value) {
  return SENSOR_TYPES.find((t) => t.value === value) || SENSOR_TYPES[0];
}

/** One field inside the collapsible options block. */
function optionField(field) {
  const label = `${esc(field.label)} ${helpButton(`help.opt.${field.key}`)}`;
  const common = `name="opt_${field.key}"`;
  let control;
  if (field.type === 'bool') {
    control = `<span class="switch"><input type="checkbox" ${common}><span>on</span></span>`;
  } else if (field.type === 'select') {
    control = `<select ${common}>${field.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
  } else if (field.type === 'map' || field.type === 'list') {
    control = `<textarea ${common} rows="2" placeholder="${esc(OPT_EXAMPLE(field))}"></textarea>`;
  } else {
    control = `<input type="${field.type === 'number' ? 'number' : (field.type === 'password' ? 'password' : 'text')}" ${common} placeholder="${esc(OPT_EXAMPLE(field))}" autocomplete="off">`;
  }
  return `<label class="field"><span>${label}</span>${control}</label>`;
}

function sensorFormMarkup() {
  const def = typeDef('http');
  return `
    <div class="grid-2">
      <label class="field"><span>Name ${helpButton('help.sensor.name')}</span>
        <input name="name" type="text" required autocomplete="off"></label>
      <label class="field"><span>Type ${helpButton('help.sensor.type')}</span>
        <select name="type" id="demo-sensor-type">
          ${SENSOR_TYPES.map((t) => `<option value="${t.value}">${esc(t.label)}</option>`).join('')}
        </select></label>
    </div>

    <label class="field"><span>${esc(def.targetLabel)} ${helpButton('help.sensor.target')}</span>
      <input name="target" type="text" required placeholder="${esc(def.placeholder)}" autocomplete="off"></label>

    <div class="grid-3">
      <label class="field"><span>Interval (s) ${helpButton('help.sensor.interval')}</span>
        <input name="interval" type="number" min="5" max="86400" value="60"></label>
      <label class="field"><span>Timeout (s) ${helpButton('help.sensor.timeout')}</span>
        <input name="timeout" type="number" min="1" max="600" value="10"></label>
      <label class="field adv-hide"><span>Retries before down ${helpButton('help.sensor.retries')}</span>
        <input name="retries" type="number" min="1" max="10" value="3"></label>
    </div>

    <div class="grid-2 adv-hide">
      <label class="field"><span>Group ${helpButton('help.sensor.group')}</span>
        <input name="group" type="text" autocomplete="off"></label>
      <label class="field"><span>Tags ${helpButton('help.sensor.tags')}</span>
        <input name="tags" type="text" autocomplete="off"></label>
    </div>

    <label class="field adv-hide"><span>Remind every (s) ${helpButton('help.sensor.reminder')}</span>
      <input name="reminder_every" type="number" min="0" value="3600"></label>

    <details class="options adv-hide adv-fold">
      <summary>${esc(def.label)}</summary>
      <div id="option-fields" class="grid-2">${def.fields.map(optionField).join('')}</div>
    </details>

    <fieldset class="channels-pick adv-hide">
      <legend>Alert channels ${helpButton('help.sensor.channels')}</legend>
      <label class="sensor-row"><input type="checkbox"> <span>Homelab Telegram <small class="muted">telegram</small></span></label>
      <label class="sensor-row"><input type="checkbox"> <span>Ops webhook <small class="muted">webhook</small></span></label>
      <p class="muted small">The demo has no channels of its own, so these two are made up as well.</p>
    </fieldset>

    <label class="sensor-row"><input type="checkbox" checked>
      <span>Enabled ${helpButton('help.sensor.enabled')}</span></label>`;
}

function openSensorDialog() {
  const form = $('#modal-form');
  form.dataset.mode = 'sensor';
  form.dataset.id = '';
  $('#modal-title').textContent = 'New sensor';
  $('#modal-body').innerHTML = sensorFormMarkup();
  $('#modal-save').textContent = 'Add sensor';
  applyFold();
  $('#modal').showModal();
}

// ---------------------------------------------------------------------------
// field help
// ---------------------------------------------------------------------------

const HELP = {
  'help.sensor.name': ['Shown on every screen and in alert messages. Two sensors cannot share a name.', 'Living-room switch'],
  'help.sensor.type': ['What is probed. Changing it swaps the options below for that kind of sensor.', 'http'],
  'help.sensor.target': ['The address the probe is aimed at. Its shape depends on the type: a URL for HTTP, host:port for TCP, a bare host for ping.', 'https://example.org/health'],
  'help.sensor.interval': ['Seconds between probes. Five is the shortest any sensor may use.', '60'],
  'help.sensor.timeout': ['Seconds a single probe may take before it counts as failed.', '10'],
  'help.sensor.retries': ['How many probes in a row may fail before the sensor counts as down and the first alert goes out. One means an alert on the first failure.', '3'],
  'help.sensor.group': ['Optional. Sensors sharing a group are drawn under one heading on the dashboard.', 'Network'],
  'help.sensor.tags': ['Comma-separated words you can search for, and that alert templates can use.', 'lan, critical'],
  'help.sensor.reminder': ['Seconds between repeat alerts while the sensor stays down. 0 turns reminders off, so only the first alert and the recovery message arrive.', '3600'],
  'help.sensor.channels': ['Where the alert goes when this sensor goes down. A sensor with no channel is still monitored and shown, and simply tells nobody.', 'Homelab Telegram'],
  'help.sensor.enabled': ['Untick to stop probing. A paused sensor keeps its history and shows grey. Pausing is not acknowledging: acknowledging keeps the probing and stops only the reminders.', 'ticked'],

  'help.opt.expected_status': ['Which HTTP status codes count as healthy: one code, a list, or a range.', '200-299'],
  'help.opt.method': ['The HTTP method to use. HEAD asks for the headers only, which is cheaper when all you care about is that the page answers.', 'GET'],
  'help.opt.follow_redirects': ['Whether a redirect counts as success or as a failure. Leave it off to be told when a page starts redirecting and never arrives.', 'true'],
  'help.opt.body_contains': ['Text that must appear in the response body — for checking an application is really up rather than merely answering.', '"status": "ok"'],
  'help.opt.body_not_contains': ['Text that must not appear. Catches an error page served with a 200.', 'Fatal error'],
  'help.opt.body_regex': ['A regular expression the body must match, for what a fixed string cannot express.', '"version":\\s*"1\\.'],
  'help.opt.headers': ['Extra request headers, one per line as Key: value. Leave empty to send none.', 'X-Api-Key: abc123'],
  'help.opt.expected_headers': ['Response headers that must be present, one per line as Key: value. Both the name and the value have to match.', 'Content-Type: application/json'],
  'help.opt.cert_warn_days': ['Warn this many days before the TLS certificate expires. The sensor stays up; only the message changes.', '14'],
  'help.opt.bearer_token': ['Sent as the Authorization: Bearer header.', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'],
  'help.opt.basic_auth_user': ['Username for HTTP basic authentication. Set it together with the password.', 'monitor'],
  'help.opt.basic_auth_pass': ['Password for HTTP basic authentication.', 's3cret'],
  'help.opt.insecure_skip_verify': ['Accept a self-signed or otherwise unverifiable certificate. Only for hosts on your own network.', 'false'],
  'help.opt.tls': ['Open the connection over TLS. Turn it off for a plain-text service such as a raw Redis or SMTP port.', 'true'],
  'help.opt.server_name': ['The name to check the certificate against, when it differs from the host you connect to.', 'db.internal'],
  'help.opt.send': ['Text to write as soon as the connection opens. Escape sequences such as \\r\\n are honoured.', 'PING\\r\\n'],
  'help.opt.expect': ['Text the reply must contain for the probe to pass. Leave empty to accept any reply.', '+PONG'],
  'help.opt.count': ['How many pings one probe sends. More pings is a steadier latency reading and a slower probe.', '3'],
  'help.opt.record_type': ['The DNS record to ask for. The answer has to be of this type.', 'A'],
  'help.opt.resolver': ['Ask this server instead of the system resolver, as host:port.', '1.1.1.1:53'],
  'help.opt.expected': ['Answers that count as correct, comma separated. Empty means any answer passes.', '93.184.215.14'],
  'help.opt.expect_all': ['Require every expected answer. Otherwise one match is enough.', 'false'],

  'help.ack.note': ['A word for whoever reads this later: what the outage was, who is on it, or which ticket covers it. Optional, and it stays with the outage.', 'Known reboot, ticket 4711'],
};

/**
 * The "?" beside a label. One button, one popover, and the same rules as the
 * product: it opens on a click or on Enter, Escape closes it, and a click
 * anywhere else dismisses it. It is never hover-only, because a tooltip that
 * needs a mouse is unusable on a tablet.
 *
 * The text is inlined from the product's own catalogue, so the demo explains a
 * field with the sentence the real form uses — the wording is half the feature.
 */
function helpButton(key) {
  const entry = HELP[key];
  if (!entry) return '';
  const [text, example] = entry;
  return `<button type="button" class="help-dot" data-help="${esc(text)}"` +
    `${example ? ` data-help-example="${esc(example)}"` : ''} ` +
    `aria-expanded="false" aria-label="What is this field?">?</button>`;
}

/** The example value the product shows for an option field, if it has one. */
const OPT_EXAMPLE = (field) => (HELP[`help.opt.${field.key}`] || [])[1] || '';

/** Where the panel is attached — see the same function in the product's tooltip.js. */
function helpHost() {
  return document.querySelector('dialog[open]') || document.body;
}

let openHelp = null;

function closeHelp() {
  if (!openHelp) return;
  openHelp.panel.remove();
  openHelp.trigger.setAttribute('aria-expanded', 'false');
  openHelp = null;
}

function showHelp(trigger) {
  closeHelp();
  const panel = document.createElement('div');
  panel.className = 'help-pop';
  panel.setAttribute('role', 'tooltip');

  const bodyText = trigger.dataset.help;
  if (bodyText) {
    const el = document.createElement('p');
    el.className = 'help-body';
    el.textContent = bodyText;
    panel.append(el);
  }
  const example = trigger.dataset.helpExample;
  if (example) {
    const row = document.createElement('p');
    row.className = 'help-eg';
    const label = document.createElement('span');
    label.textContent = 'Example';
    const code = document.createElement('code');
    code.textContent = example;
    row.append(label, code);
    panel.append(row);
  }

  helpHost().append(panel);

  // Fixed positioning, measured at the origin first so the panel's own size does
  // not depend on where it is about to land.
  const margin = 10;
  panel.style.left = '0px';
  panel.style.top = '0px';
  const box = panel.getBoundingClientRect();
  const at = trigger.getBoundingClientRect();
  let left = Math.min(at.left, window.innerWidth - margin - box.width);
  let top = at.bottom + 6;
  if (top + box.height > window.innerHeight - margin) top = at.top - 6 - box.height;

  panel.style.left = `${Math.max(margin, left)}px`;
  panel.style.top = `${Math.max(margin, top)}px`;
  trigger.setAttribute('aria-expanded', 'true');
  openHelp = { trigger, panel };
}

function initHelp() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.help-dot');
    if (trigger) {
      // Inside a <label>, a click would otherwise also focus the input, and a
      // button without type="button" would submit the form it sits in.
      event.preventDefault();
      event.stopPropagation();
      if (openHelp && openHelp.trigger === trigger) closeHelp();
      else showHelp(trigger);
      return;
    }
    if (openHelp && !event.target.closest('.help-pop')) closeHelp();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openHelp) {
      const trigger = openHelp.trigger;
      closeHelp();
      trigger.focus();
    }
  });

  window.addEventListener('resize', closeHelp);
  document.addEventListener('scroll', closeHelp, true);
}

// ---------------------------------------------------------------------------
// the guided tour
// ---------------------------------------------------------------------------

const TOUR = [
  {
    target: null,
    title: 'This is the dashboard',
    body: 'Every number here is invented, but every control works. Nothing on this page reaches a server.',
  },
  {
    target: '#summary',
    placement: 'bottom',
    title: 'How it is going, in one line',
    body: 'The ring splits your sensors by state, and the figures beside it are the things people ask first: uptime, latency, probes.',
  },
  {
    target: '#groups',
    placement: 'top',
    title: 'Sensors, grouped',
    body: 'Each card is one thing being watched, with its response time and a sparkline. Whatever is failing sorts to the top of its group.',
  },
  {
    target: '#new-sensor',
    placement: 'bottom',
    title: 'Adding a sensor',
    body: 'Seven types: HTTP, TCP, TLS certificates, ping, DNS, Docker containers and SNMP. Everything a field means sits behind the small "?" beside its label, with an example.',
  },
  {
    target: '[data-route="incidents"]',
    placement: 'bottom',
    title: 'Incidents',
    body: 'One row per outage, with how long it lasted and what the target said. While it is ongoing you can acknowledge it.',
  },
  {
    target: '#mode-picker',
    placement: 'bottom',
    title: 'Simple or advanced',
    body: 'Advanced shows every knob. Simple hides retries, tags, the type options and the appearance settings — the same choice the setup wizard asks for.',
  },
  {
    target: '#theme-picker',
    placement: 'bottom',
    mode: 'advanced',
    title: 'Make it yours',
    body: 'Light, dark, or follow the system — and six accent colours beside it. Try them; this is the real stylesheet.',
  },
  {
    target: null,
    title: 'That is the tour',
    body: 'Click any card for its history, or open Incidents and acknowledge the one that is waiting. The full product is one container away.',
  },
];

function tourSteps(mode) {
  const out = [];
  for (const step of TOUR) {
    if (step.mode === 'advanced' && mode !== 'advanced') continue;
    let el = null;
    if (step.target) {
      el = document.querySelector(step.target);
      const rect = el?.getBoundingClientRect();
      // A step whose target is not on screen is not a step. Skipping rather
      // than pointing at nothing is what lets one list serve both modes.
      if (!el || !rect || rect.width === 0 || rect.height === 0) continue;
    }
    out.push({ ...step, el });
  }
  return out;
}

function startTour() {
  // The first steps point at the dashboard, and a target that is off screen is
  // skipped — so the route is settled before the step list is built.
  if (state.route !== 'dashboard') showRoute('dashboard');

  const steps = tourSteps(state.mode);
  if (!steps.length) return;

  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Guided tour');

  const block = document.createElement('div');
  block.className = 'tour-block';
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.tabIndex = -1;
  card.innerHTML = `
    <p class="tour-count"></p>
    <h3 class="tour-title"></h3>
    <p class="tour-body"></p>
    <div class="tour-nav">
      <button type="button" class="btn btn-ghost" data-tour="skip">Skip</button>
      <span class="tour-spacer"></span>
      <button type="button" class="btn" data-tour="back">Back</button>
      <button type="button" class="btn btn-primary" data-tour="next">Next</button>
    </div>`;
  layer.append(block, ring, card);

  let index = 0;

  const draw = () => {
    const step = steps[index];
    card.querySelector('.tour-count').textContent = `${index + 1} / ${steps.length}`;
    card.querySelector('.tour-title').textContent = step.title;
    card.querySelector('.tour-body').textContent = step.body;
    card.querySelector('[data-tour="back"]').disabled = index === 0;
    card.querySelector('[data-tour="next"]').textContent = index === steps.length - 1 ? 'Done' : 'Next';

    if (step.el) {
      const at = step.el.getBoundingClientRect();
      const pad = 6;
      ring.hidden = false;
      ring.style.left = `${at.left - pad}px`;
      ring.style.top = `${at.top - pad}px`;
      ring.style.width = `${at.width + pad * 2}px`;
      ring.style.height = `${at.height + pad * 2}px`;
    } else {
      ring.hidden = true;
    }

    card.style.transform = '';
    if (!step.el) {
      card.style.left = '50%';
      card.style.top = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }
    card.style.left = '0px';
    card.style.top = '0px';
    const box = card.getBoundingClientRect();
    const at = ring.getBoundingClientRect();
    const margin = 14;
    let left = Math.min(at.left + at.width / 2 - box.width / 2, window.innerWidth - margin - box.width);
    let top = step.placement === 'top' ? at.top - box.height - 12 : at.bottom + 12;
    if (top + box.height > window.innerHeight - margin) top = at.top - box.height - 12;
    card.style.left = `${Math.max(margin, left)}px`;
    card.style.top = `${Math.max(margin, top)}px`;
  };

  const finish = () => {
    layer.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', draw);
    if (state.route === 'incidents') showRoute('dashboard');
  };

  const go = (delta) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      finish();
      return;
    }
    index = next;
    // Later steps point at the incidents tab, so the tour walks there itself.
    if (steps[index].target === '[data-route="incidents"]') showRoute('incidents');
    else if (state.route !== 'dashboard') showRoute('dashboard');
    draw();
  };

  card.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tour]');
    if (!button) return;
    if (button.dataset.tour === 'skip') finish();
    else if (button.dataset.tour === 'back') go(-1);
    else go(1);
  });

  function onKey(event) {
    if (event.key === 'Escape') finish();
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else return;
    event.preventDefault();
  }

  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', draw);

  document.body.append(layer);
  draw();
  card.focus();
}

// ---------------------------------------------------------------------------
// appearance
// ---------------------------------------------------------------------------

/** Collapse the advanced blocks in simple mode, exactly as app.js does. */
function applyFold() {
  const simple = state.mode === 'simple';
  for (const el of $$('details.adv-fold')) el.open = !simple;
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.mode = state.mode;
  root.dataset.theme = state.theme;
  root.dataset.accent = state.accent;
  root.dataset.density = state.density;
  applyFold();
  for (const chip of $$('#mode-picker .chip')) chip.classList.toggle('active', chip.dataset.modePick === state.mode);
  for (const chip of $$('#theme-picker .chip')) chip.classList.toggle('active', chip.dataset.themePick === state.theme);
  $('#accent-pick').value = state.accent;
  $('#density-pick').value = state.density;
  // Charts are drawn at a fixed width, so a density change needs no redraw; a
  // mode change may have collapsed a block the detail view is measured against.
  if (state.detail !== null && $('#detail').open) $('#detail-body').innerHTML = detailMarkup(state.detail);
}

// ---------------------------------------------------------------------------
// routing and the live tick
// ---------------------------------------------------------------------------

function showRoute(route) {
  state.route = route;
  $('#view-dashboard').hidden = route !== 'dashboard';
  $('#view-incidents').hidden = route !== 'incidents';
  for (const tab of $$('#tabs .tab')) tab.classList.toggle('active', tab.dataset.route === route);
  // The switcher only means anything on the dashboard, so it is only on screen
  // there — shown or hidden rather than merely transparent, because a control
  // that is invisible still takes focus and is still read out.
  $('#layout-switcher').hidden = route !== 'dashboard';
  if (route === 'incidents') renderIncidents();
}

/** The chip in the top bar: a dot and a word, and the state that goes with it. */
function syncLiveChip() {
  const chip = $('#live-chip');
  chip.dataset.live = state.live ? 'on' : 'off';
  chip.setAttribute('aria-pressed', String(state.live));
  chip.querySelector('.live-word').textContent = state.live ? 'Live' : 'Paused';
}

/**
 * One probe lands, so the demo moves. It stands still while a dialog is open:
 * redrawing the page under a reader's eyes is the kind of liveliness nobody
 * asked for. And it stands still entirely when Live is off.
 */
function tick() {
  if (!state.live) return;
  if (document.querySelector('dialog[open]')) return;
  const now = Date.now();
  for (const sensor of state.sensors) {
    if (!sensor.enabled || sensor.status === 'down') continue;
    sensor.spark.push(nextSample(sensor));
    sensor.spark.shift();
    sensor.lastMs = now;
    // A pending sensor whose next probe comes back clean is up again — the
    // retry that was still counting is what the state was waiting on.
    if (sensor.status === 'unknown') {
      sensor.status = 'up';
      sensor.message = '';
    }
  }
  for (const sensor of state.sensors) {
    sensor.latency = sensor.status === 'up' ? sensor.spark[sensor.spark.length - 1] : null;
  }
  renderDashboard();
  if (state.route === 'incidents') renderIncidents();
}

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

$('#tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-route]');
  if (tab) showRoute(tab.dataset.route);
});

// The box sits in the middle of the bar and searches everything — in the
// product through the server, here through what the page already holds. On the
// dashboard it narrows the cards; on the incidents tab it narrows the list.
$('#search').addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderDashboard();
  if (state.route === 'incidents') renderIncidents();
});

// Whether the event stream is up. The demo has no stream, so the chip is honest
// about what it can be: pressing it stops the tick, which is exactly what the
// product's "off" does — no traffic, no updates, and the page still holds what
// it last received.
$('#live-chip').addEventListener('click', () => {
  state.live = !state.live;
  store('wg-demo-live', state.live ? 'on' : 'off');
  syncLiveChip();
  toast(state.live
    ? 'Live updates on — the numbers move again.'
    : 'Live updates off. Nothing changes until you press it again or reload.');
});

$('#new-sensor').addEventListener('click', openSensorDialog);
$('#tour-start').addEventListener('click', startTour);

$('#mode-picker').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-mode-pick]');
  if (!chip) return;
  state.mode = chip.dataset.modePick;
  store('wg-demo-mode', state.mode);
  applyAppearance();
});

$('#theme-picker').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-theme-pick]');
  if (!chip) return;
  state.theme = chip.dataset.themePick;
  store('wg-demo-theme', state.theme);
  applyAppearance();
});

$('#accent-pick').addEventListener('change', (event) => {
  state.accent = event.target.value;
  store('wg-demo-accent', state.accent);
  applyAppearance();
});

$('#density-pick').addEventListener('change', (event) => {
  state.density = event.target.value;
  store('wg-demo-density', state.density);
  applyAppearance();
});

// A card is a link to its own history, and its action buttons are not.
$('#groups').addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]');
  const holder = event.target.closest('[data-id]');
  if (!holder) return;
  const sensor = sensorById(Number(holder.dataset.id));
  if (!sensor) return;

  if (!action) {
    openDetail(sensor.id);
    return;
  }
  event.stopPropagation();

  switch (action.dataset.action) {
    case 'ack':
      openAckDialog(openIncident(sensor.id)?.id);
      break;
    case 'unack':
      unacknowledge(openIncident(sensor.id)?.id);
      break;
    case 'toggle':
      sensor.enabled = !sensor.enabled;
      sensor.status = sensor.enabled ? 'up' : 'paused';
      sensor.spark = sensor.enabled ? buildSpark(sensor) : [];
      toast(sensor.enabled ? `${sensor.name} is being probed again.` : `${sensor.name} is paused. History is kept.`);
      renderDashboard();
      break;
    case 'probe':
      toast(`Probing ${sensor.name}… and it is fine. That is the only answer this demo can give.`);
      break;
    case 'edit':
      toast('In the real dashboard this opens the sensor form — the same one "New sensor" shows.');
      break;
    default:
      toast('Reordering works in the real dashboard; the demo keeps a fixed order.');
  }
});

$('#groups').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const holder = event.target.closest('[data-id]');
  if (holder) openDetail(Number(holder.dataset.id));
});

$('#detail-actions').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-range]');
  if (chip) {
    state.range = chip.dataset.range;
    for (const c of $$('#range-picker .chip')) c.classList.toggle('active', c === chip);
    $('#detail-body').innerHTML = detailMarkup(state.detail);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action || state.detail === null) return;
  const open = openIncident(state.detail);
  if (action.dataset.action === 'ack') openAckDialog(open?.id);
  else if (action.dataset.action === 'unack') unacknowledge(open?.id);
});

$('#incident-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) {
    // The buttons live inside a row that opens the sensor on click; without this
    // the acknowledgement would also open a dialog behind the request.
    event.stopPropagation();
    const id = Number(button.dataset.incident);
    if (button.dataset.action === 'ack') openAckDialog(id);
    else unacknowledge(id);
    return;
  }
  const row = event.target.closest('[data-id]');
  if (row) openDetail(Number(row.dataset.id));
});

// The four controls of the filter line. They combine, so none of them redraws
// the others — only the list, and the reset button's visibility.
$('#incident-status').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-state]');
  if (!chip) return;
  state.incidentFilter.status = chip.dataset.state;
  for (const button of $$('#incident-status .seg-btn')) {
    button.setAttribute('aria-pressed', String(button === chip));
  }
  renderIncidents();
});

$('#incident-sensor').addEventListener('change', (event) => {
  state.incidentFilter.sensor = Number(event.target.value);
  renderIncidents();
});

$('#incident-range').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-range]');
  if (!chip) return;
  state.incidentFilter.range = chip.dataset.range;
  $('#incident-reset').hidden = !incidentFilterActive();
  renderIncidents();
});

$('#incident-query').addEventListener('input', (event) => {
  state.incidentFilter.query = event.target.value.trim().toLowerCase();
  renderIncidents();
});

// One press puts the whole list back — including the top bar's search box,
// which narrows this list too and would otherwise look like the reset failed.
$('#incident-reset').addEventListener('click', () => {
  state.incidentFilter = { status: '', sensor: 0, range: 'all', query: '' };
  state.query = '';
  $('#search').value = '';
  buildIncidentFilter();
  renderIncidents();
});

$('#modal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.mode === 'ack') {
    acknowledge(Number(form.dataset.id), new FormData(form).get('note'));
  } else {
    const name = String(new FormData(form).get('name') || '').trim();
    const target = String(new FormData(form).get('target') || '').trim();
    if (!name || !target) {
      toast('A sensor needs a name and a target. Every field has a "?" beside it.');
      return;
    }
    // It is added to the list for real, as "Pending": no probe has happened yet,
    // which is exactly what the product calls a sensor it has not heard back
    // from. Adding it to a server would need a server.
    state.sensors.push({
      id: Math.max(0, ...state.sensors.map((s) => s.id)) + 1,
      name, target,
      type: String(new FormData(form).get('type') || 'http'),
      group: String(new FormData(form).get('group') || '').trim() || 'Ungrouped',
      status: 'unknown', enabled: true, tags: [],
      base: 20, spread: 6, uptime: [null, null, null], downFrom: null,
      spark: [], avg: null, lastMs: Date.now(),
      message: 'No probe yet — the first one runs within a minute.',
    });
    toast(`${name} added. It shows as Pending until the first probe answers.`);
    renderDashboard();
  }
  $('#modal').close();
});

// Every dialog is dismissed the same way: a button, or a click on the backdrop.
for (const dialog of $$('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
    else if (event.target === dialog) dialog.close();
  });
}

// ---------------------------------------------------------------------------
// the layout switcher and the account menu
// ---------------------------------------------------------------------------

// The three views a page with no server can honestly show. The wall wants the
// outcome of every recent check as its own run of booleans, and the map wants a
// tile server to draw behind its markers; inventing either here would be a
// picture of a feature rather than the feature.
const LAYOUTS = [
  { value: 'grid', label: 'Cards' },
  { value: 'list', label: 'List' },
  { value: 'tree', label: 'Tree' },
];

const LAYOUT_ICONS = {
  grid: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>',
  list: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="2.5" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="11.5" width="14" height="2" rx="1"/></svg>',
  tree: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 3.5h4M2 8h7M2 12.5h7M8 3.5v9" stroke-linecap="round"/></svg>',
};

function buildLayoutSwitcher() {
  const host = $('#layout-switcher');
  host.innerHTML = LAYOUTS.map(({ value, label }) => `
    <button class="seg-btn" type="button" data-layout="${value}" title="${label}" aria-label="${label}">
      ${LAYOUT_ICONS[value]}<span>${label}</span>
    </button>`).join('');
  host.addEventListener('click', (event) => {
    const button = event.target.closest('[data-layout]');
    if (!button) return;
    state.layout = button.dataset.layout;
    store('wg-demo-layout', state.layout);
    syncLayoutSwitcher();
    renderDashboard();
  });
}

function syncLayoutSwitcher() {
  for (const button of $$('[data-layout]')) {
    button.setAttribute('aria-pressed', button.dataset.layout === state.layout ? 'true' : 'false');
  }
}

let menu = null;

/**
 * The account menu, built on open rather than kept in memory.
 *
 * It is the product's menu with the product's class names, and it is placed the
 * same way: under the chip, right-aligned, pulled back on screen whatever the
 * width. The quick switches set the demo's theme and density, which is what they
 * set in a real installation — only there the choice is written to an account
 * instead of to localStorage.
 */
function openMenu() {
  const host = $('#user-menu-toggle');
  menu = document.createElement('div');
  menu.className = 'user-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="user-menu-head">
      <div class="user-menu-name">jane</div>
      <div class="user-menu-role">Administrator</div>
    </div>
    <label class="user-menu-field"><span>Theme</span>
      <select data-setting="theme" aria-label="Theme">
        ${['auto', 'dark', 'light'].map((v) => `<option value="${v}"${v === state.theme ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
      </select></label>
    <label class="user-menu-field"><span>Density</span>
      <select data-setting="density" aria-label="Density">
        ${['comfortable', 'compact'].map((v) => `<option value="${v}"${v === state.density ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
      </select></label>
    <div class="user-menu-sep"></div>
    <button class="user-menu-item" type="button" data-menu="settings" role="menuitem">Settings</button>
    <button class="user-menu-item is-danger" type="button" data-menu="signout" role="menuitem">Sign out</button>`;
  menu.addEventListener('change', (event) => {
    const select = event.target.closest('[data-setting]');
    if (!select) return;
    state[select.dataset.setting] = select.value;
    store(`wg-demo-${select.dataset.setting}`, select.value);
    applyAppearance();
  });
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu]');
    if (!button) return;
    closeMenu();
    // Both items exist in the product and neither has anything to do here: there
    // is no settings page behind this one and no session to end. Saying so is
    // better than a button that looks broken.
    toast(button.dataset.menu === 'settings'
      ? 'The settings page is in the real dashboard — this demo has only the dashboard and the incidents.'
      : 'There is nobody signed in here to sign out: the demo runs in your browser and stores nothing.');
  });

  document.body.append(menu);
  placeMenu(menu, host);
  host.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
}

/** Under the chip, right-aligned, and on screen whatever the width. */
function placeMenu(el, host) {
  const margin = 8;
  const at = host.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let left = at.right - box.width;
  if (left + box.width > window.innerWidth - margin) left = window.innerWidth - margin - box.width;
  if (left < margin) left = margin;
  let top = at.bottom + 8;
  if (top + box.height > window.innerHeight - margin) top = Math.max(margin, at.top - 8 - box.height);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  $('#user-menu-toggle').setAttribute('aria-expanded', 'false');
}

$('#user-menu-toggle').addEventListener('click', () => (menu ? closeMenu() : openMenu()));
document.addEventListener('click', (event) => {
  if (!menu) return;
  if (event.target.closest('.user-menu') || event.target.closest('#user-menu-toggle')) return;
  closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu) closeMenu();
});
// The menu is placed in window coordinates, so a resize leaves it pointing at
// where the chip used to be. Closing is the honest answer: it cannot follow.
window.addEventListener('resize', closeMenu);

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

initHelp();

state.mode = store('wg-demo-mode') || 'advanced';
state.theme = store('wg-demo-theme') || 'auto';
state.accent = store('wg-demo-accent') || 'azure';
state.density = store('wg-demo-density') || 'comfortable';
state.layout = store('wg-demo-layout') || 'grid';
state.live = store('wg-demo-live') !== 'off';

buildLayoutSwitcher();
syncLayoutSwitcher();
buildIncidentFilter();
syncLiveChip();

for (const sensor of state.sensors) {
  sensor.latency = sensor.status === 'up' ? sensor.spark[sensor.spark.length - 1] : null;
}

applyAppearance();
renderDashboard();
showRoute('dashboard');

// The first visit gets the tour; afterwards it is a button. The flag lives in
// localStorage rather than on a server, because there is no server.
if (!store('wg-demo-tour')) {
  store('wg-demo-tour', '1');
  window.setTimeout(startTour, 700);
}

window.setInterval(tick, 8000);
window.addEventListener('resize', () => {
  if (state.detail !== null && $('#detail').open) $('#detail-body').innerHTML = detailMarkup(state.detail);
});
