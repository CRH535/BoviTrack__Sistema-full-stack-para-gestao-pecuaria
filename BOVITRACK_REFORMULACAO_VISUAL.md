# BoviTrack — Reformulação Visual

Reformulação realizada na branch `design/reformulacao-visual`, a partir de `62235a9`. O trabalho preserva React, Vite, Axios, Express, pg/PostgreSQL, autenticação e regras de autorização. A interface usa as APIs existentes; backend e migrations permanecem sem alterações nesta missão.

## Design System

Os tokens ficam em `frontend/src/styles/tokens.css`. O layout compartilhado está em `styles/layout.css` e os componentes de consulta em `styles/ui.css`, mantendo o CSS tradicional do projeto.

| Elemento | Definição |
| --- | --- |
| Identidade | Verde `#087443`, superfícies brancas, fundo `#f6f8fa`, texto slate `#152238` |
| Semântica | Vermelho para erro/atenção sanitária, amarelo para acompanhamento e azul para informação |
| Tema escuro | Fundo `#111b26`, superfícies `#192532`, texto `#e9f0f5`, destaque verde `#86dfb1` |
| Tipografia | Pilha Inter/system-ui/Segoe UI, sem download de fontes; títulos até 32 px, texto 15 px, contexto 12–13 px |
| Espaçamento | Escala de 4, 8, 12, 16, 20, 24 e 32 px, aplicada por variáveis nos componentes novos |
| Radius | 7 px nos controles, 12 px nos painéis e 20 px em superfícies maiores |
| Sombras | Sutis, compartilhadas por tokens; foco visível e hover discreto |
| Layout | Sidebar de 236 px; drawer até 1024 px; organização mobile até 640 px; painéis adaptam em telas intermediárias e largas |
| Movimento | Interações curtas; respeito a reduced motion; duração e comportamento da animação especial preservados |

## Componentes criados

- `LayoutApp`, `AppSidebar`, `Marca` e `Icone`: layout, navegação, busca real de animais, identidade e ícones SVG consistentes.
- `Card`, `Kpi`, `EstadoVazio`, `Carregamento`: superfícies, indicadores, estados vazios e skeletons.
- `FormularioCadastro`: cadastro recolhido, abertura na edição e acesso por ações rápidas.
- `TabelaResponsiva`, `Paginacao`, `ColecaoRegistros`: consulta, busca, paginação e apresentação adequada ao tamanho da tela.
- `Abas`, `ListaAnimais`, `ResumoAnimal`, `VacinacaoAnimal`: organização do rebanho e da ficha individual.
- `DashboardConteudo`, `Distribuicao`, `PainelFinanceiro`, `Lancamentos`: composição dos painéis com os dados disponíveis.
- `ControleLeiteiro`: extraído da ficha, mantendo registro, edição, exclusão e filtros de ordenhas.
- `useMensagem` e `useLarguraGrafico`: feedback semântico e escala legível dos gráficos responsivos.

## Telas reformuladas

| Tela | Mudança principal |
| --- | --- |
| Dashboard | Cinco KPIs, central de atenção, agenda, distribuição por sexo, finanças, ações rápidas e pesagens recentes |
| Animais | Busca, filtros de propriedade/lote/sexo, ordenação, paginação, tabela desktop e cartões mobile |
| Ficha do animal | Identificação, resumo, gráficos, próximas ações e abas Resumo/Pesagens/Vacinação/Desmama/Produção/Histórico |
| Propriedades | Cadastro recolhido, busca e paginação; clima, edição e exclusão com preview preservados |
| Lotes | Consulta mais clara, busca e paginação; gerenciamento de vínculos preservado |
| Vacinas | Catálogo com busca, paginação e cadastro/edição recolhidos |
| Vacinações | Consulta sanitária, busca, cadastro/edição e entrada pela ficha com animal selecionado |
| Produção | Entrada pelo menu para selecionar o animal e acessar o controle leiteiro individual |
| Pesagens | Filtros, registros, formulários e gráficos integrados ao sistema visual |
| Desmamas | Planejamento, conclusão, registros e alertas com linguagem visual consistente |
| Despesas | Busca, paginação, valores e ações mais legíveis; CRUD preservado |
| Produção e resultados / Lucros | Filtros antes dos KPIs, gráfico mensal, despesas por categoria, lançamentos e CRUD de receitas |
| Configurações | Temas claro/escuro/sistema, previews, foco e tutorial com os tokens novos |
| Minha Conta | Identificação, dados, formulário e zona de exclusão com estilos compartilhados |
| Usuários | Tabela com ações claras e apresentação em cartões no mobile; permissões administrativas preservadas |
| Login | Composição, identidade, campos e imagem otimizada; animação especial preservada |
| Cadastro | Mesma linguagem do login e campos legíveis em telas pequenas |

## Melhorias mobile

O drawer mantém os rótulos da navegação, usa modal nativo, fecha com Escape e devolve o foco ao acionador. As tabelas de animais e lançamentos viram cartões; colunas secundárias são reduzidas no tablet. A ordenação de animais continua disponível por select no celular. Formulários recolhidos deixam a consulta acessível antes do cadastro.

As abas podem ocupar duas linhas, os detalhes do animal usam duas colunas quando couberem e os gráficos ajustam sua área de desenho ao contêiner. O gráfico financeiro reduz a quantidade de meses visíveis em telas menores, mantendo todos os lançamentos acessíveis na lista. Textos longos podem quebrar sem expandir a página.

## Melhorias dark mode

As mesmas geometrias usam superfícies navy/slate, bordas discretas e texto claro. Verde, vermelho, amarelo e azul têm tokens equivalentes. Inputs, badges, gráficos, drawer, formulários, login e cadastro acompanham o tema escolhido.

