# Caso de aceitação — Cursos Livres e Trilhas de Aprendizagem

Este caso utiliza a minuta aprovada de seleção e participação de instituições em Cursos Livres e
Trilhas de Aprendizagem. Sua origem é o documento `minuta-resolucao-instituicoes-cursos-livres-trilhas-aprendizagem.docx`
do repositório institucional de Configurações; a fonte estruturada e o SHA-256 original estão no projeto JSON.
Nenhum documento aprovado foi alterado.

A elaboração editorial deste caso foi feita a partir da fonte para testar os componentes reais do
novo motor. **Não representa uma resposta da API OpenAI nem um teste da geração automática com uma
chave de produção.** Não há resposta simulada de provedor no aplicativo. A verificação com a chave da
instalação continua sendo uma etapa de validação do ambiente publicado.

Arquivos:

- `cursos-trilhas.project.json`: projeto nativo editável, com todos os vínculos à origem.
- `cursos-trilhas.pdf`: composição real do motor de prévia/PDF.
- `cursos-trilhas.docx`: Word nativo efetivamente renderizado e conferido por LibreOffice/Poppler,
  com o sumário corrigido pelas páginas reais do Word.
- `acceptance-report.json`: cobertura da origem e resultados das conferências executadas.

No caso verificado: 92 componentes de origem cobertos, nove artigos e dez cláusulas do anexo,
dois diagramas nativos e preservação da tabela original. PDF e Word renderizados possuem 17 páginas.
A conferência automática não identificou cortes ou perda de conteúdo, e a inspeção visual independente
verificou hierarquia, tabelas e o sentido das conexões dos fluxos.

Para reproduzir as exportações em Node com as dependências instaladas e as ferramentas de Word no PATH:

```sh
node --import tsx scripts/verify-acceptance.mts
```

O script não chama a OpenAI, não grava no Firebase e salva os resultados em uma pasta temporária.
