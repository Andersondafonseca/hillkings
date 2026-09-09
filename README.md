# HILLKINGS · Fine Gemstones — v3

Catálogo privado com imagens e vídeos reais, capas editoriais identificadas, três modelos 3D interativos e administração com banco SQLite. Esta entrega não foi publicada em nenhum domínio.

## 1. Testar sem instalar

A entrega separada `Hillkings-Previa-Concierge-v3.html` é uma prévia autônoma. Abra o arquivo em um navegador moderno com JavaScript ativado. Todas as imagens, vídeos e modelos estão incorporados: não exige conexão com CDN nem Node.js.

Use os atalhos **Rubi 3D**, **Paraíba 3D** e **Colar 3D** na barra superior. Arraste, aproxime com o scroll/dois dedos, teste Macro, tela cheia, luz quente/fria e os controles de exposição/posição da luz.

Na prévia, **admin / admin** é apenas um login de demonstração. Edições e solicitações ficam na memória daquela aba, desaparecem ao recarregar e **não enviam e-mails**. Não use dados pessoais ou senhas reais. Links externos, inclusive WhatsApp, pedem confirmação antes de abrir um serviço real.

O pacote separado `Hillkings-Previa-Vercel-v3.zip` publica **somente essa demonstração estática**. Não fornece banco nem administração segura de produção.

## 2. Executar o site completo localmente

Requisito: Node.js **22.16 ou superior**. O servidor usa módulos nativos, incluindo `node:sqlite`.

```sh
npm install
npm start
```

Acesse `http://127.0.0.1:3000`; administração em `/admin`.

O primeiro login local é `admin / admin`. O servidor exige troca de senha antes de permitir operações administrativas. A senha nova deve ter de 12 a 128 caracteres e não começar por termos triviais. Senhas, sessões e credenciais da prévia não são compartilhadas com o servidor real.

O modo de produção bloqueia a senha inicial insegura. Para redefinir uma instalação, consulte `npm run admin:reset` e configure uma senha segura. Copie `.env.example` para `.env`, ajuste as variáveis e nunca publique esse arquivo.

## 3. Conteúdo, contato e identidade — v3

A assinatura institucional é somente Hillkings Fine Gemstones. Os nomes pessoais dos fundadores foram retirados da apresentação pública e da identidade do painel. O endereço de recebimento das solicitações continua privado e editável.

- Nova seção de concierge: busca de gemas sob encomenda, com definição de preferências, seleção, documentação e proposta.
- Narrativa de legado: joias escolhidas para atravessar gerações. Não afirma que a empresa é centenária nem inventa uma história familiar de comércio de joias.
- Condições especiais para atacado, negociadas por volume e perfil da seleção. Nenhuma tabela fictícia de descontos ou prazo garantido foi criada.
- Entregas internacionais, condicionadas à confirmação de rota, documentação e condições de transporte. Custos, seguro, tributos e prazo devem constar de cada proposta real.
- Formulário na página inicial, em `/private` (também `/contact` e `/concierge`) e na janela de atendimento. Registra nome, e-mail, WhatsApp opcional, tipo de atendimento, destino, empresa opcional para atacado, peça e mensagem. Campos adicionais são validados, salvos e apresentados na administração e na notificação por e-mail.
- Perguntas frequentes em português e inglês.
- Favicon com o monograma aprovado em ICO (16/32/48/64), PNG, Apple Touch Icon e manifest. A janela externa da prévia também recebe favicon incorporado.

### Indicação GIA

O badge utiliza **“Relatório GIA”**, não “Certificado GIA”. O instituto informa que emite relatórios e não certifica gemas, empresas ou joias. O desenho do badge é da interface Hillkings, com ícone de documento, sem reproduzir o selo oficial do laboratório ou insinuar endosso.

Fonte oficial consultada: https://www.gia.edu/copyrights-trademarks (seções Certification e Using the GIA Name in Advertising, consulta em 09/09/2026).

O badge só aparece quando o cadastro declara um relatório GIA. Diferencia cópia disponível, cópia a anexar e conferência registrada pela Hillkings. O relatório da gema central não atesta automaticamente os diamantes laterais, o metal, a joia inteira ou seu valor. Rubi e colar ainda precisam de cópias digitais dos relatórios correspondentes. A imagem da Paraíba solta permanece vinculada apenas à gema de 2,09 ct.

### Recursos visuais preservados da v2

- As Paraíbas usam como capa as duas imagens isoladas aprovadas. O selo **“Apresentação editorial · IA”** permanece visível; fotografias e vídeos originais continuam disponíveis.
- O editor de mídia permite classificar cada imagem como original ou editorial. Essa classificação é persistida em alterações de preço/disponibilidade.
- Rubi, Paraíba solta e colar agora possuem um arquivo GLB autocontido e controles 3D funcionais.
- O renderizador anterior foi substituído por código WebGL com refração nas faces convexas, Fresnel, reflexão interna total, absorção de cor e separação espectral aproximada nos diamantes.
- Iluminação de estúdio procedural em alta faixa dinâmica, materiais separados para gemas/metal, mapeamento tonal e controle de exposição. Não utiliza uma fotografia HDRI externa nem Three.js.
- Rotação por arrasto, inércia, teclado, zoom, macro, rotação automática opcional, tela cheia/expansão, modos de luz e parâmetros de iluminação.
- A administração mantém adição/edição/arquivamento, disponível/reservada/vendida, uploads, contatos editáveis e registro de solicitações.

## 4. Catálogo inicial

| Referência | Peça | Preço de oferta |
| --- | --- | ---: |
| HK-J001 | Rubi 9,01 ct; diamantes 1,40 ct VVS; ouro branco | US$ 500.000 |
| HK-G001 | Paraíba solta 2,09 ct | US$ 200.000 |
| HK-J002 | Colar Paraíba 2,61 ct; ouro branco; diamantes | US$ 210.000 |

