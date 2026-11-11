// Testes de ponta a ponta da edição local: sobe o servidor com banco temporário e exercita o HTTP.
// Execução: npm test (Node.js 22.13+). Não usa dados reais nem SMTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSubmission, normalizeSource, sourceLabel } from '../validacao.mjs';

const root = new URL('..', import.meta.url);
const example = JSON.parse(readFileSync(new URL('../../04-exemplos/avaliacao-ficticia.json', import.meta.url), 'utf8'));
const port = 3400 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const password = 'senha-de-teste-1234567';
const auth = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
let server, dir;

const payload = (overrides = {}) => ({
  id: randomUUID(), sharingConfirmed: true,
  data: { instrument: example.instrument, questionSet: example.questionSet, profile: { ...example.profile }, answers: [...example.answers], notes: [...example.notes] },
  ...overrides
});
const send = (body, headers = {}) => fetch(base + '/diagnostico/roda-da-vida/envio', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body)
});
const admin = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init, headers: { Authorization: auth, ...init.headers } });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rvp-'));
  server = spawn(process.execPath, ['servidor.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_PASSWORD: password, CONTACT_WHATSAPP: '+55 11 90000-0000', RATE_LIMIT_MAX: '8', SMTP_HOST: '' }
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', d => String(d).includes('disponível') && resolve());
    server.on('exit', code => reject(new Error('servidor saiu com código ' + code)));
  });
});
after(() => { server?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('validação: médias calculadas no servidor e origem fora do hash', () => {
  const a = validateSubmission(payload({ id: '11111111-1111-4111-8111-111111111111', source: { utm_source: 'YouTube' } }));
  const b = validateSubmission(payload({ id: '11111111-1111-4111-8111-111111111111' }));
  assert.equal(a.averages.length, 14);
  assert.deepEqual(a.averages, example.results.areaAverages.map(r => r.average));
  assert.equal(a.hash, b.hash);
  assert.equal(a.payload.profile.whatsapp, '+12025550100');
});

test('validação: origem tolerante a lixo', () => {
  assert.deepEqual(normalizeSource({ utm_source: 'YouTube', utm_campaign: 'armas-da-persuasão', origem: '<script>', x: 'y' }), { utm_source: 'youtube', utm_campaign: 'armas-da-persuasão' });
  assert.deepEqual(normalizeSource('nada'), {});
  assert.equal(sourceLabel({ utm_source: 'youtube', utm_campaign: 'cialdini' }), 'youtube · cialdini');
  assert.equal(sourceLabel({ origem: 'instagram', utm_source: 'x' }), 'instagram');
});

test('validação: rejeita 69 respostas, nota 11 e WhatsApp inválido', () => {
  assert.throws(() => validateSubmission(payload({ data: { ...payload().data, answers: example.answers.slice(1) } })), /70 respostas/);
  assert.throws(() => validateSubmission(payload({ data: { ...payload().data, answers: [11, ...example.answers.slice(1)] } })), /70 respostas/);
  assert.throws(() => validateSubmission(payload({ data: { ...payload().data, profile: { ...example.profile, whatsapp: '123' } } })), /WhatsApp/);
});

test('página pública injeta o contato e não exige login', async () => {
  const html = await (await fetch(base + '/diagnostico/roda-da-vida?nova=1')).text();
  assert.match(html, /<meta name="rvp-contact" content="5511900000000">/);
  assert.match(html, /COMEÇAR MINHA AVALIAÇÃO/);
});

test('envio: origem, consentimento, idempotência e conflito', async () => {
  assert.equal((await send(payload(), { Origin: 'https://outro.site' })).status, 403);
  assert.equal((await send(payload({ sharingConfirmed: false }))).status, 400);
  const body = payload({ source: { utm_source: 'youtube', utm_campaign: 'cialdini' } });
  const first = await send(body);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { saved: true, id: body.id });
  assert.equal((await send(body)).status, 200, 'reenvio idêntico reutiliza o protocolo');
  const changed = structuredClone(body);
  changed.data.answers[0] = changed.data.answers[0] === 10 ? 9 : 10;
  assert.equal((await send(changed)).status, 409);
});

test('painel: exige autenticação e mostra funil, origem e filtro', async () => {
  assert.equal((await fetch(base + '/admin/roda-da-vida')).status, 401);
  const res = await admin('/admin/roda-da-vida');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await res.text();
  assert.match(html, /Funil/);
  assert.match(html, /youtube · cialdini/);
  const filtered = await (await admin('/admin/roda-da-vida?origem=' + encodeURIComponent('youtube · cialdini'))).text();
  assert.match(filtered, /Avaliação de demonstração/);
  const none = await (await admin('/admin/roda-da-vida?situacao=cliente')).text();
  assert.match(none, /Nenhuma avaliação encontrada/);
});

test('relatório: WhatsApp sem notas, 70 notas e acompanhamento', async () => {
  const body = payload();
  await send(body);
  const html = await (await admin('/admin/roda-da-vida?id=' + body.id)).text();
  const wa = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.ok(wa.startsWith('https://wa.me/12025550100?text='));
  assert.doesNotMatch(decodeURIComponent(wa), /\/ 10|média/i, 'convite não expõe notas');
  assert.equal((html.match(/\d+ \/ 10<\/strong>/g) || []).length, 70);
  assert.match(html, /a menor média ficou em Prosperidade e Gestão Financeira, Espiritualidade e Vida Interior/);

  const form = new URLSearchParams({ id: body.id, status: 'contatado', note: 'Chamei em 11/11.' });
  const csrf = await admin('/admin/roda-da-vida/acompanhamento', { method: 'POST', body: form, headers: { Origin: 'https://outro.site', 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(csrf.status, 403, 'bloqueia POST de outra origem');
  const bad = await admin('/admin/roda-da-vida/acompanhamento', { method: 'POST', body: new URLSearchParams({ id: body.id, status: 'inventado' }), headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(bad.status, 400);
  const ok = await admin('/admin/roda-da-vida/acompanhamento', { method: 'POST', body: form, headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(ok.status, 303);
  const saved = await (await admin(ok.headers.get('location'))).text();
  assert.match(saved, /Acompanhamento salvo/);
  assert.match(saved, /<option value="contatado" selected>/);
  assert.match(saved, /Chamei em 11\/11\./);
});

test('CSV: cabeçalho, médias por área e proteção contra fórmulas', async () => {
  const body = payload();
  body.data.profile = { ...body.data.profile, name: '=HYPERLINK("x")' };
  await send(body);
  const res = await admin('/admin/roda-da-vida?formato=csv');
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const csv = Buffer.from(await res.arrayBuffer()).toString('utf8');
  assert.ok(csv.startsWith('\uFEFF"Protocolo"'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"Saúde Física"/);
});

test('limite de envios por IP', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await send(payload());
  assert.equal(last.status, 429);
});
