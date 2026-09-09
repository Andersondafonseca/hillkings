# 4.0.0-vercel-supabase

- Removidos `server.mjs`, `lib/database.mjs`, SQLite e gravações locais da arquitetura publicada.
- Nova entrada única `api/index.mjs`, roteamento para Vercel e build explícito.
- Banco, sessões, contatos, pedidos e auditoria via Supabase REST; migração SQL incluída.
- Conta inicial segura, senha protegida por scrypt e invalidação atômica de sessões na troca.
- Limite de requisições atômico no banco; atualizações por versão.
- Novos arquivos enviados diretamente ao Supabase por URL assinada, privados até validação.
- Sem serviços configurados, catálogo inicial acessível e formulário/painel claramente inativos; não há simulação de gravação.
- Catálogo, conteúdo v3, favicon e três experiências 3D preservados.
- Nenhum deployment ou serviço externo foi alterado nesta entrega.
