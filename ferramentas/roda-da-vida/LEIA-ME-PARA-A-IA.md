# Instruções para a IA que recebe este pacote

Seu objetivo é entender, reproduzir ou evoluir a Roda da Vida do projeto Desenvolve Mais, de Manoel Gonçalves. Leia o README, o histórico e o questionário antes de propor alterações. Use a edição executável como referência de comportamento. Se o trabalho for sobre a publicação existente, confirme acesso ao repositório e examine o código atual antes de alterar arquivos.

## Comportamento que deve ser preservado

- Identidade pública **Desenvolvimento Profissional**. Remover marca e logotipos Genoma da experiência atual. Nomes internos legados podem permanecer para compatibilidade.
- Botão inicial **COMEÇAR MINHA AVALIAÇÃO**. Formulário responsivo e navegável por área. Nome e WhatsApp obrigatórios. Aceitar número brasileiro com DDD ou internacional com + e código do país. Empresa e função opcionais.
- 14 áreas e 70 afirmações, na ordem de `questionario.json`. Cinco notas inteiras de 1 a 10 por área. Total entre 5 e 50, média entre 1 e 10. Média geral das 14 médias com pesos iguais. Escala descritiva de autorreflexão, sem faixas normativas.
- Rascunho no navegador, exportação/importação JSON, CSV, impressão/PDF e plano pessoal conforme o formulário original. Abrir `?nova=1` inicia em branco sem carregar o rascunho anterior. O plano de ação pessoal fica no navegador/arquivo.
- Consentimento explícito antes de gravar no servidor. Validação autoritativa no servidor, inclusive 70 respostas e 14 observações. As médias são calculadas no servidor.
- A avaliação recebe protocolo após persistência. Reenvio idêntico reutiliza o protocolo e não duplica dados. O mesmo UUID com dados diferentes gera conflito. Se o usuário editar depois de enviar, o estado visual volta a indicar envio pendente para a versão alterada.
- Ao concluir e enviar, criar uma notificação para **contato@manoelgoncalves.com**. O endereço anterior foi corrigido pelo usuário. E-mail de aviso com identificação e protocolo, sem notas ou observações pessoais. Guardar o registro ainda que o SMTP falhe.
- A URL do respondente é pública e serve para preencher. A lista e os detalhes são privados, com autenticação de administrador. Listar avaliações, buscar nome/empresa e abrir o resultado individual. Mostrar WhatsApp, ou “Não informado” nos históricos antigos.
- Relatório administrativo com roda das 14 áreas, média geral, menor e maior média e diferença entre extremos. Comparar visualmente as áreas da menor para a maior pontuação. Mostrar total e média. Os detalhes expandem as cinco afirmações, notas e observação. Empates recebem tratamento coerente. Use os números para orientar uma conversa, não para diagnosticar ou selecionar pessoas.

## Acréscimos de 11/11/2026 (edição local)

Ver `MELHORIAS-2026-11-11.md`. Preservar também: origem do acesso (`source`, opcional, fora do hash), convite de WhatsApp só depois do envio e só com `CONTACT_WHATSAPP`, funil de acompanhamento com anotação interna, CSV administrativo, limite de envios por IP e `npm test`. Essas mudanças ainda **não** estão na produção do APC.

## Contrato de envio

```json
{
  "id": "UUID v4",
  "sharingConfirmed": true,
  "data": {
    "instrument": "genoma-roda-da-vida-profissional",
    "questionSet": "rvp-70-v1",
    "profile": {"name": "Nome", "whatsapp": "+5511999999999", "company": "", "role": "", "date": "AAAA-MM-DD"},
    "answers": ["70 inteiros de 1 a 10"],
    "notes": ["14 strings de até 2000 caracteres"]
  },
  "source": {"utm_source": "youtube", "utm_campaign": "nome-do-video"}
}
```

O trecho acima ilustra o formato. Use o arquivo de exemplo para dados que passem na validação. Resposta de sucesso da edição local: `{"saved":true,"id":"UUID"}`.

## Implantação original conhecida

- Repositório privado `veroelous/apc-3`. Branch de implantação `codex/apc-3.0`. Next.js e Node.js na Hostinger, integração MySQL e SMTP compartilhada com o APC. O GitHub acionava a publicação após alterações nessa branch.
- Respondente: https://steelblue-cheetah-462962.hostingersite.com/diagnostico/roda-da-vida?nova=1
- Administração: https://steelblue-cheetah-462962.hostingersite.com/admin/roda-da-vida
- Envio: POST `/diagnostico/roda-da-vida/envio`. O fluxo de produção usa `RVP_ENABLE_SUBMISSIONS=enabled`, verifica o banco com `APC3_EXPECTED_DATABASE`, usa limite persistente de envios e mantém as tabelas `rvp_assessments` e `rvp_notifications`.
- As tabelas originais guardam UUID, hash, JSON do formulário, médias, data e fila SMTP com estado, tentativas, próxima execução e lease. Consulte o rascunho para o desenho SQL. O código final acrescentou mudanças após aquele rascunho.
- Arquivos de referência: `src/lib/roda/page-html.ts`, `src/lib/roda/validate.mjs`, `src/lib/roda/validate.d.mts`, `src/lib/roda/storage.ts`, `src/app/diagnostico/roda-da-vida/route.ts`, `src/app/diagnostico/roda-da-vida/envio/route.ts`, `src/app/admin/roda-da-vida/route.ts`, `src/app/painel/page.tsx`, `tests/roda-validation.test.ts`.
- PRs: [1 — integração](https://github.com/veroelous/apc-3/pull/1), [2 — acessos separados](https://github.com/veroelous/apc-3/pull/2), [3 — WhatsApp](https://github.com/veroelous/apc-3/pull/3), [4 — relatório](https://github.com/veroelous/apc-3/pull/4).
- Produção usa a barreira do APC e depois sua sessão com papel `admin`. A edição portátil usa autenticação HTTP Basic independente e SQLite. Execute a edição portátil localmente em processo único. Para hospedar, configure HTTPS, credenciais próprias, `PUBLIC_ORIGIN` e controles de abuso equivalentes aos de produção.
- A verificação do último relatório foi feita no CI do GitHub e o PR foi incorporado à branch de publicação. A visualização administrativa da última versão em produção não foi confirmada na conversa. A entrega em caixa de entrada do aviso também não foi confirmada.

## Retomada sugerida

1. Execute o exemplo fictício na edição local. Examine o questionário e valide números, registros e acesso administrativo.
2. Se for evoluir a versão em produção, obtenha um checkout autorizado do GitHub e compare com os PRs acima. Recupere a configuração em canal seguro e preserve os dados existentes.
3. Rode lint, typecheck, testes e build do repositório. Confirme o ambiente de teste, o envio real e o acesso administrativo antes de declarar a implantação validada.