Preços e especificações fornecidos pelo proprietário; não constituem avaliação independente. O preço corrigido do colar é **US$ 210.000**, não US$ 2.100.000.

Contatos iniciais: WhatsApp `+55 11 91081-5777`; destino das solicitações `anderson@mediscope.com.br`. Ambos são alteráveis no painel. O destino de e-mail é usado pelo servidor, não fixado na interface pública.

O envio real por e-mail necessita `RESEND_API_KEY` e `EMAIL_FROM`, com remetente autorizado. Sem essas variáveis, as solicitações ficam registradas no SQLite como pendentes; nenhum envio é alegado como concluído.

## 5. Representação visual: limites importantes

**As imagens editoriais são geradas por IA, não fotografias documentais das peças.** O desenho do halo/corrente, cor, inclusões, proporções e lapidação podem divergir do objeto físico. O selo e as observações não devem ser removidos sem substituir por fotografias genuínas.

**Os três modelos são reconstruções ilustrativas, não CAD medido.** Para a gema solta, o envelope foi orientado pelas medidas fornecidas no relatório (10,47 × 6,59 × 4,45 mm); facetas e inclusões não foram medidas. Montagem, corrente e quantidade de pedras do halo do colar são aproximadas, não contagens certificadas. No rubi, a montagem também foi reconstruída a partir de referências visuais.

O renderizador traça luz através das faces convexas até um **ambiente de iluminação procedural**. Não traça todos os objetos da cena através da gema, não calcula cáusticas físicas, birrefringência, inclusões reais ou resposta espectral calibrada. A cor observada na tela não é garantia gemológica. Não representa uma cópia óptica fiel do produto.

Em dispositivos sem WebGL suficiente, o modo de compatibilidade desenha a geometria em Canvas2D e informa claramente **que não há refração nesse modo**. Não oferece a mesma aparência do modo óptico.

O relatório da Paraíba solta é a imagem fornecida pelo proprietário, não uma autenticação online. Há indicação de melhoria de pureza no documento. Para rubi e colar, a existência de relatórios GIA foi informada, mas os arquivos correspondentes ainda precisam ser anexados. Não confundir relatório de uma gema com certificação de todos os componentes da joia.

## 6. Atualizar uma instalação v1 ou v2

As sementes novas são aplicadas automaticamente somente em uma instalação sem produtos. Para um banco já existente, pare o servidor, faça backup do diretório de dados e da mídia, substitua os arquivos do projeto preservando `.env` e `data/` e execute:

```sh
npm run upgrade:visuals
# Revise a simulação. Para aplicar:
npm run upgrade:visuals -- --apply
```

O comando é idempotente: atualiza apenas mídia/classificação/modelos dos três cadastros conhecidos. Preserva preço, status, contatos e credenciais; não substitui CAD ou uploads customizados por uma reconstrução. Capas customizadas permanecem escolhidas. Antes de aplicar, escreve em `DATA_DIR` uma cópia privada das linhas que serão alteradas, para referência de recuperação. Essa cópia não substitui um backup completo e pode conter notas confidenciais.

Para atualizar apenas os textos padrão de uma instalação anterior:

```sh
npm run upgrade:content
# Após revisar a simulação:
npm run upgrade:content -- --apply
```

Esse comando só substitui os textos iniciais conhecidos; conserva conteúdo personalizado, contatos, preços, disponibilidade e credenciais. Gera uma cópia privada da configuração anterior em `DATA_DIR`. As novas seções e a retirada dos nomes da assinatura vêm nos templates, independentemente da migração. Interrompa o servidor e faça backup antes de substituir arquivos e executar atualizações.

## 7. Desenvolvimento e verificação

```sh
npm run check
npm test
npm run build:viewer
npm run build:preview
```

`build:viewer` recompila `public/assets/viewer.js` a partir dos quatro arquivos de `src/`, sem dependências externas. `build:preview` também gera `preview-dist/index.html` autônomo.

Os GLBs prontos estão em `public/models/`. A regeneração é opcional:

```sh
python3 -m pip install numpy scipy
npm run build:models
npm run build:preview
```

Não é necessário Python para executar o site. Não use apenas o gerador v1 `build_model.py`: o gerador v2 o reutiliza e substitui a geometria óptica simplificada.

`tests/` contém os testes automatizados, incluindo o servidor com dados temporários e verificações de conteúdo. A v3 passou em 17 testes de Node e 22 verificações da interface da prévia. O Chromium foi usado para renderizar fixtures em memória, inclusive em largura de 390 px; a navegação por URL local está restrita no ambiente de teste. No harness de interface, os bytes de MP4 foram omitidos para reduzir uso de memória; a entrega mantém os vídeos completos. Não equivale a teste de iPhone físico, Safari, entrega real de e-mail ou todas as GPUs. Consulte `qa/VERIFICATION.md` para o escopo exato.

## 8. Publicação e armazenamento

**Este servidor completo ainda usa SQLite e uploads em disco persistente.** Publique em ambiente Node com volume persistente, HTTPS, controles de acesso, backups e configuração de e-mail.

Não envie o servidor completo à Vercel esperando que as edições do painel persistam automaticamente. Para uma implantação serverless definitiva, ainda é necessário migrar o banco, sessões e uploads para serviços adequados. O ZIP Vercel desta entrega é exclusivamente a prévia estática, sem autenticação ou persistência de produção.

O projeto não contém chave de e-mail, banco de clientes, senha real ou arquivos de fonte tipográfica. Use fontes do sistema ou adicione posteriormente uma fonte com licença apropriada. Nenhuma publicação ou envio de e-mail foi feito nesta entrega.
