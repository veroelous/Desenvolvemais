# Executar a edição independente

Requer Node.js 22.13 ou mais novo. Para uso local sem SMTP não há dependências externas. Use um único processo do servidor.

```sh
cp .env.example .env
```

No arquivo `.env`, defina `ADMIN_PASSWORD` com pelo menos 16 caracteres. O usuário padrão é `admin`. Inicie com:

```sh
npm start
```

- Avaliação nova: http://127.0.0.1:3000/diagnostico/roda-da-vida?nova=1
- Painel protegido: http://127.0.0.1:3000/admin/roda-da-vida

Para testar, abra a página do respondente e escolha **Importar respostas**. Selecione `../04-exemplos/avaliacao-ficticia.json`. No resultado, autorize o envio e clique em **Enviar avaliação**. Anote o protocolo, entre no painel e clique em **Ver resultado**. Abra as notas de uma das áreas.

O banco local é criado em `dados/roda-da-vida.sqlite`. A aplicação grava a avaliação e a fila de notificação na mesma transação. Sem configuração SMTP, os avisos ficam pendentes e a gravação funciona normalmente.

Para ativar avisos, instale a dependência opcional com `npm install` e configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER` e `SMTP_PASSWORD`. O destinatário indicado no modelo é `contato@manoelgoncalves.com`. Em ensaios com SMTP, use uma caixa de teste. A fila tenta novamente após falha, respeitando um intervalo de cinco minutos. Um erro ocorrido entre a aceitação pelo servidor de e-mail e a atualização do banco pode resultar em repetição do aviso.

Em implantação externa, termine TLS em proxy confiável e defina `PUBLIC_ORIGIN` com a origem HTTPS exata, sem barra final. Mantenha `.env` e o banco fora da raiz pública. A edição de referência não replica a sessão do APC nem seu limite persistente de envios. Use os PRs e o roteiro do pacote para integrar ao ambiente original.
