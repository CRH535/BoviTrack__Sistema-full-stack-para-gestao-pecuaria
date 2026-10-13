# Navegação ilustrada do BoviTrack

Data: 13/10/2026. Branch: DEV. Base: `723ccd0`.

## Auditoria e escolha visual

O frontend possui 13 PNGs de módulos em `src/assets/icons/`, duas versões da imagem de login, o favicon em `public/favicon.svg` e o registro de SVGs funcionais em `components/Icone.jsx`. Não existem pastas adicionais `src/images/` ou `src/icons/`. A busca nos componentes mostrou que o menu desktop e o drawer mobile reutilizam `AppSidebar`; os atalhos do dashboard ficam em `DashboardConteudo` e os cards numéricos reutilizam `Kpi`.

A coleção de PNGs já existente usa objetos verdes com volume e fundo transparente. Ela foi priorizada, evitando uma coleção nova. Os originais de 320×320px são grandes para navegação: os nove arquivos selecionados somam 719666 bytes. Foram geradas versões WebP de 96×96px, qualidade 90, com transparência preservada, sem modificar os originais.

Dois nomes antigos não descrevem corretamente o conteúdo: `pecuaria/producao.png` é um gráfico de crescimento, adequado para Lucros; `pecuaria/identificacao.png` é um brinco, inadequado como balança. O elo de `animais-lotes.png` também não representa desmama. Os arquivos não foram renomeados ou apagados; o novo mapeamento usa seus conteúdos de forma explícita.

As mini ilustrações têm tratamento comum: objetos verdes, superfície neutra discreta, bordas arredondadas e tamanho fixo. Os SVGs complementares usam a mesma paleta, preenchimentos e sombreamento suave. Não há fotos grandes no menu.

## Assets reaproveitados e mapeamento

| Item | Representação | Fonte reaproveitada / adaptação | Asset utilizado |
| --- | --- | --- | --- |
| Dashboard | Casa rural com folha | `icons/sistema/inicio.png` | `navigation/dashboard.webp` |
| Animais | Cabeça de bovino | `icons/pecuaria/animais.png` | `navigation/animais.webp` |
| Propriedades | Fazenda, celeiro e pastagem | `icons/sistema/propriedades.png` | `navigation/propriedades.webp` |
| Lotes | Cerca e divisão de pastagem | `icons/pecuaria/lotes.png` | `navigation/lotes.webp` |
| Pesagens | Balança com mostrador | Desenho vetorial novo; não usa o brinco antigo | `navigation/pesagens.svg` |
| Desmamas | Bovino adulto e bezerro em duas escalas | Composição da mesma imagem de bovino, sem duplicar arquivo | `navigation/animais.webp`, duas instâncias |
| Vacinas | Frasco de medicamento veterinário | `icons/pecuaria/vacinas.png` | `navigation/vacinas.webp` |
| Vacinações | Seringa e frasco | `icons/pecuaria/vacinacoes.png` | `navigation/vacinacoes.webp` |
| Produção | Garrafa de leite | Silhueta existente de `Icone.jsx`, com preenchimento e rótulo | `navigation/producao.svg` |
| Despesas | Recibo e moedas | `icons/sistema/despesas.png` | `navigation/despesas.webp` |
| Lucros | Barras e seta de crescimento | Conteúdo de `icons/pecuaria/producao.png` | `navigation/lucros.webp` |
| Configurações | Engrenagem preenchida | Geometria existente de `Icone.jsx` | `navigation/configuracoes.svg` |
| Usuários / Minha Conta | Grupo de pessoas | `icons/sistema/usuarios.png` | `navigation/usuarios.webp` |

Todos os caminhos de assets da tabela são relativos a `frontend/src/assets/`.

O favicon/logo, a imagem de login e as animações de autenticação permanecem intactos. Sair, abrir/fechar menu, pesquisa, setas e ações de formulário continuam usando os SVGs funcionais existentes, adequados aos controles.

