# Verificações e limites desta entrega

## Executado

- TypeScript, build do cliente e do servidor.
- 93 testes automatizados do Diagrama, incluindo renderização real de Word e transporte em streaming.
- 50 testes backend do Work, incluindo projetos legados, novos diagramas, titularidade e revisões.
- Navegador em computador e celular, sem erro JavaScript ou transbordamento horizontal nos fluxos conferidos.
- Exportação PDF e Word por código compilado com as mesmas opções de publicação do servidor.
- Caso de aceitação com fonte institucional real: 17 páginas de PDF e 17 páginas do Word renderizado;
  92 componentes de origem, dois infográficos, tabela intacta e páginas dos títulos e do sumário conferidas.
- Arquivos aprovados e `AGENTS.md` preservados.
- Auditoria npm de dependências de produção sem vulnerabilidades reportadas no momento da execução.

## Não executado ou não concluído neste ambiente

- Chamada real à OpenAI: não havia `OPENAI_API_KEY` disponível no ambiente de desenvolvimento.
  A chave configurada no AI Studio não é copiada para este ambiente. Os testes de contrato e o caso
  editorial de aceitação não substituem a validação de uma geração real no ambiente publicado.
- Gravação de diagramas novos no Firebase de produção: depende da publicação do Diagrama e do Work,
  com os Secrets e permissões existentes da instalação.
- Construção completa da imagem Docker: as tentativas foram interrompidas por falha de DNS do
  ambiente Docker ao acessar os repositórios Debian. O build npm e os executáveis de renderização
  instalados neste ambiente foram verificados separadamente. A imagem Docker não foi declarada validada.

O padrão institucional está no código e nas referências locais, sem exigir prompt. As orientações
opcionais do usuário alteram a apresentação quando solicitadas. A revisão automática apresenta os
problemas remanescentes e não constitui garantia de perfeição editorial para todo documento possível.
