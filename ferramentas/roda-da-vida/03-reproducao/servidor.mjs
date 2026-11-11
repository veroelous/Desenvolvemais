import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateSubmission, sourceLabel } from './validacao.mjs';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 3000);
const dataDir = env.DATA_DIR || './dados';
const publicPath = '/diagnostico/roda-da-vida';
const adminPath = '/admin/roda-da-vida';
const followUpPath = adminPath + '/acompanhamento';
const areas = JSON.parse(readFileSync(new URL('./questionario.json', import.meta.url), 'utf8'));

// Número do Manoel para o convite de conversa (só dígitos, com DDI). Vazio = convite oculto.
const contactWhatsapp = (env.CONTACT_WHATSAPP || '').replace(/\D/g, '');
const form = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8')
  .replace('<meta name="rvp-contact" content="">', `<meta name="rvp-contact" content="${/^[1-9]\d{9,14}$/.test(contactWhatsapp) ? contactWhatsapp : ''}">`);

const LEAD_STATUSES = [
  ['novo', 'Novo'], ['contatado', 'Contatado'], ['conversa', 'Conversa realizada'],
  ['cliente', 'Virou cliente'], ['sem-interesse', 'Sem interesse agora']
];
const statusName = Object.fromEntries(LEAD_STATUSES);

mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(dataDir, 'roda-da-vida.sqlite'));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY, hash TEXT NOT NULL, payload TEXT NOT NULL,
    averages TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notifications (
    assessment_id TEXT PRIMARY KEY REFERENCES assessments(id),
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, sent_at TEXT
  );
`);
// Migração aditiva: bancos criados pela versão anterior continuam válidos.
const columns = new Set(db.prepare('PRAGMA table_info(assessments)').all().map(c => c.name));
for (const [name, ddl] of [
  ['source', `TEXT NOT NULL DEFAULT '{}'`], ['source_label', `TEXT NOT NULL DEFAULT ''`],
  ['lead_status', `TEXT NOT NULL DEFAULT 'novo'`], ['lead_note', `TEXT NOT NULL DEFAULT ''`], ['lead_updated_at', 'TEXT']
]) if (!columns.has(name)) db.exec(`ALTER TABLE assessments ADD COLUMN ${name} ${ddl}`);

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hash = value => createHash('sha256').update(value).digest();
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const sqlDate = value => value ? new Date(value.replace(' ', 'T') + 'Z') : null;
const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';
const ADMIN_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

function reply(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(body);
}
const json = (res, status, data) => reply(res, status, JSON.stringify(data), 'application/json; charset=utf-8');
const adminPage = (res, status, body) => reply(res, status, body, 'text/html; charset=utf-8', { 'Content-Security-Policy': ADMIN_CSP });

function isAdmin(req) {
  const password = env.ADMIN_PASSWORD || '';
  if (password.length < 16) return false;
  const expected = Buffer.from((env.ADMIN_USER || 'admin') + ':' + password).toString('base64');
  return timingSafeEqual(hash(req.headers.authorization || ''), hash('Basic ' + expected));
}
const expectedOrigin = req => env.PUBLIC_ORIGIN || 'http://' + req.headers.host;
const clientIp = req => (env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

// Limite simples de envios por IP (memória do processo). Produção usa o limite persistente do APC.
const RATE_MAX = Number(env.RATE_LIMIT_MAX || 10);
const RATE_WINDOW = Number(env.RATE_LIMIT_WINDOW_MS || 600000);
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [key, list] of hits) if (now - list[list.length - 1] >= RATE_WINDOW) hits.delete(key);
  return recent.length > RATE_MAX;
}

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function layout(title, content) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Roda da Vida</title>
  <style>
  *{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui;color:#123c36;background:#f3f6f2}header{padding:18px 5vw;background:#123c36;color:#fff}main{max-width:1100px;margin:0 auto;padding:24px 16px}h1,h2,h3{line-height:1.2}a{color:#176856}section{background:#fff;border:1px solid #d8e4dc;border-radius:16px;padding:20px;margin:16px 0}
  input,select,textarea,button{font:inherit;padding:9px;border-radius:8px;border:1px solid #a5b9ac;max-width:100%}textarea{width:100%;min-height:90px}button,.btn{display:inline-block;background:#176856;color:#fff;cursor:pointer;text-decoration:none;padding:9px 14px;border-radius:8px;border:0}.btn.wa{background:#1f8f4e}.btn.ghost{background:#fff;color:#176856;border:1px solid #176856}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.tile{border:1px solid #d8e4dc;border-radius:12px;padding:14px;overflow-wrap:anywhere}.tile b{display:block;font-size:1.4rem}.low{background:#fff6e7;border-color:#d9b987}.bar{height:9px;background:#dce9e0;border-radius:8px;margin:9px 0}.bar span{display:block;background:#258166;height:100%;border-radius:8px}
  summary{cursor:pointer;font-weight:650;margin-top:10px}li{margin:6px 0}.note{white-space:pre-wrap}table{border-collapse:collapse;width:100%;min-width:640px}td,th{text-align:left;padding:10px;border-bottom:1px solid #dde6e0}.table{overflow:auto}
  .chart{display:block;width:min(100%,720px);margin:auto}a.tile{text-decoration:none;color:inherit}a.tile:hover{border-color:#258166}.muted{color:#48645a}.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.filters label{display:grid;gap:4px;font-size:.9rem}
  .pill{display:inline-block;padding:2px 10px;border-radius:99px;font-size:.85rem;background:#e7efe9}.pill.novo{background:#fff1d6}.pill.cliente{background:#cdebd9}.pill.sem-interesse{background:#eee}
  .actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.ok{background:#e3f3ea;border-color:#9fd0b3}
  </style><header><strong>Desenvolvimento Profissional</strong> · Roda da Vida</header><main><h1>${esc(title)}</h1>${content}</main></html>`;
}

