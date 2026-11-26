// Uso: node gerar_lote.js lote.json  -> gera <prefixo>-<n>.png (1080x1350)
// lote.json: { "prefixo": "lote2", "serie": "Desenvolve Mais", "posts": [ {l1,l2,l3,acc,pergunta,rodape} ] }
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const size = t => t.length > 11 ? 120 : t.length > 8 ? 140 : 150;
const html = (p, n, tot) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@500;600;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:radial-gradient(120% 80% at 80% 0%,#16314a 0%,#0b1420 55%,#070b12 100%);
 color:#fff;font-family:Inter,sans-serif;padding:90px 90px 80px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;font-weight:600;font-size:30px;letter-spacing:.14em;text-transform:uppercase;color:#9fb3c8}
.top b{color:${p.acc}}
.big{font-family:Anton,sans-serif;line-height:1.2;margin-top:90px;text-transform:uppercase}
.a{font-size:${size(p.l1)}px}.b{font-size:${size(p.l2)}px;opacity:.55}.c{font-size:${Math.min(190,size(p.l3)+40)}px;color:${p.acc}}
.bar{width:140px;height:10px;background:${p.acc};margin:70px 0 40px;border-radius:5px}
.q{font-size:44px;font-weight:600;line-height:1.3;max-width:860px;color:#e6edf5}
.mec{margin-top:24px;font-size:30px;color:#9fb3c8;font-weight:500}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:30px;color:#9fb3c8}
.foot strong{display:block;color:#fff;font-size:36px;font-weight:800}
.ring{position:absolute;right:-220px;top:380px;width:620px;height:620px;border:3px solid ${p.acc};border-radius:50%;opacity:.12}
</style></head><body><div class="ring"></div>
<div class="top"><span><b>${esc(cfg.serie)}</b></span><span>${n}/${tot}</span></div>
<div class="big"><div class="a">${esc(p.l1)}</div><div class="b">${esc(p.l2)}</div><div class="c">${esc(p.l3)}</div></div>
<div class="bar"></div><div class="q">“${esc(p.pergunta)}”</div>
${p.rodape ? `<div class="mec">${esc(p.rodape)}</div>` : ''}
<div class="foot"><div><strong>Manoel Gonçalves</strong>Desenvolve Mais</div><div>Da vida no automático<br>para uma vida com direção</div></div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const tot = cfg.posts.length;
  for (const [i, p] of cfg.posts.entries()) {
    await pg.setContent(html(p, i + 1, tot), { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    const big = await pg.$eval('.big', e => e.scrollWidth > 900);
    if (big) console.warn('AVISO: título largo demais no post', i + 1);
    await pg.screenshot({ path: path.join(__dirname, `${cfg.prefixo}-${i + 1}.png`) });
  }
  await b.close();
})();
