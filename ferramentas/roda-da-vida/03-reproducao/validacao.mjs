import { createHash } from 'node:crypto';
function normalizeWhatsapp(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^\+?[0-9 ()-]+$/.test(value.trim())) return '';
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : '';
  return /^[1-9]\d{9,10}$/.test(digits) ? '+55' + digits : '';
}

const SOURCE_KEYS = ['origem', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

// Origem do acesso (link do vídeo, descrição, WhatsApp...). Opcional e tolerante:
// valores inválidos são descartados em vez de bloquear o envio da avaliação.
export function normalizeSource(input) {
  const source = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return source;
  for (const key of SOURCE_KEYS) {
    const value = typeof input[key] === 'string' ? input[key].trim().toLowerCase() : '';
    if (value && value.length <= 80 && /^[\p{L}\p{N} ._:/+-]+$/u.test(value)) source[key] = value;
  }
  return source;
}

export function sourceLabel(source) {
  if (!source) return '';
  return source.origem || [source.utm_source, source.utm_campaign, source.utm_content].filter(Boolean).join(' · ');
}

export function validateSubmission(input) {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) throw new Error('Identificador inválido.');
  if (input.sharingConfirmed !== true) throw new Error('Confirme o envio das respostas.');
  const data = input.data;
  if (!data || data.instrument !== 'genoma-roda-da-vida-profissional' || data.questionSet !== 'rvp-70-v1') throw new Error('Exercício inválido.');
  if (!Array.isArray(data.answers) || data.answers.length !== 70 || Array.from(data.answers).some(n => !Number.isInteger(n) || n < 1 || n > 10)) throw new Error('Preencha as 70 respostas com notas de 1 a 10.');
  const profile = {};
  for (const key of ['name', 'company', 'role']) {
    const value = data.profile?.[key];
    if (typeof value !== 'string' || value.length > 160 || /[\r\n\0]/.test(value)) throw new Error('Identificação inválida.');
    profile[key] = value.trim();
  }
  if (!profile.name) throw new Error('Informe seu nome para enviar a avaliação.');
  profile.whatsapp = normalizeWhatsapp(data.profile?.whatsapp);
  if (!profile.whatsapp) throw new Error('Informe um WhatsApp com DDD ou código do país.');
  const date = data.profile?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Data inválida.');
  profile.date = date;
  if (!Array.isArray(data.notes) || data.notes.length !== 14 || Array.from(data.notes).some(n => typeof n !== 'string' || n.length > 2000)) throw new Error('Observações inválidas.');
  const payload = { instrument:data.instrument, questionSet:data.questionSet, profile, consentVersion:'rvp-sharing-1', answers:[...data.answers], notes:[...data.notes] };
  const averages = Array.from({length:14}, (_, i) => payload.answers.slice(i*5,i*5+5).reduce((s,n)=>s+n,0)/5);
  // A origem fica fora do hash: reenviar as mesmas respostas por outro link não gera conflito.
  return { id:input.id.toLowerCase(), payload, averages, source:normalizeSource(input.source), hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