function radar(scores) {
  const cx = 360, cy = 215, r = 13.5;
  const point = (value, i) => {
    const angle = (i / scores.length) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(angle) * value * r, cy + Math.sin(angle) * value * r];
  };
  const pts = list => list.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const rings = [2, 4, 6, 8, 10].map(n => `<polygon points="${pts(scores.map((_, i) => point(n, i)))}" fill="none" stroke="#c2d3c7"/>`).join('');
  const labels = scores.map((score, i) => {
    const [x, y] = point(11.3, i);
    const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" fill="#123c36">${i + 1}. ${esc(areas[i].short)} <tspan font-weight="700">${fmt(score)}</tspan></text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 720 430" role="img" aria-label="Gráfico radar com as médias das 14 áreas"><title>Médias das 14 áreas</title>${rings}<polygon points="${pts(scores.map(point))}" fill="#55ad8a" fill-opacity=".45" stroke="#176856" stroke-width="2"/>${labels}</svg>`;
}

function whatsappLink(profile, id) {
  const digits = String(profile.whatsapp || '').replace(/\D/g, '');
  if (!digits) return '';
  const name = firstName(profile.name);
  const text = `Olá${name ? ', ' + name : ''}! Aqui é o Manoel Gonçalves. Recebi a sua Roda da Vida (protocolo ${id.slice(0, 8)}). Obrigado pela confiança. Se fizer sentido para você, podemos conversar alguns minutos sobre o que apareceu e por onde começar?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function report(row, saved) {
  const data = JSON.parse(row.payload);
  const scores = JSON.parse(row.averages);
  const general = scores.reduce((sum, n) => sum + n, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const ranked = areas.map((area, i) => ({ area, i, mean: scores[i] })).sort((a, b) => a.mean - b.mean || a.i - b.i);
  const lowest = ranked.filter(r => r.mean === min).map(r => r.area.name);
  const notesCount = data.notes.filter(n => n.trim()).length;
  const wa = whatsappLink(data.profile, row.id);
  const updated = sqlDate(row.lead_updated_at);
  return layout('Resultado da avaliação', `<a href="${adminPath}">← Todas as avaliações</a>
    <section><h2>${esc(data.profile.name)}</h2><p>${esc(data.profile.company || 'Empresa não informada')} · ${esc(data.profile.role || 'Função não informada')}</p>
    <p>WhatsApp ${esc(data.profile.whatsapp || 'Não informado')} · Avaliação em ${esc(data.profile.date)} · Origem: ${esc(row.source_label || 'acesso direto')}</p>
    <p class="muted">Protocolo ${esc(row.id)} · Recebida em ${esc(dateFmt.format(sqlDate(row.created_at)))} · ${row.sent_at ? 'Aviso enviado' : 'Aviso pendente'}</p>
    ${wa ? `<p class="actions"><a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Chamar no WhatsApp ↗</a><span class="muted">Abre uma mensagem de convite editável, sem notas.</span></p>` : ''}</section>
    <section class="${saved ? 'ok' : ''}"><h2>Acompanhamento</h2>${saved ? '<p><strong>Acompanhamento salvo.</strong></p>' : ''}
    <form method="post" action="${followUpPath}"><input type="hidden" name="id" value="${esc(row.id)}">
    <p class="filters"><label>Situação <select name="status">${LEAD_STATUSES.map(([v, l]) => `<option value="${v}"${row.lead_status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></p>
    <label>Anotação interna (não aparece para o respondente)<textarea name="note" maxlength="2000">${esc(row.lead_note)}</textarea></label>
    <p class="actions"><button>Salvar acompanhamento</button>${updated ? `<span class="muted">Atualizado em ${esc(dateFmt.format(updated))}</span>` : ''}</p></form></section>
    <section><h2>Resumo da avaliação</h2><div class="grid">
    <div class="tile">Média geral<b>${fmt(general)} / 10</b></div><div class="tile">Menor média<b>${fmt(min)} / 10</b></div><div class="tile">Maior média<b>${fmt(max)} / 10</b></div><div class="tile">Diferença entre extremos<b>${fmt(max - min)} pontos</b></div>
    </div>${radar(scores)}
    <p><strong>Para abrir a conversa:</strong> ${max === min ? 'todas as áreas tiveram a mesma média; pergunte qual delas a pessoa sente que merece atenção agora.' : `a menor média ficou em ${esc(lowest.join(', '))}. Pergunte o que a pessoa percebe nessa área antes de comentar o número.`} ${notesCount ? `Há ${notesCount} ${notesCount === 1 ? 'observação escrita' : 'observações escritas'} — leia antes do contato.` : 'Não há observações escritas.'}</p>
    <p class="muted">Os números são uma autopercepção para orientar a conversa, não um diagnóstico nem critério de seleção.</p></section>
    <section><h2>Pontuação por área</h2><p>Da menor para a maior pontuação. Total de 5 a 50 e média de 1 a 10.</p><div class="grid">
    ${ranked.map(({ area, i, mean }) => `<article class="tile${max > min && mean === min ? ' low' : ''}">
    <h3>${i + 1}. ${esc(area.name)}</h3><b>${Math.round(mean * 5)} / 50</b>
    <div class="bar" aria-hidden="true"><span style="width:${mean * 10}%"></span></div><p>Média ${fmt(mean)} / 10${data.notes[i]?.trim() ? ' · tem observação' : ''}</p>
    <details><summary>Ver notas por afirmação</summary><ol>${area.questions.map((q, j) => `<li>${esc(q)} <strong>${esc(data.answers[i * 5 + j])} / 10</strong></li>`).join('')}</ol>
    ${data.notes[i] ? `<p class="note"><strong>Observação</strong><br>${esc(data.notes[i])}</p>` : ''}</details></article>`).join('')}
    </div></section>`);
}

function filters(url) {
  const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const status = statusName[url.searchParams.get('situacao')] ? url.searchParams.get('situacao') : '';
  const source = (url.searchParams.get('origem') || '').slice(0, 200);
  const where = `(? = '' OR instr(lower(json_extract(a.payload, '$.profile.name') || ' ' || json_extract(a.payload, '$.profile.company') || ' ' || json_extract(a.payload, '$.profile.whatsapp')), lower(?)) > 0)
    AND (? = '' OR a.lead_status = ?) AND (? = '' OR a.source_label = (CASE ? WHEN '(direto)' THEN '' ELSE ? END))`;
  return { query, status, source, where, params: [query, query, status, status, source, source, source] };
}

function list(url) {
  const f = filters(url);
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const rows = db.prepare(`
    SELECT a.id, a.payload, a.averages, a.created_at, a.source_label, a.lead_status, n.sent_at FROM assessments a JOIN notifications n ON n.assessment_id = a.id
    WHERE ${f.where} ORDER BY a.created_at DESC, a.id DESC LIMIT 26 OFFSET ?
  `).all(...f.params, (page - 1) * 25);
  const counts = Object.fromEntries(db.prepare('SELECT lead_status AS s, count(*) AS n FROM assessments GROUP BY lead_status').all().map(r => [r.s, r.n]));
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const last30 = db.prepare(`SELECT count(*) AS n FROM assessments WHERE created_at >= datetime('now', '-30 days')`).get().n;
  const sources = db.prepare('SELECT source_label AS s, count(*) AS n FROM assessments GROUP BY source_label ORDER BY n DESC, s').all();
  const params = extra => '?' + new URLSearchParams({ ...(f.query && { q: f.query }), ...(f.status && { situacao: f.status }), ...(f.source && { origem: f.source }), ...extra });
  return layout('Avaliações recebidas', `<p class="actions"><a href="${publicPath}?nova=1">Abrir nova avaliação ↗</a> <a class="btn ghost" href="${esc(adminPath + params({ formato: 'csv' }))}">Exportar CSV (filtro atual)</a></p>
    <section><h2>Funil</h2><div class="grid">
    <div class="tile">Avaliações recebidas<b>${total}</b><span class="muted">${last30} nos últimos 30 dias</span></div>
    ${LEAD_STATUSES.map(([v, l]) => `<a class="tile" href="${adminPath}?situacao=${v}">${l}<b>${counts[v] || 0}</b></a>`).join('')}
    </div>${sources.length ? `<p class="muted">Por origem: ${sources.map(s => `${esc(s.s || 'acesso direto')} (${s.n})`).join(' · ')}</p>` : ''}</section>
    <section><form method="get" class="filters"><label>Nome, empresa ou WhatsApp <input type="search" name="q" maxlength="120" value="${esc(f.query)}"></label>
    <label>Situação <select name="situacao"><option value="">Todas</option>${LEAD_STATUSES.map(([v, l]) => `<option value="${v}"${f.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Origem <select name="origem"><option value="">Todas</option>${sources.map(s => { const v = s.s || '(direto)'; return `<option value="${esc(v)}"${f.source === v ? ' selected' : ''}>${esc(s.s || 'acesso direto')}</option>`; }).join('')}</select></label>
    <button>Filtrar</button> <a href="${adminPath}">Limpar</a></form></section>
    <section class="table"><table><thead><tr><th>Respondente</th><th>Empresa</th><th>Origem</th><th>Recebida em</th><th>Média</th><th>Situação</th><th>Resultado</th></tr></thead>
    <tbody>${rows.slice(0, 25).map(row => {
      const { profile } = JSON.parse(row.payload);
      const scores = JSON.parse(row.averages);
      return `<tr><td>${esc(profile.name)}</td><td>${esc(profile.company || '—')}</td><td>${esc(row.source_label || '—')}</td><td>${esc(dateFmt.format(sqlDate(row.created_at)))}</td><td>${fmt(scores.reduce((s, n) => s + n, 0) / 14)}</td><td><span class="pill ${esc(row.lead_status)}">${esc(statusName[row.lead_status] || row.lead_status)}</span></td><td><a href="${adminPath}?id=${encodeURIComponent(row.id)}">Ver resultado</a></td></tr>`;
    }).join('') || '<tr><td colspan="7">Nenhuma avaliação encontrada.</td></tr>'}</tbody></table>
    <p>${page > 1 ? `<a href="${esc(adminPath + params({ page: String(page - 1) }))}">Anterior</a> · ` : ''}Página ${page}${rows.length > 25 ? ` · <a href="${esc(adminPath + params({ page: String(page + 1) }))}">Próxima</a>` : ''}</p></section>`);
}

function csvCell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportCsv(url) {
  const f = filters(url);
  const rows = db.prepare(`SELECT a.* FROM assessments a WHERE ${f.where} ORDER BY a.created_at DESC, a.id DESC`).all(...f.params);
  const header = ['Protocolo', 'Recebida em', 'Nome', 'WhatsApp', 'Empresa', 'Função', 'Data da avaliação', 'Origem', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
    'Média geral', 'Menor média', 'Áreas com menor média', 'Situação', 'Anotação interna', ...areas.map(a => a.name)];
  const lines = rows.map(row => {
    const { profile } = JSON.parse(row.payload);
    const scores = JSON.parse(row.averages);
    const source = JSON.parse(row.source || '{}');
    const min = Math.min(...scores);
    return [row.id, dateFmt.format(sqlDate(row.created_at)), profile.name, profile.whatsapp, profile.company, profile.role, profile.date, row.source_label,
      source.utm_source, source.utm_medium, source.utm_campaign, source.utm_content,
      fmt(scores.reduce((s, n) => s + n, 0) / 14), fmt(min), areas.filter((_, i) => scores[i] === min).map(a => a.name).join(', '),
      statusName[row.lead_status] || row.lead_status, row.lead_note, ...scores.map(fmt)];
  });
  return '﻿' + [header, ...lines].map(r => r.map(csvCell).join(';')).join('\r\n');
}

async function saveFollowUp(req, res) {
  if (req.headers.origin !== expectedOrigin(req)) return reply(res, 403, 'Origem inválida.', 'text/plain; charset=utf-8');
  const body = await readBody(req, 8192);
  if (body === null) return reply(res, 413, 'Envio acima do limite.', 'text/plain; charset=utf-8');
  const fields = new URLSearchParams(body);
  const id = fields.get('id') || '';
  const status = fields.get('status') || '';
  const note = (fields.get('note') || '').replace(/\r\n/g, '\n');
  if (!statusName[status] || note.length > 2000) return reply(res, 400, 'Dados de acompanhamento inválidos.', 'text/plain; charset=utf-8');
  const result = db.prepare(`UPDATE assessments SET lead_status=?, lead_note=?, lead_updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, note, id);
  if (!result.changes) return reply(res, 404, 'Avaliação não encontrada.', 'text/plain; charset=utf-8');
  reply(res, 303, '', 'text/plain; charset=utf-8', { Location: `${adminPath}?id=${encodeURIComponent(id)}&salvo=1` });
}

let mailer;
if (env.SMTP_HOST && env.SMTP_FROM && env.NOTIFY_TO) {
  const { default: nodemailer } = await import('nodemailer');
  const smtpPort = Number(env.SMTP_PORT || 465);
  mailer = nodemailer.createTransport({
    host: env.SMTP_HOST, port: smtpPort, secure: smtpPort === 465,
    requireTLS: smtpPort !== 465, connectionTimeout: 10000, socketTimeout: 20000,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {})
  });
}

// Aviso sem notas nem observações: só o necessário para o Manoel agir.
function notificationText(row, publicOrigin = env.PUBLIC_ORIGIN) {
  const { profile } = JSON.parse(row.payload);
  return [
    `Respondente: ${profile.name}`, `WhatsApp: ${profile.whatsapp || 'Não informado'}`,
    `Empresa: ${profile.company || 'Não informada'}`, `Função: ${profile.role || 'Não informada'}`,
    `Data: ${profile.date}`, `Origem: ${row.source_label || 'acesso direto'}`, `Protocolo: ${row.id}`,
    ...(publicOrigin ? ['', `Ver resultado: ${publicOrigin}${adminPath}?id=${row.id}`] : [])
  ].join('\n');
}

let sending = false;
async function notify() {
  if (!mailer || sending) return;
  sending = true;
  try {
    const pending = db.prepare(`
      SELECT n.assessment_id AS id, a.payload, a.source_label FROM notifications n JOIN assessments a ON a.id = n.assessment_id
      WHERE n.sent_at IS NULL AND n.next_attempt <= ? ORDER BY n.next_attempt, a.created_at LIMIT 10
    `).all(Date.now());
    for (const row of pending) {
      db.prepare('UPDATE notifications SET attempts=attempts+1, next_attempt=? WHERE assessment_id=?').run(Date.now() + 300000, row.id);
      try {
        const { profile } = JSON.parse(row.payload);
        await mailer.sendMail({ from: env.SMTP_FROM, to: env.NOTIFY_TO, subject: `Roda da Vida concluída — ${profile.name}`, text: notificationText(row) });
        db.prepare('UPDATE notifications SET sent_at=CURRENT_TIMESTAMP WHERE assessment_id=?').run(row.id);
      } catch {
        console.error('Aviso pendente para o protocolo', row.id);
      }
    }
  } finally {
    sending = false;
  }
}
const runNotifications = () => void notify().catch(() => console.error('Falha ao consultar a fila.'));

async function submit(req, res) {
  if (req.headers.origin !== expectedOrigin(req)) return json(res, 403, { error: 'Origem inválida.' });
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Envie JSON.' });
  if (rateLimited(clientIp(req))) return json(res, 429, { error: 'Muitos envios em sequência. Aguarde alguns minutos.' });
  const body = await readBody(req, 65536);
  if (body === null) return json(res, 413, { error: 'Envio acima do limite.' });
  let record;
  try {
    record = validateSubmission(JSON.parse(body));
  } catch (error) {
    return json(res, 400, { error: error instanceof SyntaxError ? 'JSON inválido.' : error.message });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT hash FROM assessments WHERE id=?').get(record.id);
    if (existing && existing.hash !== record.hash) {
      db.exec('ROLLBACK');
      return json(res, 409, { error: 'Protocolo já usado para outros dados.' });
    }
    if (!existing) {
      db.prepare('INSERT INTO assessments (id,hash,payload,averages,source,source_label) VALUES (?,?,?,?,?,?)')
        .run(record.id, record.hash, JSON.stringify(record.payload), JSON.stringify(record.averages), JSON.stringify(record.source), sourceLabel(record.source));
      db.prepare('INSERT INTO notifications (assessment_id) VALUES (?)').run(record.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  json(res, 200, { saved: true, id: record.id });
  runNotifications();
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === publicPath)) return reply(res, 200, form);
    if (req.method === 'POST' && url.pathname === publicPath + '/envio') return await submit(req, res);
    if (url.pathname === adminPath || url.pathname === followUpPath) {
      if (!isAdmin(req)) return reply(res, 401, 'Autenticação administrativa exigida.', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Roda da Vida", charset="UTF-8"' });
      if (req.method === 'POST' && url.pathname === followUpPath) return await saveFollowUp(req, res);
      if (req.method === 'GET' && url.pathname === adminPath) {
        if (url.searchParams.get('formato') === 'csv') {
          return reply(res, 200, exportCsv(url), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="roda-da-vida-avaliacoes-${new Date().toISOString().slice(0, 10)}.csv"` });
        }
        const id = url.searchParams.get('id');
        if (!id) return adminPage(res, 200, list(url));
        const row = db.prepare('SELECT a.*, n.sent_at FROM assessments a JOIN notifications n ON n.assessment_id = a.id WHERE a.id=?').get(id);
        return row ? adminPage(res, 200, report(row, url.searchParams.get('salvo') === '1')) : adminPage(res, 404, layout('Avaliação não encontrada', `<a href="${adminPath}">Voltar</a>`));
      }
    }
    reply(res, 404, 'Página não encontrada.', 'text/plain; charset=utf-8');
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'Não foi possível concluir a operação.' });
    else res.end();
  }
}).listen(port, host, () => console.log(`Roda da Vida disponível em http://${host}:${port}`));
setInterval(runNotifications, 60000).unref();
runNotifications();
