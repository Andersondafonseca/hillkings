# Hillkings · Vercel v4

Correção do erro `ENOENT: mkdir /var/task/data`.

Este pacote **substitui o servidor Node/SQLite da v3**. Não é a prévia com painel simulado: contém um handler para Vercel e integração de banco/armazenamento com Supabase. Nenhum banco, sessão, segredo ou upload é gravado no disco da função.

**Limite da entrega:** validado localmente, com um servidor que simula o protocolo HTTP do Supabase. A migração SQL e a integração com Supabase/Vercel reais precisam ser executadas e verificadas na sua conta. Não foi feito deploy pelo autor desta entrega.

## 1. Substituir o pacote publicado

1. Faça backup do código atual. Extraia este ZIP numa pasta vazia.
2. Use esta pasta como a raiz do repositório/projeto. Ela deve conter `vercel.json`, `package.json`, `api/`, `lib/`, `public/` e `supabase/`.
3. **Não misture** com `server.mjs`, `lib/database.mjs`, pastas `data/` ou arquivos `api/` do pacote anterior. O build bloqueia duas entradas antigas conhecidas.
4. Na Vercel: Framework Preset `Other`; Root Directory = a pasta deste `vercel.json`; Build Command `npm run build`; Output Directory `dist`; Install Command `npm ci --ignore-scripts --no-audit --no-fund`; Node.js `22.x`. O arquivo de configuração já traz os comandos.
5. Publique um **novo commit/deployment contendo estes arquivos**. Reexecutar um deployment do commit antigo não muda o servidor que está falhando.
6. Confirme `/release.json`: deve trazer `4.0.0-vercel-supabase` e `localDatabase: false`. Se aparecer `/var/task/lib/database.mjs` nos novos logs, ainda há código antigo sendo publicado.

## 2. Abrir o catálogo antes de configurar o banco

Defina `APP_URL=https://hillkings.vercel.app`. Deixe as variáveis do Supabase ausentes até preparar o projeto.

Sem Supabase, o catálogo inicial e as mídias/3D abrem. Há um aviso visível de catálogo de apresentação e disponibilidade a confirmar. O formulário e a administração **não são ativados**; nenhuma mensagem ou alteração é falsamente confirmada. `/api/health` mostra `mode: catalog-only`, `databaseReady: false`.

Isso é apenas uma etapa de ativação. Para receber solicitações e administrar estoque, faça a etapa seguinte.

## 3. Ativar banco e administração reais

Use um projeto Supabase **dedicado à Hillkings**.

1. Abra SQL Editor e execute o conteúdo de `supabase/001_hillkings.sql`.
   - Cria tabelas `hk_*`, dados iniciais e chave interna estável no banco.
   - Ativa RLS e revoga acesso dos papéis `anon`, `authenticated` e `PUBLIC`.
   - Concede acesso somente ao papel de servidor `service_role`.
   - Cria bucket **privado** `hillkings-media`.
   - Não substitui produtos e contatos já existentes em `hk_*`.
2. Configure as variáveis abaixo na Vercel (ambiente Production). **Não envie chaves por chat, não inclua no Git, não use prefixos `NEXT_PUBLIC_` ou `VITE_`.**

| Variável | Valor |
| --- | --- |
| `APP_URL` | `https://hillkings.vercel.app` ou o domínio principal HTTPS |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta `sb_secret_...`, apenas no servidor |
| `SUPABASE_STORAGE_BUCKET` | `hillkings-media` (este já é o padrão) |
| `ADMIN_INITIAL_USERNAME` | `admin` (padrão) |
| `ADMIN_INITIAL_PASSWORD` | Senha exclusiva de pelo menos 12 caracteres |

A chave `service_role` legada também é aceita em `SUPABASE_SERVICE_ROLE_KEY`; prefira a chave secreta nova.

3. Faça novo deployment para aplicar as variáveis.
4. Abra `/api/health`. Com o SQL aplicado, deve indicar `databaseReady: true`.
5. Abra `/admin`, entre com `admin` e a senha definida. O primeiro login cria a conta no banco e exige troca de senha. A conta não é reinicializada nos deployments seguintes. **`admin/admin` não funciona online.**
6. Depois da primeira troca, remova `ADMIN_INITIAL_PASSWORD` das variáveis de produção e publique novamente. A senha atual está protegida por scrypt no banco. Não apague a tabela de usuários.

Não compartilhe a base de produção com deployments de teste capazes de alterar o catálogo. Para Preview, deixe Supabase desconfigurado ou use projeto separado.

## 4. Contato e envio de e-mail

O formulário guarda o pedido no banco antes de tentar notificar. O destinatário inicial é o endereço informado no briefing e pode ser trocado pelo painel; não é exposto na interface pública. WhatsApp e demais dados também são editáveis.

Para notificações, configure `RESEND_API_KEY` e `EMAIL_FROM` com remetente de um domínio verificado no Resend. Sem isso, solicitações ficam salvas com status de notificação `queued`. “Aceito pelo provedor” não significa leitura ou entrega final. Não foi testado envio real nesta entrega.

## 5. Imagens, vídeos, laudos e modelos 3D

As mídias iniciais são servidas como arquivos estáticos. Novos uploads vão diretamente do navegador ao Supabase mediante URL assinada por um administrador autenticado. Isso evita enviar os arquivos grandes no corpo de uma Vercel Function.

O backend verifica tamanho, assinatura binária e restrições de GLB antes de aprovar uma mídia. O bucket é privado; `/uploads/...` só disponibiliza arquivos aprovados por redirecionamento para uma URL temporária. Limites: 12 MB para fotos/PDF; 60 MB para MP4/GLB, sujeitos também ao limite configurado no Supabase.

As imagens editoriais continuam identificadas como IA; os três modelos permanecem representações aproximadas, não CAD medido ou simulação gemológica. As fotos/vídeos reais foram preservados.

## 6. Desenvolvimento e testes

Requer Node.js 22.16+ na série 22.

```
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
npm start
```

Não há dependências npm de runtime. Toda conexão externa usa `fetch()` do Node.

Os testes iniciam um servidor local que **simula** Supabase, sem acessar projetos ou enviar e-mail. Eles não verificam o motor PostgreSQL nem as políticas RLS na nuvem. Leia `qa/VERIFICATION.md`.

## 7. Antes de operação comercial

Verifique na sua conta: aplicação da migração SQL; impossibilidade de acesso com chave pública às tabelas `hk_*`; login/troca de senha; alteração de preço/vendido sobrevivendo a novo deployment; uploads por URL assinada; formulário salvo e notificação aceita pelo provedor; HTTPS, domínio e backup do banco. Uma revisão de segurança independente é apropriada antes de utilizar dados reais de clientes.

Os arquivos desta entrega preservam os três produtos do briefing. **Não migram automaticamente um banco SQLite antigo, dados locais de outra instalação nem uploads antigos.** Preserve o backup e faça uma migração controlada caso existam dados adicionais. Mensagens do painel são limitadas às 500 mais recentes e o catálogo às 1.000 peças por consulta nesta implementação.

## Referências oficiais

- https://vercel.com/docs/functions/runtimes
- https://vercel.com/kb/guide/is-sqlite-supported-in-vercel
- https://vercel.com/docs/project-configuration/vercel-json
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/api/creating-routes
- https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
