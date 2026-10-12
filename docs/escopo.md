# Escopo

O que entra na v1 e o que fica para a v2. Antes de construir algo fora da v1, combine primeiro.

## v1

Construída nesta ordem, cada etapa testada antes da próxima:

1. **Base**: empresas, filiais, cargos, vínculos com consultar e operar, RLS e demonstração.
   - 1a (feita): banco, RLS, cargos prontos, Better Auth (anônimo e e-mail/senha), cópia do modelo e expiração.
   - 1b: casca do app (sidebar, breadcrumb, Ctrl+K, tema claro/escuro, cor de destaque), "como sua empresa trabalha", telas de filiais, cargos, usuários e vínculos, "ver como" na demonstração, 2FA por app autenticador, convite de usuário por link, proteção contra abuso na demonstração, primeiro deploy.
2. **Cadastros**: clientes (frotista e autônomo), veículos, fornecedores, peças com aplicação, formas e condições de pagamento com operadora e taxas.
3. **Estoque e compras**: estoque por filial, custo médio, mínimo, pedido de compra com entradas parciais gerando títulos a pagar.
4. **Venda de balcão**: com orçamento opcional, faturado dentro do limite de crédito, liberação por PIN ou pedido.
5. **OS**: fluxo simples ou completo (aberta, orçamento, aprovada, em execução, concluída, faturada), tela do mecânico pensada para celular.
6. **Financeiro**: receber, pagar, caixa por filial com conferência, fluxo de caixa 30/60/90.
7. **Painel**: faturamento do mês contra o anterior, ticket médio, OS por status, peças abaixo do mínimo, títulos vencidos.
8. **Landing e tour**.

Os limites de cada cargo entram junto com o módulo que os confere (preço mínimo e faturado bloqueado na venda, sangria no financeiro).

## v2

- E-mail (confirmação de cadastro, código de entrada, esqueci a senha, convite por e-mail): depende de um domínio próprio.
- NF-e simulada, com numeração por filial (ADR 0004).
- Atualização em tempo real entre usuários.
- Transferência de estoque entre filiais.
- Preço por filial.
- Taxa por bandeira de cartão.
- DRE.
- Logo da empresa.
- Liberação por WhatsApp ou push.
- Aprovação em vários níveis.
- QR code no convite de usuário.