## Acessibilidade

Labels, foco visível, skip link, headings, status e alertas foram preservados ou consolidados. Abas têm tablist/tab/tabpanel, seleção e navegação com setas/Home/End. O drawer e as confirmações mantêm navegação por teclado e retorno de foco. Pontos de gráficos mostram valores por foco ou toque. A animação continua respeitando reduced motion.

A validação cobre o comportamento observado no Chromium e inspeção visual de contraste e legibilidade; não representa certificação formal de acessibilidade.

## Dados e comportamento

KPIs vêm do resumo autorizado do backend. A distribuição usa sexo ou propriedade cadastrados. Alertas refletem próximas doses, desmamas planejadas e ausência de pesagem recente. A ficha apresenta registros reais de pesagem, vacinação, desmama e leite.

No financeiro, os totais continuam vindo da API. O detalhamento agrupa receitas e despesas autorizadas; filtros seguem o calendário `America/Sao_Paulo`, padrão desta instalação. Categoria filtra receitas, enquanto despesas do período continuam abrangendo todas as categorias, conforme a regra existente. A soma dos gráficos utiliza centavos, e resultados negativos ficam explícitos. Produção leiteira permanece individual, compatível com as APIs atuais.

## Performance

- Nenhuma dependência de produção adicionada.
- Ícones PNG deixaram de ser importados pelo componente compartilhado e foram substituídos por SVGs.
- Imagem servida no login: 2.426,45 kB → 295,10 kB; o PNG original foi mantido como fonte.
- Chunk inicial da ficha: 43,34 kB → 18,57 kB; controles de pesagem, desmama e leite carregam ao abrir suas abas.
- Entrada principal do build final: aproximadamente 319,78 kB / 104,79 kB gzip; CSS aproximadamente 80,15 kB / 15,88 kB gzip.
- Consultas independentes dos painéis novos são paralelas e canceláveis; listas renderizam a página selecionada.

## Skills utilizadas

- **Graphify**: consulta da arquitetura antes da refatoração e atualização AST do grafo.
- **vercel:react-best-practices**: revisão de efeitos, callbacks, consultas paralelas, carregamento sob demanda e estrutura dos componentes.

Playwright foi utilizado como ferramenta equivalente de browser/E2E. Prettier foi utilizado para organização do código. A revisão do diff foi direta. As skills frontend-design, playwright-cli, code-review e find-docs não estavam instaladas; não foram declaradas como utilizadas.

## Testes

| Check | Resultado |
| --- | --- |
| Lint | Aprovado, sem erros ou avisos |
| Build Vite | Aprovado |
| Testes frontend | 8 aprovados, incluindo isolamento de sessão, calendário financeiro, centavos e lucro negativo |
| Testes backend offline | Aprovados: segurança, cálculos, clima, exclusão e regressões |
| Integração PostgreSQL | 212 verificações aprovadas; schema, reaplicação da migration existente e relações validados |
| Guard de isolamento | URLs externas, protocolos inválidos e parâmetros que alteram host rejeitados |
| Auditoria npm frontend/backend | 0 vulnerabilidades reportadas |
| E2E de fluxos | 84 cenários aprovados nos sete viewports |
| Escala temporal e foco do gráfico | 7 cenários adicionais aprovados nos sete viewports |
| Auditoria visual final | 7 execuções aprovadas, 238 capturas permanentes dos dois temas, sem overflow ou erro de execução |

Viewports: **1920×1080, 1366×768, 1024×768, 768×1024, 430×932, 390×844 e 360×800**. A auditoria percorre todas as telas nos dois temas, incluindo login/cadastro escuros. Verifica overflow e erros de execução. Os fluxos exercitam autenticação/F5/logout, cadastro, edição, exclusão, filtros, ordenação, paginação, produção, receitas, vínculos de lotes, desmama, vacinação e teclado.

Todos os testes que escrevem dados usam Express e PostgreSQL reais em um banco local criado e removido pelo runner. Os registros das capturas são fixtures desse banco, não dados do Supabase. Falhas de dashboard/lista são injetadas para testar recuperação; o clima externo retorna indisponibilidade controlada.

## Evidências locais

- `outputs/ui-audit/before/`: auditoria antes da reformulação.
- `outputs/ui-audit/after/`: capturas permanentes por viewport.
- `outputs/ui-audit/flows-report/index.html`: relatório dos 84 E2E.
- `outputs/ui-audit/chart-report/index.html`: relatório dos sete testes adicionais de escala/foco.
- `outputs/ui-audit/visual-report/index.html`: relatório visual final com screenshots anexados.

Evidências são locais e ficam fora do versionamento. O arquivo `CODEx_CONTINUIDADE_UI.md` registra o estado e o ambiente para retomar o trabalho.

## Pendências e limites

- Avaliação visual do usuário antes de promover a branch.
- Previsão meteorológica externa ao vivo não validada nesta missão; autorização, timeout, cache e estado de indisponibilidade foram testados.
- A extração SQL do Graphify depende de `tree_sitter_sql`, ausente neste ambiente. A atualização de código foi feita por AST, sem chamada de LLM.
- Outra configuração de timezone exige alinhar o calendário do detalhamento financeiro com o backend.

Não houve push, merge, deploy ou alteração da referência main. O Supabase não recebeu escritas destes testes.

## Teste local

Em dois terminais, a partir da raiz:

```powershell
npm start --prefix backend
npm run dev --prefix frontend
```

Para repetir a validação com banco descartável local em funcionamento:

```powershell
node scripts/test-isolated.cjs offline
node scripts/test-isolated.cjs e2e
```
