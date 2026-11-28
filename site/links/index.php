<?php
/*
 * Página de links da bio do Instagram do Seu Missias.
 * O botão "Último vídeo" se atualiza sozinho: lê o feed público dos vídeos
 * longos do canal no YouTube (Shorts ficam de fora) e guarda o resultado em cache por 30 minutos.
 * Para configurar, basta preencher o ID do canal (começa com "UC").
 */
$CANAL_SEU_MISSIAS_ID = 'UCToOs06bAuX8TijIH6tOCtA';
$CACHE_SEGUNDOS = 1800;

function ultimo_video(string $canalId, int $ttl): ?array {
    if (!preg_match('/^UC[A-Za-z0-9_-]{22}$/', $canalId)) return null;
    $cache = __DIR__ . '/.cache-ultimo-video-longo.json';
    if (is_file($cache) && time() - filemtime($cache) < $ttl) {
        $d = json_decode((string) @file_get_contents($cache), true);
        if (is_array($d)) return $d ?: null;
    }
    // Playlist "UULF…" = só vídeos longos do canal (sem Shorts e sem lives).
    $url = 'https://www.youtube.com/feeds/videos.xml?playlist_id=UULF' . substr($canalId, 2);
    $xml = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4,
            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_FOLLOWLOCATION => true]);
        $xml = curl_exec($ch);
        if (curl_getinfo($ch, CURLINFO_HTTP_CODE) !== 200) $xml = false;
        curl_close($ch);
    } elseif (ini_get('allow_url_fopen')) {
        $xml = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 4]]));
    }
    $video = null;
    if ($xml) {
        $feed = @simplexml_load_string($xml);
        if ($feed && isset($feed->entry[0])) {
            $e = $feed->entry[0];
            $id = (string) $e->children('yt', true)->videoId;
            $video = ['titulo' => trim((string) $e->title),
                      'link' => 'https://www.youtube.com/watch?v=' . $id];
        }
    }
    if ($video || !is_file($cache)) {
        @file_put_contents($cache, json_encode($video ?: []), LOCK_EX);
    } else {
        @touch($cache); // feed fora do ar: mantém o último vídeo conhecido
        $d = json_decode((string) @file_get_contents($cache), true);
        return is_array($d) && $d ? $d : null;
    }
    return $video;
}

$video = ultimo_video($CANAL_SEU_MISSIAS_ID, $CACHE_SEGUNDOS);
$h = fn($t) => htmlspecialchars($t, ENT_QUOTES, 'UTF-8');
$videoLink = $video['link'] ?? 'https://www.youtube.com/@seumissias/videos';
$videoTitulo = $video['titulo'] ?? 'Vídeos do Seu Missias';
$videoSub = $video ? 'Último vídeo do Seu Missias' : 'Canal no YouTube';
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seu Missias · Manoel Gonçalves</title>
<meta name="description" content="Seu Missias: Bíblia no meio da vida real. Existe uma vida só. Links de Manoel Gonçalves.">
<meta property="og:title" content="Seu Missias · Manoel Gonçalves">
<meta property="og:description" content="Bíblia no meio da vida real. Existe uma vida só.">
<meta property="og:url" content="https://manoelgoncalves.com/links/">
<meta property="og:type" content="website">
<meta name="theme-color" content="#F3EFE6">
<link rel="canonical" href="https://manoelgoncalves.com/links/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Source+Serif+4:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  :root{
    --osso:#F3EFE6; --carvao:#1A1C1B; --cobre:#A86B45; --cobre-texto:#8A5533;
    --card:#FBF9F4; --line:#E2DCD0; --ico:#EFE8DC; --muted:#6B655C;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{min-height:100vh;background:var(--osso);color:var(--carvao);
    font-family:"Archivo",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    line-height:1.45;display:flex;justify-content:center;padding:44px 16px 32px}
  main{width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px}
  header{text-align:center;margin-bottom:12px}
  .avatar{width:96px;height:96px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;
    background:var(--card);border:2px solid var(--cobre);
    font-weight:700;font-size:30px;letter-spacing:1px;color:var(--cobre);overflow:hidden}
  .avatar img{width:100%;height:100%;object-fit:cover}
  h1{font-size:24px;font-weight:700;letter-spacing:.01em}
  .by{color:var(--muted);font-size:14px;margin-top:2px}
  .tagline{font-family:"Source Serif 4",Georgia,serif;font-style:italic;font-size:18px;margin-top:14px}
  .tese{color:var(--cobre-texto);font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;margin-top:8px}
  a.btn{display:flex;align-items:center;gap:14px;text-decoration:none;color:var(--carvao);
    background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;
    transition:transform .12s ease,border-color .12s ease}
  a.btn:hover{border-color:var(--cobre)}
  a.btn:active{transform:scale(.985)}
  a.btn:focus-visible{outline:2px solid var(--cobre);outline-offset:2px}
  .ico{flex:0 0 40px;height:40px;border-radius:10px;display:grid;place-items:center;background:var(--ico);color:var(--cobre)}
  .ico svg{width:22px;height:22px}
  .txt{display:flex;flex-direction:column;min-width:0}
  .t{font-weight:600;font-size:16px}
  .s{color:var(--muted);font-size:13.5px}
  a.primary{background:var(--carvao);border-color:var(--carvao);color:var(--osso);padding:18px 16px}
  a.primary .ico{background:#2E302F;color:var(--osso)}
  a.primary .s{color:#C9C2B6}
  footer{text-align:center;color:var(--muted);font-size:12px;margin-top:24px}
  footer a{color:inherit}
  @media (prefers-reduced-motion:reduce){a.btn{transition:none}}
</style>
</head>
<body>
<main>
  <header>
    <div class="avatar" aria-hidden="true">SM</div>
    <h1>Seu Missias</h1>
    <div class="by">por Manoel Gonçalves</div>
    <p class="tagline">Bíblia no meio da vida real.</p>
    <p class="tese">Existe uma vida só</p>
  </header>


  <a class="btn" id="ultimo-video" href="<?= $h($videoLink) ?>" target="_blank" rel="noopener">
    <span class="ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
    <span class="txt"><span class="t"><?= $h($videoTitulo) ?></span>
    <span class="s"><?= $h($videoSub) ?></span></span>
  </a>

  <a class="btn" id="desenvolve-mais"href="https://www.youtube.com/@canaldesenvolvemais" target="_blank" rel="noopener">
    <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10 9.5 4.5 2.5-4.5 2.5z" fill="currentColor"/></svg></span>
    <span class="txt"><span class="t">Desenvolve Mais no YouTube</span>
    <span class="s">Canal de desenvolvimento pessoal e profissional</span></span>
  </a>

  <a class="btn" id="desenvolve-mais-instagram" href="https://www.instagram.com/canaldesenvolvemais/" target="_blank" rel="noopener">
    <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none"/></svg></span>
    <span class="txt"><span class="t">Desenvolve Mais no Instagram</span>
    <span class="s">@canaldesenvolvemais</span></span>
  </a>

  <a class="btn primary" id="whatsapp"
     href="https://wa.me/5512991337474?text=Ol%C3%A1%2C%20Manoel!%20Vim%20pelo%20Instagram%20do%20Seu%20Missias."
     target="_blank" rel="noopener">
    <span class="ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg></span>
    <span class="txt"><span class="t">Fale comigo</span>
    <span class="s">Conversa pelo WhatsApp</span></span>
  </a>

  <footer>© 2026 Manoel Gonçalves · <a href="https://manoelgoncalves.com/">manoelgoncalves.com</a></footer>
</main>
</body>
</html>
