# Verificação · Hillkings v4

Data: 09/09/2026.

## Executado neste ambiente

- `npm ci --ignore-scripts --no-audit --no-fund`: concluído, sem dependências externas.
- `npm run check`: sintaxe dos módulos principais validada.
- `npm run build`: concluído; arquivos públicos em `dist`; marca de release gerada.
- `npm test`: **18 testes passaram, 0 falharam**. Saída completa em `qa/tests.txt`.
- Importação do handler com `mkdirSync`, `writeFileSync` e `appendFileSync` configurados para falhar: passou.
- Catálogo público sem configuração externa: HTTP 200; APIs que precisam salvar dados retornam 503 explícito.
- Testes HTTP de autenticação, CSRF, troca de senha, versão de produtos, contatos, solicitações e uploads: passaram usando um servidor local que simula o protocolo Supabase.
- Um segundo handler leu alterações do mesmo serviço simulado, sem banco local.
- Falha simulada de banco configurado devolveu erro em vez de substituir estoque/preços com seed.

## Não validado

- Não foi possível acessar o deployment pela integração Vercel: 403 para a equipe proprietária.
- Não houve deploy real nem teste em Vercel Functions.
- Não houve execução do SQL em PostgreSQL/Supabase real. As assertivas sobre o SQL são verificações do conteúdo do arquivo, não provas de aplicação das políticas.
- URLs assinadas reais, CORS do Supabase, cotas e credenciais precisam ser validados no projeto.
- E-mail real não enviado.
- A tentativa de revisão em Chromium foi bloqueada pelo ambiente com `ERR_BLOCKED_BY_ADMINISTRATOR` antes da primeira página. Não há nova validação visual/browser desta versão. O script está incluído para execução em um ambiente que permita acessar o servidor local.

A aprovação dos testes simulados não equivale a certificação de segurança, teste de penetração ou homologação de produção.
