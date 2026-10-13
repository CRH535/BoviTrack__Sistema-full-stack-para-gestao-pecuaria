# Continuidade da reformulação visual

## Escopo e branch

- Missão: reformulação visual progressiva seguindo as quatro referências, preservando funcionalidades, APIs, autorização e animação de login/logout.
- Branch ativa: `design/reformulacao-visual`. Não existe uma branch local `DEV` neste checkout.
- Base verificada: `62235a9` (ponto de partida após a evolução funcional).
- Não editar main, fazer push ou deploy.
- Nunca imprimir `.env`. O backend local contém credenciais reais do Supabase; os testes devem usar exclusivamente `scripts/test-isolated.cjs`.

## Concluído

- Inspeção de Git, histórico e AGENTS.md.
- Graphify consultado para o layout, páginas e componentes compartilhados.
- Arquitetura React/Vite/Axios e CSS tradicional mapeada; controles individuais de leite, pesagem e desmama identificados.
- Referências analisadas: sidebar clara, verde, hierarquia forte, tabelas densas, ficha com abas e painéis sem métricas inventadas.
- Ferramentas conferidas: Playwright instalado; skills frontend-design/playwright-cli/code-review/find-docs ausentes. Graphify e vercel:react-best-practices disponíveis e lidas.
- Auditoria Playwright criada em `frontend/tests/e2e/visual-audit.spec.js`: todas as rotas nos dois temas e nos sete viewports, com banco PostgreSQL descartável local.
- Auditoria inicial concluída nos sete viewports antes da alteração da aplicação; capturas em `outputs/ui-audit/before/`.
- Design system, sidebar clara, drawer, busca funcional, componentes de consulta e feedback implementados.
- Dashboard reorganizado; Animais com filtros/ordenação/paginação/tabela e cartões mobile; ficha com seis abas.
- Controle leiteiro extraído e carregado sob demanda; produção continua individual, com acesso pela navegação.
- Propriedades/lotes/vacinas/vacinações/despesas com cadastro recolhido, busca e paginação; formulários/conta/configurações/usuários usam os tokens compartilhados.
- Finanças com filtros, totais da API, gráfico mensal, categorias e lançamentos. Valores negativos e falta de dados são explícitos.
- Login/cadastro reformulados; imagem otimizada de 2,43 MB para 295 KB. Transição completa de login/logout já validada em desktop e mobile.
- Erros agora usam aparência vermelha e role alert; nova tentativa limpa somente o erro anterior.
- Lint sem avisos, build, oito testes frontend, testes offline, isolamento e auditorias npm passaram.
- Integração PostgreSQL (212 verificações) e integridade passaram nesta execução. Backend e migrations não alterados.
- Graphify atualizado por AST: 1317 nós, 2306 arestas na atualização final. Não houve extração via LLM.

## Etapa atual

Reformulação concluída em 13/10/2026. Foram aprovados 84 cenários da suíte completa, mais sete testes de escala temporal/foco, totalizando 91 cenários E2E nos sete viewports. A auditoria visual final teve sete execuções aprovadas e 238 capturas permanentes, incluindo login/cadastro nos dois temas. A rodada anterior revelou uma suposição antiga do teste (animal novo sempre na primeira página); o teste agora utiliza a busca. Backend e regras de negócio permaneceram preservados.

## Próximas etapas

1. Ler `BOVITRACK_REFORMULACAO_VISUAL.md` e revisar as capturas de `outputs/ui-audit/after/`.
2. Fazer avaliação visual local com o usuário e tratar somente ajustes solicitados.
3. Não refazer os componentes já concluídos. Não fazer push, merge, deploy nem alterar main sem uma nova instrução explícita.

## Ajuste posterior: iconografia (13/10/2026)

- Concluída na DEV local, criada a partir de `4eab00c` com autorização para preservar a versão visual atual e suas alterações existentes. Main permanece em `62235a9`.
- Confirmadas ações/abas sem SVG, SVG antigo de senha com curva incompleta e omissão silenciosa de nomes desconhecidos. Corrigidos também nowrap dos botões e cabeçalho leiteiro em 320px.
- Registro próprio central, Button/IconButton/SearchInput, escala de tamanhos e ícones nas ações. Ajuda/temas e buscas de Pesagens/Desmamas completados; favicon, PNGs e identidade preservados.
- Prebuild verifica nomes/imports/assets e caixa exata dos caminhos. Nenhuma biblioteca de ícones nova; Babel parser explicitado somente como dependência de desenvolvimento para a auditoria JSX.
- Lint/build e 10 testes frontend passaram. Total de 54 cenários E2E distintos validados: 18 de desenvolvimento, 12 de produção e 24 fluxos em desktop/mobile. Seis larguras (320/375/425/768/1024/1440), claro/escuro, console, contraste, assets e favicon em login/logout verificados.
- 914 estados auditados, 938 capturas e nenhum erro remanescente de iconografia. Evidências: `outputs/iconografia/index.html`, `production-report/`, `flows-report/` e `validation-summary.json`. Relatório completo: `BOVITRACK_ICONOGRAFIA.md`.
- 247 handlers preservados em 42 arquivos; backend/APIs/autenticação/permissões/banco de produção intactos. Graphify atualizado por AST: 1363 nós, 2447 arestas; aviso preexistente de parser SQL ausente.
- Entrega em commit lógico na DEV após validação. Não houve push, merge, deploy ou alteração de main.

## Ambiente de testes

PostgreSQL 18 instalado. Cluster exclusivo de testes em `%LOCALAPPDATA%\Temp\bovitrack-evolution-20261012\pgdata`, porta 55432 em loopback.

```powershell
node scripts/test-isolated.cjs offline
node scripts/test-isolated.cjs e2e
```

O runner cria, prepara e remove um banco novo. Não usar `.env` real para testes que escrevem dados.

## Decisões de design

- Tokens existentes evoluem para verde/slate, superfícies brancas e bordas suaves; manter CSS tradicional e lazy routes.
- Sidebar desktop 236 px; drawer até 1024 px, com Escape, foco contido e retorno de foco.
- Formulários de cadastro recolhidos, edição expande e foca o primeiro campo.
- Não simular notificação, assinatura, foto, saúde/lactação ou comparação percentual.
- Produção permanece individual, pois a API atual fornece dados por animal; evitar N+1 para fabricar um painel agregado.

