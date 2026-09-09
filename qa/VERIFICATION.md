# Verificação — versão 3

- Análise sintática (`npm run check`): aprovada.
- Node (`npm test`): 17/17 testes. Inclui conteúdo PT/EN, ausência dos nomes na identidade pública, badges condicionais, aliases do formulário, favicon, API, autenticação, contatos, disponibilidade, uploads e persistência dos campos de concierge.
- Interface: 22/22 verificações da prévia, em Chromium. Formulário, seleção contextual de atacado/busca, campo de empresa, registro simulado, detalhes no painel, links para relatório, navegação móvel, tradução, favicon da janela externa e inicialização 3D da Paraíba solta.
- Fixture de UI: HTML da prévia renderizado em memória; apenas os bytes dos vídeos MP4 foram suprimidos no harness para economizar memória. Arquivos completos continuam nos pacotes finais. A prévia integral foi inicializada em memória, com os dois formulários encontrados; a captura gráfica foi realizada com fixture reduzida.
- Capturas estáticas: layout desktop, legado, concierge, atacado/entregas, formulário e viewport móvel de 390 px. Sem teste em dispositivo iOS físico.
- O acesso do navegador automatizado a URLs locais/arquivos está bloqueado pelo ambiente. Os testes do servidor utilizaram HTTP pelo runtime Node; não foi alegado um teste de navegação HTTP ponta a ponta no navegador.
- As três malhas GLB e os fontes dos shaders mantêm o conteúdo da v2; não foram alterados nesta revisão de conteúdo.
- Nenhum e-mail real, publicação externa, pagamento, autenticação do relatório no GIA ou auditoria independente foi executado.

Os arquivos na pasta `v2/` são registros históricos da entrega anterior, não novos testes desta versão.
