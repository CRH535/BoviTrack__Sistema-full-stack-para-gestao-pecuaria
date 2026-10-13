# Auditoria e correção da iconografia do BoviTrack

Data: 13/10/2026. Branch de entrega: `DEV`, criada a partir de `4eab00c` após autorização para preservar a versão visual atual e concluir suas alterações locais. A branch `main` não foi alterada. Não há push nem deploy nesta tarefa.

## Causa raiz confirmada

A investigação comparou a interface anterior (`62235a9`), a refatoração (`7214e24`) e o checkout atual. Foram encontrados problemas distintos:

1. **Marcação ausente:** várias ações e novas abas eram compostas somente por texto. Não existia uma camada compartilhada de composição dos botões. Alguns desses controles já não tinham ícones antes da refatoração; por isso não seria correto atribuir todas as ausências a imports perdidos.
2. **SVG de senha inválido:** o último comando de curva do contorno antigo do olho tinha parâmetros incompletos. A reprodução no Chromium gera `Error: <path> attribute d: Expected number`. A versão corrigida não gera erro. Evidência local: `outputs/iconografia/svg-probe.json`.
3. **Fragilidade do registro:** nomes desconhecidos retornavam `null`, deixando espaços vazios silenciosamente. Acesso por propriedades herdadas do objeto também não era validado.
4. **Dimensões dispersas:** a troca dos PNGs por SVGs manteve estilos herdados de imagens e não fornecia uma dimensão padrão para o componente.
5. **Problemas adicionais no mobile:** a primeira correção local usava `white-space: nowrap` em todos os botões compartilhados, fazendo o ícone de “Registrar vacinação” sair do link em 320px. No controle leiteiro, o botão mobile com largura 100% disputava a mesma linha com o título, ampliando a coluna do grid. Esses problemas foram reproduzidos e corrigidos.

Não foram encontrados imports de bibliotecas de ícones perdidos, arquivos de ícones removidos, 404 de imagens ou CSS ocultando globalmente os SVGs do registro. Os 13 nomes antigos de `IconeImagem` permanecem compatíveis. Sidebar desktop, drawer fechado, formulários recolhidos e painéis inativos são ocultados intencionalmente pelo layout; seus controles aparecem nos estados correspondentes.

## Sistema utilizado e assets

O sistema consolidado é o registro de **SVGs próprios inline** em `frontend/src/components/Icone.jsx`, com `viewBox="0 0 24 24"`, `currentColor`, espessura 1,75 e dimensões padrão. Não há Lucide, React Icons, Font Awesome ou Material Icons no `package.json`; nenhuma biblioteca de ícones foi adicionada.

Foram preservados:

- `frontend/public/favicon.svg`, usado pela marca, login mobile e transições de login/logout;
- as imagens da tela de login;
- os 13 PNGs antigos em `src/assets/icons/pecuaria` e `src/assets/icons/sistema`;
- `IconeImagem` e `IconeConfiguracoes`, mantidos como adaptadores compatíveis.

`@babel/parser`, já presente transitivamente no ambiente, foi declarado explicitamente apenas em `devDependencies` para a auditoria estrutural do JSX. Não integra o bundle da aplicação.

## Correções

- Registro central ampliado, aliases compatíveis, fallback de alerta para nomes desconhecidos e aviso em desenvolvimento. A auditoria rejeita qualquer fallback nas telas reais; o fallback é exercitado somente pelo teste de regressão.
- `Button` compõe ícones e preserva texto, atributos, handlers, submit e estados. `IconButton` fornece nome acessível e tooltip. Loading preserva texto e respeita redução de movimento.
- `SearchInput` reserva espaço para a lupa sem sobreposição ao texto.
- `styles/icons.css` centraliza tamanhos de 16, 18, 20, 24, 28 e 36px, mantém os SVGs sem encolher e deixa as cores acompanharem o componente. Não há regra global agressiva sobre todos os SVGs.
- Ações de adicionar, editar, excluir, visualizar, salvar, cancelar, voltar, filtrar, limpar, ordenar e paginar passaram a compor os ícones explicitamente.
- Ícones incluídos nas abas da ficha, ações dos cards, manejo, produção leiteira, despesas/lucros, usuários, modais, tutorial e autenticação.
- Olho de senha corrigido e centralizado; engrenagem reutilizada; vacinação e desmama receberam identificação coerente.
- Ajuda recebeu círculo de interrogação; seletores de tema receberam sol, lua e monitor.
- Removida a restrição universal de quebra de texto nos botões; cabeçalho leiteiro ajustado especificamente para telas até 430px.
- `npm run build` executa a auditoria de nomes/imports/assets antes do Vite, detectando também diferenças de maiúsculas/minúsculas mesmo no Windows.

