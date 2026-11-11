# Melhorias de 11/11/2026 — Roda da Vida como porta de entrada da conversa

O pacote original resolvia bem o **instrumento** (70 afirmações, cálculo, privacidade, painel).
O que faltava era ligar a ferramenta ao objetivo comercial do Desenvolve Mais
(regra 2 do método: todo conteúdo serve à conversa de orientação) e à medição de 30 dias
(“contatos via WhatsApp, conversas qualificadas e contratações”).

A Roda da Vida responde exatamente ao desejo latente de trabalho
(*“quero mudar, mas preciso descobrir por onde começar”*). Por isso ela é o próximo passo
natural de um vídeo: assistir → fazer a roda → enviar → conversar.

## O que mudou (edição local `03-reproducao`)

| # | Mudança | Por quê |
|---|---|---|
| 1 | **Origem do acesso**: o link aceita `?origem=` ou `utm_source/utm_medium/utm_campaign/utm_content`. A origem é guardada com a avaliação, aparece no painel, no e-mail e no CSV, e pode ser filtrada. | Saber qual vídeo/canal gera avaliações e conversas. Sem isso, não há como medir. |
| 2 | **Convite honesto após o envio**: “Conversar pelo WhatsApp”, com mensagem pronta citando o protocolo. Só aparece se `CONTACT_WHATSAPP` estiver configurado. Sem preço nem promessa. | CTA só depois de entregar valor (regra 4). Oferta fechada ainda não existe; convite para conversa é o passo definido. |
| 3 | **Caixa de envio movida para depois do resultado** e com visual próprio. Antes ficava no topo, antes da pessoa ver a própria roda. | Valor primeiro, pedido depois. |
| 4 | **Painel: funil de acompanhamento** — situação (Novo, Contatado, Conversa realizada, Virou cliente, Sem interesse agora) + anotação interna por avaliação, contadores e filtro. | Medir a meta de teste “1 conversa qualificada em 30 dias” com dado, não memória. |
| 5 | **Botão “Chamar no WhatsApp”** no resultado, com convite editável (sem notas). | Reduz o atrito entre receber o aviso e iniciar a conversa. |
| 6 | **Roteiro para abrir a conversa** no relatório: áreas de menor média (com empates) e quantas observações escritas existem. Gráfico com nomes e médias. | O radar anterior só tinha números 1–14. |
| 7 | **Exportar CSV** das avaliações (respeita filtros): contato, origem, médias das 14 áreas, situação, anotação. Proteção contra fórmulas e BOM para Excel. | Planilha de acompanhamento sem copiar à mão. |
| 8 | **E-mail de aviso** com WhatsApp, origem e link direto para o resultado (se `PUBLIC_ORIGIN`). Continua sem notas nem observações. | Agir a partir do aviso. |
| 9 | **Segurança**: limite de envios por IP (429), CSP no painel, POST administrativo exige mesma origem (anti-CSRF), migração aditiva do banco. | A edição local não tinha limite de envio. Bancos antigos continuam funcionando. |
| 10 | **Testes automatizados** (`npm test`, 9 testes): validação, idempotência, conflito, autenticação, origem, acompanhamento, CSV, limite. | A verificação anterior era manual. |

O contrato de envio continua compatível: o campo `source` é opcional e fica **fora do hash**
(reenviar as mesmas respostas por outro link não gera conflito).

## O que NÃO foi feito (e por quê)

- **Produção (`veroelous/apc-3`, Hostinger) não foi alterada.** Este repositório não tem acesso a ela.
  Para levar as mudanças: aplicar os itens 1–8 nos arquivos listados no LEIA-ME
  (`page-html.ts`, `validate.mjs`, `storage.ts`, rotas de envio e admin), com
  `ALTER TABLE rvp_assessments ADD COLUMN ...` equivalente às colunas `source`, `source_label`,
  `lead_status`, `lead_note`, `lead_updated_at`, e rodar lint/typecheck/testes/build do APC.
- Nenhum preço, nome de oferta ou promessa foi inventado. O texto do convite é deliberadamente neutro.
- Entrega real de e-mail continua **não verificada** (sem SMTP neste ambiente).

## Como usar no próximo vídeo

Link na descrição/comentário fixado do vídeo das Armas da Persuasão, por exemplo:

```
https://SEU-DOMINIO/diagnostico/roda-da-vida?nova=1&utm_source=youtube&utm_campaign=armas-da-persuasao
```

Um link por vídeo (mude só `utm_campaign`). Aos 30 dias, filtre o painel por origem e conte:
avaliações → contatados → conversas → clientes.
