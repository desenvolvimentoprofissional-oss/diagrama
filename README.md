# diagrama.ai

Estúdio de documentos institucionais: importar, entender, planejar, compor, renderizar, conferir e
aperfeiçoar. O padrão automático é a publicação diagramada do PDP aprovada pelo CRA-SP: capa,
identidade visual, logotipo, Libre Franklin, azul e dourado, grafismos, hierarquia, sumário e rodapé.
**Nenhuma orientação de prompt é necessária para obter esse padrão.**

## Usar e publicar

1. Sincronize e publique `desenvolvimentoprofissional-oss/diagrama` e a atualização compatível em
   `desenvolvimentoprofissional-oss/crasp-work`.
2. Nos Secrets **do Diagrama**, mantenha `OPENAI_API_KEY`. `OPENAI_MODEL` é opcional; o padrão é `gpt-5`.
   O modelo precisa aceitar Responses API, visão e saídas estruturadas. A API tem cobrança própria.
3. No Work, mantenha `CS_IDP_WORK` e `SDK_IDP_WORK`, já usados pelo Apresenta.ai. Esses JSON completos
   permanecem apenas no Work e devem pertencer ao Firebase `idp-work`.
4. No Work, `VITE_DIAGRAMA_URL` deve ser a URL pública real do Diagrama. Mantenha a permissão
   **Ferramentas → Diagrama → gravação**. A atualização desta versão não cria nova permissão nem muda
   o projeto Firebase. O guia de ativação original está em `crasp-work/config/diagrama.md`.
5. Abra **Ferramentas → Diagrama** e importe o documento. Com a OpenAI configurada, o envio já inicia
   a geração e a conferência no padrão aprovado. O campo de orientações é opcional e serve para adaptações.
   O botão **Gerar documento** permite refazer a composição. A origem continua disponível para conferência.

A sessão é a do Work. Não há novo login e nenhuma credencial administrativa do Firebase é enviada ao
editor. A chave da OpenAI fica no servidor, sem prefixo `VITE_`.

## Processo de geração

- **Leitura estrutural:** considera metadados reais, identifica o título do documento completo, reúne
  capítulos e subtítulos, separa paginação e cabeçalhos recorrentes e recupera tabelas quando existem
  evidências suficientes. A limpeza fica registrada nas observações da origem.
- **Planejamento global:** a OpenAI examina finalidade, públicos, estrutura, condições e relações do
  documento inteiro e recebe páginas reais do modelo aprovado como referência de composição.
- **Composição:** a IA produz componentes nativos com referências à origem. Processos explícitos com
  etapas exigem representação de suas relações; requisitos paralelos não são convertidos em sequências.
- **Conferência:** o servidor mede limites, cortes, sobreposições, títulos isolados e conexões; compara
  o significado com a origem e envia as páginas reais renderizadas para inspeção visual pela OpenAI.
- **Refinamento:** até dois ciclos adicionais de correções localizadas, respeitando o prazo disponível,
  mantêm a melhor versão conferida. Apontamentos restantes são apresentados; não são ocultados.
- **Entrega:** o resultado só é aplicado no editor após a resposta completa. Erro, cancelamento ou
  conexão interrompida preservam o documento anterior. As etapas e contagens exibidas são reais.

O modo padrão é **explicativo**, correspondente à publicação comentada aprovada. Ele permite melhorar
a redação sem inventar fatos, requisitos, exceções, prazos ou decisões. O modo **integral** mantém a
redação e a sequência do corpo importado; divergências de conteúdo impedem sua exportação.

## Word e PDF

A prévia e o PDF usam o mesmo mecanismo de composição A4. Os infográficos possuem elementos e
conexões editáveis no projeto; imagens de conteúdo são preservadas. A capa usa a arte decorativa
extraída do modelo aprovado, com título e subtítulo novos como texto nativo.

O Word contém texto, tabelas, cartões e relações editáveis, fontes incorporadas, marca automática,
capa institucional e um único campo de sumário. O servidor usa sua renderização real para conferir
texto, limites e páginas do sumário. Conexões não lineares são apresentadas por ligações explícitas
entre origem, condição e destino, sem inventar caminhos entre ramos. A edição posterior no Word pode
alterar sua paginação; o PDF é a referência de publicação.

**A conferência real do Word requer LibreOffice e Poppler no servidor.** O `Dockerfile` incluído instala
LibreOffice Writer, Poppler, Chromium e fontes, sem depender de Secrets durante o build. `npm run dev`
e `npm start` também funcionam em hospedagens com runtime próprio; nesse caso, o provedor precisa
fornecer essas ferramentas para conferir o Word. A aplicação informa quando elas não estão disponíveis
ou quando a conferência falha; não trata disponibilidade como aprovação.

Caminhos opcionais no servidor: `LIBREOFFICE_PATH`, `PDFTOPPM_PATH` e `CHROMIUM_PATH`.

## Limites operacionais

- Importação DOCX/PDF: até 20 MB; PDF de até 150 páginas. OCR real com OpenAI: até 20 páginas.
- Uma geração: até 2.000 componentes de origem e 240 mil caracteres; documentos maiores devem ser
  divididos em volumes. A análise de documentos extensos usa contexto global e relê todos os trechos.
- Conferência visual: todas as páginas renderizadas, até 120 por formato, em lotes de até seis.
- Prazo total de geração: nove minutos. Uma geração por instância; chamadas independentes à OpenAI têm
  concorrência limitada e tratamento de limites de taxa. Cancelamentos interrompem novas operações.
- A hospedagem HTTP precisa permitir o tempo de processamento, recomendado **600 segundos** ou mais,
  e memória suficiente para Chromium e LibreOffice, recomendado **1 GiB** ou mais. Streaming evita
  espera sem informação, mas não substitui o timeout máximo do provedor.
- Projeto editável: até 32 MB de JSON antes de compressão. Imagens PNG, JPEG e WebP com limites de bytes
  e dimensões; GIF importado é normalizado para imagem estática com aviso.

PDF não contém necessariamente a estrutura original de parágrafos e tabelas. OCR e documentos com
caixas de texto, alterações controladas ou recursos especiais exigem atenção às observações. Dados
ilegíveis ou ausentes são assinalados, nunca completados por invenção.

## Armazenamento e segurança

Os metadados ficam na coleção `documentos` do `idp-work`; fonte, conteúdo e configurações ficam em
snapshots JSON comprimidos e privados no Storage. Não há subcoleções. O Work confirma sessão,
permissão, titularidade, revisão e identificador de salvamento. Conflitos permitem salvar uma cópia.

O servidor do Diagrama exige autorização RSA de cinco minutos emitida pelo Work, restrita à origem
configurada e ao processamento. Valida assinatura pelos certificados públicos do Google, projeto,
público, escopo e validade. O navegador não recebe tokens Firebase ou chaves privadas. As chamadas à
OpenAI usam `store:false`; documentos e imagens são dados, não instruções para a IA.

## Desenvolvimento e verificação

Node 22.13 ou superior:

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
npm start
```

`npm run preview` também serve o cliente e as APIs compiladas. Build e inicialização não dependem da
OpenAI ou do Firebase estarem configurados. O Chromium empacotado é usado quando não há executável do
sistema. A publicação Docker precisa de rede para instalar dependências npm e pacotes Debian.

Os testes cobrem estrutura, preservação, planejamento, relações, transporte, permissões, composição,
exportação nativa e renderização real do Word quando as ferramentas estão presentes. A validação com
uma chave OpenAI real e a gravação de novos diagramas no Firebase dependem do ambiente publicado.
