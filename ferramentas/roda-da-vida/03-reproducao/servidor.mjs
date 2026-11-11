import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateSubmission } from './validacao.mjs';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 3000);
const dataDir = env.DATA_DIR || './dados';
const publicPath = '/diagnostico/roda-da-vida';
const adminPath = '/admin/roda-da-vida';
const form = readFileSync(new URL('./public/index.html', import.meta.url));
const areas = JSON.parse(readFileSync(new URL('./questionario.json', import.meta.url), 'utf8'));
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

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hash = value => createHash('sha256').update(value).digest();
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function reply(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(body);
}

function json(res, status, data) {
  reply(res, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function isAdmin(req) {
  const password = env.ADMIN_PASSWORD || '';
  if (password.length < 16) return false;
  const expected = Buffer.from((env.ADMIN_USER || 'admin') + ':' + password).toString('base64');
  return timingSafeEqual(hash(req.headers.authorization || ''), hash('Basic ' + expected));
}

function layout(title, content) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | Roda da Vida</title>
  <style>
  *{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui;color:#123c36;background:#f3f6f2}header{padding:18px 5vw;background:#123c36;color:#fff}main{max-width:1100px;margin:0 auto;padding:24px}h1,h2,h3{line-height:1.2}a{color:#176856}section{background:#fff;border:1px solid #d8e4dc;border-radius:16px;padding:20px;margin:16px 0}input,button{font:inherit;padding:9px;border-radius:8px;border:1px solid #a5b9ac}button{background:#176856;color:#fff;cursor:pointer}.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.tile{border:1px solid #d8e4dc;border-radius:12px;padding:14px;overflow-wrap:anywhere}.tile b{display:block;font-size:1.4rem}.low{background:#fff6e7;border-color:#d9b987}.bar{height:9px;background:#dce9e0;border-radius:8px;margin:9px 0}.bar span{display:block;background:#258166;height:100%;border-radius:8px}summary{cursor:pointer;font-weight:650;margin-top:10px}li{margin:6px 0}.note{white-space:pre-wrap}table{border-collapse:collapse;width:100%;min-width:520px}td,th{text-align:left;padding:10px;border-bottom:1px solid #dde6e0}.table{overflow:auto}svg{display:block;width:min(100%,420px);margin:auto}.muted{color:#48645a}
  </style><header><strong>Desenvolvimento Profissional</strong></header><main><h1>${esc(title)}</h1>${content}</main></html>`;
}

function radar(scores) {
  const point = (value, i) => {
    const angle = (i / scores.length) * Math.PI * 2 - Math.PI / 2;
    return [150 + Math.cos(angle) * value * 11, 150 + Math.sin(angle) * value * 11].map(n => n.toFixed(2)).join(',');
  };
  const rings = [2, 4, 6, 8, 10].map(n => `<polygon points="${scores.map((_, i) => point(n, i)).join(' ')}" fill="none" stroke="#c2d3c7"/>`).join('');
  const labels = scores.map((_, i) => {
    const [x, y] = point(11.6, i).split(',');
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="11">${i + 1}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 300" role="img" aria-label="Gráfico radar com as médias das 14 áreas numeradas"><title>Médias das 14 áreas</title>${rings}<polygon points="${scores.map(point).join(' ')}" fill="#55ad8a" fill-opacity=".45" stroke="#176856" stroke-width="2"/>${labels}</svg>`;
}

function report(row) {
  const data = JSON.parse(row.payload);
  const scores = JSON.parse(row.averages);
  const general = scores.reduce((sum, n) => sum + n, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const ranked = areas.map((area, i) => ({ area, i, mean: scores[i] })).sort((a, b) => a.mean - b.mean || a.i - b.i);
  return layout('Resultado da avaliação', `<a href="${adminPath}">← Todas as avaliações</a>
    <section><h2>${esc(data.profile.name)}</h2><p>${esc(data.profile.company || 'Empresa não informada')} · ${esc(data.profile.role || 'Função não informada')}</p>
    <p>WhatsApp ${esc(data.profile.whatsapp || 'Não informado')} · Avaliação em ${esc(data.profile.date)}</p><p class="muted">Protocolo ${esc(row.id)} · ${row.sent_at ? 'Aviso enviado' : 'Aviso pendente'}</p></section>
    <section><h2>Resumo da avaliação</h2><div class="grid">
    <div class="tile">Média geral<b>${fmt(general)} / 10</b></div><div class="tile">Menor média<b>${fmt(min)} / 10</b></div><div class="tile">Maior média<b>${fmt(max)} / 10</b></div><div class="tile">Diferença entre extremos<b>${fmt(max - min)} pontos</b></div>
    </div>${radar(scores)}<p class="muted">Os números do gráfico correspondem às áreas abaixo. Explore as notas individuais para orientar a conversa de desenvolvimento.</p></section>
    <section><h2>Pontuação por área</h2><p>Da menor para a maior pontuação. Total de 5 a 50 e média de 1 a 10.</p><div class="grid">
    ${ranked.map(({ area, i, mean }) => `<article class="tile${max > min && mean === min ? ' low' : ''}">
    <h3>${i + 1}. ${esc(area.name)}</h3><b>${Math.round(mean * 5)} / 50</b>
    <div class="bar" aria-hidden="true"><span style="width:${mean * 10}%"></span></div><p>Média ${fmt(mean)} / 10</p>
    <details><summary>Ver notas por afirmação</summary><ol>${area.questions.map((q, j) => `<li>${esc(q)} <strong>${esc(data.answers[i * 5 + j])} / 10</strong></li>`).join('')}</ol>
    ${data.notes[i] ? `<p class="note"><strong>Observação</strong><br>${esc(data.notes[i])}</p>` : ''}</details></article>`).join('')}
    </div></section>`);
}

function list(url) {
  const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const rows = db.prepare(`
    SELECT a.id, a.payload, a.created_at, n.sent_at FROM assessments a JOIN notifications n ON n.assessment_id = a.id
    WHERE instr(lower(json_extract(a.payload, '$.profile.name') || ' ' || json_extract(a.payload, '$.profile.company')), lower(?)) > 0 OR ? = ''
    ORDER BY a.created_at DESC, a.id DESC LIMIT 26 OFFSET ?
  `).all(query, query, (page - 1) * 25);
  const pageLink = n => adminPath + '?' + new URLSearchParams({ q: query, page: String(n) });
  return layout('Avaliações recebidas', `<p><a href="${publicPath}?nova=1">Abrir nova avaliação ↗</a></p>
    <section><form method="get"><label>Nome ou empresa <input type="search" name="q" maxlength="120" value="${esc(query)}"></label> <button>Buscar</button></form></section>
    <section class="table"><table><thead><tr><th>Respondente</th><th>Empresa</th><th>Recebida em</th><th>Aviso</th><th>Resultado</th></tr></thead>
    <tbody>${rows.slice(0, 25).map(row => {
      const { profile } = JSON.parse(row.payload);
      return `<tr><td>${esc(profile.name)}</td><td>${esc(profile.company || '—')}</td><td>${esc(dateFmt.format(new Date(row.created_at.replace(' ', 'T') + 'Z')))}</td><td>${row.sent_at ? 'Enviado' : 'Pendente'}</td><td><a href="${adminPath}?id=${encodeURIComponent(row.id)}">Ver resultado</a></td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhuma avaliação encontrada.</td></tr>'}</tbody></table>
    <p>${page > 1 ? `<a href="${esc(pageLink(page - 1))}">Anterior</a> · ` : ''}Página ${page}${rows.length > 25 ? ` · <a href="${esc(pageLink(page + 1))}">Próxima</a>` : ''}</p></section>`);
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
let sending = false;
async function notify() {
  if (!mailer || sending) return;
  sending = true;
  try {
    const pending = db.prepare(`
      SELECT n.assessment_id AS id, a.payload FROM notifications n JOIN assessments a ON a.id = n.assessment_id
      WHERE n.sent_at IS NULL AND n.next_attempt <= ? LIMIT 10
    `).all(Date.now());
    for (const row of pending) {
      db.prepare('UPDATE notifications SET attempts=attempts+1, next_attempt=? WHERE assessment_id=?').run(Date.now() + 300000, row.id);
      try {
        const { profile } = JSON.parse(row.payload);
        await mailer.sendMail({
          from: env.SMTP_FROM, to: env.NOTIFY_TO, subject: 'Roda da Vida concluída',
          text: `Respondente: ${profile.name}\nEmpresa: ${profile.company || 'Não informada'}\nFunção: ${profile.role || 'Não informada'}\nData: ${profile.date}\nProtocolo: ${row.id}`
        });
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
setInterval(runNotifications, 60000).unref();

async function submit(req, res) {
  const origin = req.headers.origin;
  const expectedOrigin = env.PUBLIC_ORIGIN || 'http://' + req.headers.host;
  if (origin !== expectedOrigin) return json(res, 403, { error: 'Origem inválida.' });
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Envie JSON.' });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) {
      json(res, 413, { error: 'Envio acima do limite.' });
      return;
    }
    chunks.push(chunk);
  }
  let record;
  try {
    record = validateSubmission(JSON.parse(Buffer.concat(chunks).toString('utf8')));
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
      db.prepare('INSERT INTO assessments (id,hash,payload,averages) VALUES (?,?,?,?)')
        .run(record.id, record.hash, JSON.stringify(record.payload), JSON.stringify(record.averages));
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
    if (req.method === 'GET' && url.pathname === adminPath) {
      if (!isAdmin(req)) return reply(res, 401, 'Autenticação administrativa exigida.', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Roda da Vida"' });
      const id = url.searchParams.get('id');
      if (!id) return reply(res, 200, list(url));
      const row = db.prepare('SELECT a.*, n.sent_at FROM assessments a JOIN notifications n ON n.assessment_id = a.id WHERE a.id=?').get(id);
      return row ? reply(res, 200, report(row)) : reply(res, 404, layout('Avaliação não encontrada', `<a href="${adminPath}">Voltar</a>`));
    }
    reply(res, 404, 'Página não encontrada.', 'text/plain; charset=utf-8');
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'Não foi possível concluir a operação.' });
    else res.end();
  }
}).listen(port, host, () => console.log(`Roda da Vida disponível em http://${host}:${port}`));
runNotifications();