## Ícones adicionados

Foram acrescentados **24 desenhos** ao registro próprio, sem novas coleções externas:

| Uso | Nomes |
| --- | --- |
| Acesso e vínculos | entrar, retirar |
| Ações e filtros | editar, excluir, salvar, filtro, atualizar |
| Navegação e ordenação | voltar, avancar, ordenar, subir, descer |
| Ficha e manejo | concluir, resumo, historico, desmama |
| Estados e apoio | clima, tutorial, bloqueio, carregando, ajuda |
| Temas em Configurações | sol, lua, sistema |

Visualizar/ocultar reutilizam o desenho de senha; configurações reutiliza a engrenagem existente. Os demais símbolos de pecuária, navegação e finanças foram aproveitados do registro atual.

## Arquivos principais

- `frontend/src/components/Icone.jsx`, `IconeConfiguracoes.jsx`, `PasswordInput.jsx`, `VoltarInicio.jsx`;
- `frontend/src/components/ui/Button.jsx`, `SearchInput.jsx`, `Abas.jsx`, `Paginacao.jsx`, `TabelaResponsiva.jsx`, `ColecaoRegistros.jsx`;
- `frontend/src/styles/icons.css` e `frontend/src/main.jsx`;
- componentes de sidebar, dashboard, animais, manejo, clima, finanças e tutorial; páginas de gestão, autenticação e conta;
- `frontend/tests/icons.test.js`, `tests/e2e/icon-components.spec.js`, `iconografia.spec.js`, `icon-search.spec.js`, `final-flows.spec.js` e `tests/fixtures/icons.*`;
- `frontend/playwright.icons.config.js`, `package.json`, `package-lock.json` e `eslint.config.js`;
- este relatório, continuidade da UI, `.gitignore` de evidências e saídas do Graphify.

Backend, APIs, autenticação, permissões, migrations, banco de produção e assets de identidade não foram modificados. A revisão estrutural das alterações existentes confirmou **247 handlers preservados em 42 arquivos**.

## Validação reproduzível

```powershell
# Na pasta frontend
npm run lint
npm run test
npm run build

# Na raiz, com o cluster PostgreSQL local de testes em 55432
node scripts/test-isolated.cjs e2e --config=playwright.icons.config.js
$env:BOVITRACK_ICON_PRODUCTION = 'true'
node scripts/test-isolated.cjs e2e --config=playwright.icons.config.js
Remove-Item Env:BOVITRACK_ICON_PRODUCTION
node scripts/test-isolated.cjs e2e bovitrack.spec.js ui-interactions.spec.js final-flows.spec.js --project=1366x768 --project=390x844
```

O runner cria e remove exclusivamente um banco descartável local. A variante de produção define `NODE_ENV=production` apenas no frontend, executa `npm run build` e serve `dist/` com `vite preview`, usando a mesma API Express real do ambiente isolado. Não é um deploy na Vercel.

As matrizes de iconografia percorrem **320, 375, 425, 768, 1024 e 1440px**, em modo claro e escuro. Cobrem todas as páginas, seis abas da ficha, formulários abertos, edição, modal de exclusão, gestão de animais dos lotes, drawer e diálogos do tutorial. Conferem geometria, dimensões, visibilidade, cortes por controles/ancestrais, contraste mínimo 3:1 dos ícones habilitados, nomes acessíveis, overflow, imagens carregadas, erros de SVG e console.

