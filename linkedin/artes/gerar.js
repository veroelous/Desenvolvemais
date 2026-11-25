// Gera as artes da série "Você escolheu?" (1080x1350) com Playwright.
const { chromium } = require('playwright');
const path = require('path');

const posts = [
  { n: 1, mec: 'Reciprocidade', l1: 'EU DEVIA', l2: 'OU EU', l3: 'QUERIA?', acc: '#22d3ee',
    pergunta: 'Se essa pessoa não tivesse feito nada por mim, eu ainda diria sim?' },
  { n: 2, mec: 'Compromisso e coerência', l1: 'EU', l2: 'ACEITARIA', l3: 'DE NOVO?', acc: '#facc15',
    pergunta: 'Sabendo o que eu sei hoje, eu aceitaria isso de novo?' },
  { n: 3, mec: 'Prova social', l1: 'TODO MUNDO', l2: 'OU', l3: 'EU?', acc: '#22d3ee',
    pergunta: 'Se ninguém que eu conheço estivesse fazendo isso, eu ainda faria?' },
];

const html = p => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@500;600;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:radial-gradient(120% 80% at 80% 0%,#16314a 0%,#0b1420 55%,#070b12 100%);
 color:#fff;font-family:Inter,sans-serif;padding:90px 90px 80px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:30px;letter-spacing:.14em;text-transform:uppercase;color:#9fb3c8}
.top b{color:${p.acc}}
.big{font-family:Anton,sans-serif;line-height:.98;margin-top:120px;text-transform:uppercase}
.big .a{font-size:150px;color:#fff}
.big .b{font-size:150px;color:#fff;opacity:.55}
.big .c{font-size:190px;color:${p.acc}}
.bar{width:140px;height:10px;background:${p.acc};margin:70px 0 40px;border-radius:5px}
.q{font-size:44px;font-weight:600;line-height:1.3;max-width:860px;color:#e6edf5}
.mec{margin-top:24px;font-size:30px;color:#9fb3c8;font-weight:500}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:30px;color:#9fb3c8}
.foot strong{display:block;color:#fff;font-size:36px;font-weight:800}
.ring{position:absolute;right:-220px;top:380px;width:620px;height:620px;border:3px solid ${p.acc};border-radius:50%;opacity:.12}
</style></head><body>
<div class="ring"></div>
<div class="top"><span>Série · <b>Você escolheu?</b></span><span>${p.n}/3</span></div>
<div class="big"><div class="a">${p.l1}</div><div class="b">${p.l2}</div><div class="c">${p.l3}</div></div>
<div class="bar"></div>
<div class="q">“${p.pergunta}”</div>
<div class="mec">Mecanismo: ${p.mec} · Robert Cialdini</div>
<div class="foot"><div><strong>Manoel Gonçalves</strong>Desenvolve Mais</div><div>Da vida no automático<br>para uma vida com direção</div></div>
</body></html>`;

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const p of posts) {
    await pg.setContent(html(p), { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(__dirname, `post${p.n}.png`) });
  }
  await b.close();
})();
