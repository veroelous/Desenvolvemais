# Verificação local

Executada em 11/11/2026 com Node.js 24 e banco SQLite temporário. Nenhuma avaliação real foi usada.

- Página pública retornou o HTML com campo WhatsApp obrigatório e todos os scripts foram analisados sem erro de sintaxe.
- Envio sem consentimento ou sem WhatsApp foi rejeitado. Origem diferente foi bloqueada.
- Envio válido salvou o registro. Repetir o mesmo conteúdo manteve um único registro com o mesmo protocolo. Alterar o conteúdo e repetir o UUID retornou conflito.
- Painel sem autenticação retornou 401. Com autenticação, a busca encontrou o registro fictício e o resultado apresentou 14 blocos de detalhes, 70 notas, total conferido de 25/50 e o número normalizado.
- Fila criada e aviso marcado pendente. SMTP real e inspeção visual em navegador da edição independente não foram testados.

## Verificação de 11/11/2026 (melhorias)

Node.js 22.23, banco SQLite temporário, sem dados reais.

- `npm test`: 9 de 9 testes passaram (validação, origem, idempotência, conflito 409, origem inválida 403, painel 401/200 com CSP, filtros, convite WhatsApp sem notas, 70 notas no relatório, acompanhamento com bloqueio de outra origem, CSV com BOM e proteção contra fórmulas, limite 429).
- Navegador (Chromium, 390 px e 1100 px): importação do exemplo, envio com origem `instagram` e `youtube · teste`, convite de WhatsApp exibido após o envio, painel sem rolagem horizontal no celular, radar com nomes legíveis.
- Migração: o servidor novo abriu um banco criado pela versão anterior; o registro antigo apareceu como “acesso direto” e situação “Novo”.
- Não testado: SMTP real, implantação com HTTPS, produção no APC.
