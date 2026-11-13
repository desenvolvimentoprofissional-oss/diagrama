# diagrama.ai

Editor A4 para importar Word/PDF, organizar documentos com a OpenAI, editar componentes nativos e
exportar PDF ou Word. Os projetos são salvos pelo Work no Firebase **idp-work**, com a sessão já
existente. Não há outro login.

## Publicar no AI Studio

1. Sincronize e publique este repositório e a integração em `desenvolvimentoprofissional-oss/crasp-work`.
   Publique também as regras atualizadas do Firebase principal do Work, que aceitam a nova permissão
   `ferramentas_diagrama`. O guia do Work distingue essas regras das proteções do `idp-work`.
2. Nos Secrets **do Diagrama**, cadastre `OPENAI_API_KEY`. Opcionalmente, configure `OPENAI_MODEL`
   com um modelo que aceite Responses API, visão e saídas estruturadas; o padrão é `gpt-5`.
3. No Work, mantenha `CS_IDP_WORK` e `SDK_IDP_WORK`, já utilizados pelo Apresenta.ai. São os JSON
   completos da Conta de Serviço e do SDK Web, ambos do `idp-work`. Não copie esses Secrets para o Diagrama.
4. Configure no Work `VITE_DIAGRAMA_URL` com a URL pública real do editor e republique o Work.
   O endereço padrão da integração é `https://diagrama-crasp.ai.studio`; altere-o se o publicado for outro.
5. Conceda a permissão **Ferramentas → Diagrama → gravação**. Administradores de nível 1 mantêm acesso.
   Abra **Ferramentas → Diagrama**, importe o documento, edite e clique **Salvar no Work**.

A API OpenAI tem cobrança própria. A chave é utilizada somente no servidor e não entra no código
publicado para o navegador. O servidor inicia sem a chave; a geração e o OCR informam que ela está
pendente, em vez de produzir conteúdo substituto.

## Fluxo editorial

- **Integral:** o texto importado mantém sua redação e sequência. A IA escolhe destaques e componentes,
  mas o servidor recupera literalmente as palavras da origem. O sistema rejeita planos que omitam,
  dupliquem ou reordenem trechos. Edições manuais são sinalizadas e divergências impedem exportação
  enquanto o documento permanecer no modo integral.
- **Explicativo:** a reescrita é autorizada pelo modo escolhido. Os componentes conservam referências
  aos trechos que os fundamentam; a conferência editorial de sentido continua necessária.
- **Editor:** capa, sumário, títulos, textos, listas, destaques, cartões, fluxos, tabelas e imagens;
  edição, inclusão, remoção, duplicação e ordenação. Cores, organização, logo e tamanho de fonte editáveis.
- **Paginação:** páginas A4 medidas no navegador, com a mesma função no editor e no PDF. Parágrafos e
  tabelas longos continuam em outras páginas; cabeçalhos de tabela se repetem. Fontes são carregadas
  antes da medição. A conferência examina os limites dos elementos antes de emitir o PDF.
- **Verificar:** cruza origem e conteúdo e envia imagens das páginas renderizadas à OpenAI para inspeção
  visual, em lotes de até seis. A revisão visual admite documentos de até 60 páginas por execução;
  documentos maiores precisam ser divididos. Problemas são apresentados, sem alterações automáticas.
- **Exportação:** PDF com texto selecionável e sumário com links; DOCX com parágrafos, tabelas, cartões e
  fluxos editáveis. O Word usa paginação própria e seu sumário é um campo que deve ser atualizado no Word.

## Importação e limites

Envie `.docx` ou `.pdf` de até 20 MB. DOCX possui validação do arquivo compactado e preserva a ordem
extraída de parágrafos, títulos, listas, tabelas e imagens. Word com recursos especiais, como caixas de
texto, alterações controladas, notas ou cabeçalhos complexos, exige conferência da importação.

PDF tem limite de 150 páginas. A ordem de leitura, tabelas e símbolos dependem da estrutura original.
PDFs que precisem de OCR utilizam a OpenAI de verdade, com limite de 20 páginas e aviso de conferência
obrigatória da transcrição. O OCR não transforma imagens e diagramas digitalizados em desenhos editáveis.
Imagens enviadas ao editor devem ser PNG, JPEG ou WebP; não há download de imagens por URL externa.
Os infográficos gerados pelo editor são componentes nativos; fotos permanecem imagens.

O documento aprovado do PDP serviu de referência visual: Libre Franklin, azul institucional, destaque
dourado, padrão geométrico, cabeçalho e numeração. Isso oferece uma base comum; documentos com conteúdo
ou estrutura diferentes ainda exigem a revisão das páginas antes da publicação.

## Armazenamento e autorização

A coleção **`documentos`** do `idp-work` contém metadados e revisões. O projeto completo — fonte,
componentes, imagens e tema — fica comprimido no Storage privado, em snapshots imutáveis, com limite
32 MB antes da compressão. Não são criadas subcoleções. O Work verifica sessão, permissão e titularidade.
Revisões e identificadores de salvamento evitam sobrescrita concorrente e duplicação em tentativas repetidas.
A confirmação de salvamento só aparece após o servidor responder. Conflitos permitem salvar uma cópia.

O Diagrama recebe do Work uma autorização RSA assinada de cinco minutos, restrita ao processamento.
Não recebe tokens Firebase, chave privada nem credenciais administrativas. Seu servidor verifica os
certificados públicos do Google, projeto emissor, assinatura, escopo, origem e validade antes de importar,
gerar, revisar ou exportar. Os dados enviados à OpenAI usam `store:false`. Arquivos e textos importados
são tratados como dados e não como instruções para a IA.

Detalhes da ativação e das permissões: `crasp-work/config/diagrama.md`.

## Desenvolvimento

Requer Node 22.13 ou superior.

```sh
npm ci
npm run dev
```

`npm run build` compila o cliente e o servidor. `npm start` ou `npm run preview` serve o resultado completo,
incluindo as APIs. Os comandos não dependem da OpenAI nem do Firebase durante o build.
PDF usa Chromium instalado no sistema ou o executável empacotado de `@sparticuz/chromium` em Linux x64.
`CHROMIUM_PATH` pode indicar outro executável disponível. Arquivos de fonte e identidade visual são locais.

```sh
npm run lint
npm test
npm run build
```

Os testes cobrem preservação de texto, importação real, DOCX nativo, contratos da OpenAI, auditoria de
integridade, assinatura RSA, negação de processamento sem autorização e estado de salvamento.
A geração real pela OpenAI e a gravação na nova coleção precisam ser verificadas depois da publicação,
com os Secrets da instalação. Não se substituem esses serviços por respostas simuladas.