O teste do registro renderiza todos os desenhos/aliases e testa nomes desconhecidos, inclusive `toString` e `__proto__`. Traços horizontais/verticais são geometria válida, mesmo quando uma dimensão do bbox sem stroke é zero.

São esperados apenas os 401 de verificação de sessão sem cookie em `/auth/refresh` e a falha 503 de clima explicitamente injetada pelo teste. Outros erros de recursos e exceções JavaScript são rejeitados. A análise de contraste é focada em ícones e superfícies da aplicação; não constitui certificação completa de acessibilidade.

## Resultados finais

| Verificação | Resultado |
| --- | --- |
| Build Vite de produção | Passou, com auditoria prévia; sem avisos relevantes de bundle/imports/assets |
| ESLint | Passou, sem erros ou avisos |
| Testes frontend | 10 passaram: 8 existentes e 2 de integridade estrutural |
| Componentes e páginas em desenvolvimento | 18 cenários distintos passaram nas seis larguras; 320px foi repetido após ajustar o teste de clipping para a top layer dos dialogs |
| Páginas no build de produção | 6 cenários passaram, um por largura, em dois temas |
| Busca de Pesagens/Desmamas no build final | 6 cenários adicionais passaram após o último rebuild, incluindo filtros e ausência de sobreposição da lupa |
| Fluxos reais em desktop/mobile | 24 cenários passaram em 1366×768 e 390×844 |
| Total E2E distinto validado | 54 cenários |
| Light mode / dark mode | Ícones visíveis, dimensões corretas e contraste mínimo verificado |
| Mobile / tablet / desktop | 320, 375, 425, 768, 1024 e 1440px verificados |
| Console e assets | Nenhum erro de SVG, nome desconhecido nas telas reais, import inválido ou 404 de imagens/ícones |
| Favicon e animações | SVG original preservado byte a byte, inclusive em dist; login/logout com imagem carregada e opacidade positiva |
| Busca final e revisão | Nenhuma referência quebrada conhecida; 247 handlers preservados em 42 arquivos |
| Graphify | Atualizado por AST: 1363 nós e 2447 arestas, sem custo de LLM |

O teste completo de páginas no preview precedeu somente a inclusão das lupas de Pesagens/Desmamas. Essas duas páginas foram testadas novamente no build final, nas seis larguras e nos dois temas. Os fluxos funcionais e a auditoria estrutural também foram executados após essas inclusões.

A primeira tentativa de preview herdou NODE_ENV=test do runner e foi descartada, pois não representava a compilação de produção correta. A configuração agora separa o ambiente do frontend do ambiente da API; o build final possui chunk principal de aproximadamente 322kB minificado, sem biblioteca de ícones nova.

Os cenários funcionais de falha injetam erros de API deliberadamente para validar recuperação. Suas mensagens de console são esperadas e não representam erros de ícones. O grafo mantém um aviso preexistente de extração SQL parcial por ausência de tree_sitter_sql; o frontend foi extraído, e não foram alterados arquivos de backend para tratar esse aviso.

Foram consolidados **914 estados distintos** de páginas/tema/resolução, **23571 instâncias de ícones** e **938 capturas**, incluindo 24 capturas finais dos campos de busca. Nenhum estado auditado possui falha remanescente.

Evidências locais, ignoradas pelo Git:

- [Galeria final com filtros de ambiente, resolução e tema](outputs/iconografia/index.html).
- [Auditoria de produção](outputs/iconografia/production-report/index.html).
- [Fluxos funcionais](outputs/iconografia/flows-report/index.html).
- [Inventário consolidado](outputs/iconografia/validation-summary.json).
- Inventários individuais em `after/<resolução>/inventory.json`, `production/<resolução>/inventory.json` e capturas finais em `search-results/`, dentro de `outputs/iconografia/`.

## Pendências e entrega

Não há referências quebradas conhecidas nem pendências de ícones dentro das telas e estados auditados. As correções foram validadas para entrega local na branch DEV. Não foi realizado push ou deploy na Vercel; a validação de produção utilizou o build Vite servido localmente.