## Assets e arquivos novos

Em `frontend/src/assets/navigation/`:

- WebP reaproveitados/otimizados: `dashboard.webp`, `animais.webp`, `propriedades.webp`, `lotes.webp`, `vacinas.webp`, `vacinacoes.webp`, `despesas.webp`, `lucros.webp`, `usuarios.webp`.
- SVGs complementares: `pesagens.svg`, `producao.svg`, `configuracoes.svg`.
- Não existe um arquivo duplicado para Desmamas; a composição reutiliza `animais.webp`.

Código e validação novos:

- `frontend/src/components/IlustracaoModulo.jsx`: mapeamento único e composição das miniaturas; imagens decorativas com `alt=""` e `aria-hidden`, usando o nome do link como rótulo acessível.
- `frontend/src/styles/navigation-images.css`: tamanhos, temas, alinhamento e estados das imagens.
- `frontend/playwright.navigation.config.js` e `frontend/tests/e2e/navigation-images.spec.js`: auditoria das seis larguras, dois temas e dois perfis, em desenvolvimento e build de produção.
- Este relatório. Evidências locais em `outputs/navigation-images/`, ignoradas pelo Git.

## Componentes alterados

- `AppSidebar.jsx`: usa a camada ilustrativa no conteúdo compartilhado pelo desktop/drawer. Rotas, rótulos, atributos do tutorial, regras de perfil e handlers foram preservados.
- `DashboardConteudo.jsx`: usa as mesmas ilustrações nos cinco cards numéricos, alertas de manejo, quatro ações rápidas e links de pesagens recentes.
- `ui/Kpi.jsx`: recebe a opção `ilustrado`; os usos fora do dashboard mantêm sua apresentação anterior.
- `main.jsx`: importa o CSS específico depois dos estilos existentes.
- `tests/icons.test.js`: inclui o novo componente na auditoria estática de nomes. O prebuild continua verificando imports/assets com a caixa exata dos caminhos, inclusive no Windows.
- `.gitignore`: ignora capturas e relatórios locais desta validação.
- `graphify-out/`: atualizado por extração AST após a alteração de código.

Não foram alterados backend, banco de produção, autenticação, permissões, APIs, regras de negócio ou rotas. A revisão do diff confirmou os seis handlers dos quatro arquivos JSX existentes preservados.

## Resultado visual e comportamento

- Menu: moldura de 28×28px; conteúdo preserva a proporção. A distância para o texto foi ajustada para 9px, e as linhas permanecem em 42px de altura.
- Cards numéricos: imagem de 40px no desktop e 34px no mobile.
- Atalhos e alertas: imagem de 34px.
- Ativo: mantém o fundo e o peso de texto do menu existente e recebe uma borda discreta na miniatura.
- Hover/foco: mantém o comportamento do link e destaca a borda da miniatura.
- Claro/escuro: a superfície neutra permite ver objetos verdes, brancos e escuros sem inverter artificialmente as imagens.
- Não há uma versão colapsada adicional no projeto: até 1024px o menu passa para o drawer, que usa a mesma composição e mantém sua rolagem interna.

## Performance

| Medida | Resultado |
| --- | --- |
| Nove PNGs originais selecionados | 719666 bytes |
| Nove WebP de navegação | 28712 bytes, redução de aproximadamente 96% |
| Três SVGs complementares | 3146 bytes |
| Coleção completa | 31858 bytes, aproximadamente 32KB |
| Maior WebP | 3854 bytes |
| JavaScript principal | Aproximadamente 323,37KB minificado, aumento de cerca de 1KB em relação à base |

As imagens são importadas com `?no-inline`, emitidas pelo Vite com nomes contendo hash e compartilhadas entre menu/card/drawer. Assim, não viram grandes strings dentro do JavaScript e o navegador reutiliza os mesmos arquivos em cache. Nenhuma dependência de runtime foi adicionada. Sharp CLI foi usado somente como ferramenta temporária de conversão, sem alterar `package.json` ou o lockfile.

