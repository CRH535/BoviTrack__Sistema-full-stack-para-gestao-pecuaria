# BoviTrack

## Ambiente e escopo

- O projeto usa React e Vite no frontend, Node.js e Express na API e PostgreSQL no Supabase. Frontend e API têm projetos separados na Vercel.
- Confirme a branch de trabalho e a branch de produção no Git antes de qualquer operação de publicação. Consulte os `package.json`, lockfiles e migrations do checkout atual para identificar comandos e versões.
- Ao modificar uma funcionalidade, acompanhe o caminho afetado da interface até a API e o banco. Preserve os contratos existentes sempre que o pedido não exigir mudança.

## Dados e permissões

- Em alterações que envolvam propriedades, animais ou registros relacionados, confira quem pode ler e modificar cada recurso.
- Valide o isolamento com dois usuários comuns fictícios ligados a propriedades diferentes. Quando o comportamento administrativo for afetado, valide também o papel de administrador.
- Em mudanças de schema, grants ou RLS, verifique o comportamento com a role usada pela aplicação. Valide em desenvolvimento ou homologação e registre a ordem de aplicação e os requisitos de compatibilidade antes do deploy.
- Em mudanças de exclusão de contas ou propriedades, confira os registros relacionados, o efeito da cascata e a informação exibida na tela de confirmação.

## Interface e datas

- Preserve os padrões visuais e de navegação das telas existentes. Em mudanças de layout, confira o fluxo em desktop e celular. Para ícones e animações, examine a tela em execução.
- Em campos de data sem horário, valide cadastro, resposta da API e exibição após recarregar a página. Inclua o fuso `America/Sao_Paulo` quando a tarefa envolver o calendário, como na próxima dose de vacinação.

## Validação e publicação

- Execute os scripts pertinentes declarados pelo frontend e pela API. Para regressões de interface, use o preview ou o ambiente local com dados de teste.
- Se houver autorização para publicar, confira o commit, os projetos de frontend e API, o ambiente de destino e o banco usado pela API. Após o deploy, valide o fluxo alterado no ambiente autorizado.
- Ao concluir, informe a branch e o commit de referência, o que foi validado e qualquer ponto que ainda dependa de homologação.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
