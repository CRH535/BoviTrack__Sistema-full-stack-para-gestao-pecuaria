# Documentação do BoviTrack

## Arquitetura e desenvolvimento

- [Visão geral, configuração local e testes](../README.md)
- [Implementação do contexto assinado e RLS](../IMPLEMENTACAO_RLS_BOVITRACK.md)
- [Homologação de PostgreSQL, TLS e Supavisor](../HOMOLOGACAO_RLS_BOVITRACK.md)
- [Auditoria dos arquivos de ignore](../AUDITORIA_GITIGNORE_BOVITRACK.md)

## Segurança e operação

- [Publicação com RLS e verificação de e-mail opcional](../DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md)
- [Ativação futura da obrigatoriedade de e-mail](../ATIVACAO_FUTURA_VERIFICACAO_EMAIL.md)
- [Integridade, índices e reversão da migration 012](../backend/database/INTEGRIDADE_012.md)
- [Continuidade e histórico operacional](../CODEX_CONTINUIDADE_RLS.md)
- [Limpeza final e validação de manutenção](../LIMPEZA_FINAL_BOVITRACK.md)

O registro da publicação contém o estado operacional conferido em 11/11/2026. Antes de uma nova manutenção, reconfira o ambiente e as autorizações correspondentes. Credenciais e backups privados ficam fora da documentação versionada.

## Histórico

- [Evolução de 12/10/2026](archive/RELATORIO_EVOLUCAO_2026-10-12.md)
- [Validação inicial da verificação de e-mail](archive/RELATORIO_VERIFICACAO_EMAIL.md)
- [Arquitetura original de verificação obrigatória](VERIFICACAO_EMAIL.md)
- [Preparação de produção anterior ao corte](../PREPARACAO_PRODUCAO_RLS_BOVITRACK.md)
- [Auditoria anterior da publicação](../DEPLOY_PRODUCAO_BOVITRACK.md)
- [Runbook anterior com verificação obrigatória](../DEPLOY_RLS_BOVITRACK.md)

Os relatórios históricos preservam os resultados e as decisões de cada etapa. Migrations, evidências de segurança e instruções de reversão permanecem acessíveis pelos caminhos já utilizados pelos scripts.