## Validação reproduzível

```powershell
# Na pasta frontend
npm run build
npm run lint
npm test

# Na raiz, com o cluster PostgreSQL local de testes na porta 55432
node scripts/test-isolated.cjs e2e --config=playwright.navigation.config.js
$env:BOVITRACK_NAV_PRODUCTION = 'true'
node scripts/test-isolated.cjs e2e --config=playwright.navigation.config.js
Remove-Item Env:BOVITRACK_NAV_PRODUCTION
node scripts/test-isolated.cjs e2e ui-interactions.spec.js --project=1366x768 --project=390x844
```

O runner cria/remove somente banco descartável local e não utiliza o banco de produção. A variante de produção compila o frontend com `NODE_ENV=production` e serve `dist/` com `vite preview`; a API permanece no ambiente isolado de testes.

A auditoria verifica 320, 375, 425, 768, 1024 e 1440px, em claro/escuro e com administrador/produtor. Confere todos os 13 itens permitidos por perfil, mapeamento e rotas, hover/foco, seleção ativa, dimensões, sobreposição, corte, imagens carregadas, dashboard/atalhos, overflow e console. Os 401 de refresh sem sessão e o 503 de clima injetado no teste são esperados; outros erros de console/resources são rejeitados.

## Resultados finais

| Verificação | Resultado |
| --- | --- |
| Build | Passou; os 12 assets foram emitidos corretamente pelo Vite |
| Lint | Passou, sem erros ou avisos |
| Testes frontend | 10 passaram |
| Navegação em desenvolvimento | 6 cenários completos passaram, um por largura |
| Navegação no build de produção | 6 cenários completos passaram, um por largura |
| Regressões de interação | 8 cenários passaram em desktop 1366×768 e mobile 390×844 |
| Desktop / tablet / mobile | 320, 375, 425, 768, 1024 e 1440px verificados |
| Claro / escuro | Menu, miniaturas, atalhos, ativo, hover e foco verificados |
| Perfis | Administrador com Usuários e produtor com Minha Conta; todos os destinos preservados |
| Console / assets | Nenhum erro inesperado, imagem quebrada, 404 ou import inválido |
| Case-sensitive paths | Auditoria prévia do build passou com a caixa exata dos arquivos |
| Revisão visual | Capturas desktop/mobile revisadas; sem corte ou sobreposição; linhas do menu em 42px |
| Performance | 31,858KB de assets; sem dependência de runtime nova; originais grandes não são carregados pela navegação |
| Graphify | 1376 nós e 2466 arestas, extração AST sem custo de LLM |

Total: **20 cenários E2E distintos aprovados**, além dos 10 testes frontend. A auditoria consolidou **288 estados e capturas**, com **4712 instâncias de mini-ilustrações verificadas** e nenhuma falha remanescente.

Os testes de interação cobrem teclado/drawer, busca, filtros, ordenação, paginação, formulário preservado entre abas, produção, receita, vínculos de lote e conclusão de desmama. Todas as escritas desses testes ocorreram no banco descartável local.

O aviso preexistente do Graphify sobre o parser SQL ausente permanece restrito à extração desse tipo de arquivo. A atualização AST do frontend foi concluída; não se alterou o backend para tratar esse aviso.

Evidências locais:

- [Galeria por ambiente, largura e tema](outputs/navigation-images/index.html).
- [Relatório de desenvolvimento](outputs/navigation-images/development-report/index.html).
- [Relatório de produção](outputs/navigation-images/production-report/index.html).
- [Regressões de interação](outputs/navigation-images/interactions-report/index.html).
- [Inventário consolidado](outputs/navigation-images/validation-summary.json).

Não há pendências conhecidas dentro do escopo auditado. Entrega em commit lógico na DEV após a validação. Main preservada; sem push ou deploy automático. O build de produção foi validado localmente com `vite preview`.
