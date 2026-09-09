# Verificações executadas — v2

- `npm run check`: análise sintática dos arquivos principais, sem erros.
- `npm test`: 10/10 testes de integração do servidor aprovados.
- Navegação e visualização: 41/41 verificações aprovadas em Chromium automatizado. Contexto WebGL real, executado via EGL de software; não houve substituição silenciosa pelo Canvas2D no teste óptico.
- As três peças inicializaram shaders ópticos e malhas refrativas. Rotação, zoom, retorno à vista inicial, luz quente/fria, exposição e rotação automática responderam. Tela cheia nativa foi acionada no Chromium de teste.
- Capas editoriais carregadas; alternância para original atualizou a legenda; vídeos das duas Paraíbas reproduziram.
- Login e edição simulados no HTML testados; alteração de status para vendida, classificação editorial e contato se mantiveram ao navegar pela prévia.
- Largura de 390 px: sem transbordamento horizontal nas páginas testadas; as três experiências 3D carregaram. É simulação de viewport, não Safari/iPhone físico.
- Atualizador opcional testado com banco v1 temporário: preços/status preservados, modelos incluídos, segunda execução sem modificações.
- Nenhum erro de JavaScript não tratado registrado no ensaio de navegação.

## Fora do escopo dos testes concluídos

Nenhuma implantação remota, envio real de e-mail, pagamento, dispositivo iOS físico, autenticação de laudos, auditoria externa de segurança ou medição de correspondência entre GLB e produto real. O conteúdo da prévia estática é inteiramente local e o login não é segurança de produção.
