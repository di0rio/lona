# Lona

ERP para lojas de peças e oficinas de freio de caminhão. Várias empresas usam o mesmo sistema, cada uma vendo só os próprios dados.

## Organização

**Empresa**:
Um negócio que usa o Lona, com seus próprios dados, usuários e configurações. É a unidade de isolamento: nada de uma empresa aparece para outra.
_Evitar_: tenant, conta, cliente (para o negócio que usa o sistema)
No código: `company`

**Filial**:
Um ponto físico da empresa, com estoque e caixa próprios. Toda empresa tem pelo menos uma; a primeira é a **Matriz**.
_Evitar_: loja, unidade, sede
No código: `branch`

**Matriz**:
A primeira filial da empresa, de CNPJ terminado em `/0001`. Em quem não usa várias filiais, é a única e não aparece como escolha.
No código: `isHeadquarters`

**Raiz do CNPJ**:
Os 8 primeiros dígitos do CNPJ, iguais na matriz e em todas as filiais; o número de ordem depois da barra muda em cada filial (`/0002`, `/0003`).
No código: `cnpjRoot`

**Usuário**:
Uma pessoa que entra no sistema por uma empresa, com um cargo.
_Evitar_: conta, membro
No código: `user`

**Cargo**:
Um conjunto de permissões (dono, gerente, balconista, mecânico, financeiro), que decide o que o usuário vê e pode fazer. A empresa pode editar os cargos prontos e criar outros.
_Evitar_: perfil, função, role
No código: `role`. O nome de exibição (`roles.name`) é dado da empresa, em português, editável; não é um enum do sistema e por isso não passa por i18n.

**Vínculo**:
O acesso de um usuário a uma filial com um cargo ("balconista na matriz"). Um usuário pode ter vários, um cargo diferente em cada filial, ou um vínculo com todas as filiais. Sem vínculo, não vê nada.
_Evitar_: acesso, abrangência, permissão (para o vínculo inteiro)
No código: `membership`

**Consultar**:
Poder ver os dados de uma filial sem mexer neles.
_Evitar_: visualizar, leitura
No código: `view`

**Operar**:
Poder criar e alterar documentos numa filial. Quem opera também consulta.
_Evitar_: editar, escrita
No código: `operate`

**Limite**:
O máximo que um cargo pode fazer sem pedir liberação, como o desconto máximo ou o valor máximo de um pedido de compra.
_Evitar_: alçada (na interface), teto
No código: `role_limits` (tabela)

**Liberação**:
A autorização de alguém com limite maior para uma ação que passou do limite de quem a fez, dada na hora com PIN ou depois, a pedido. Fica registrada e não volta atrás.
_Evitar_: aprovação (para venda e OS), autorização
No código: `override`

## Demonstração

**Modelo**:
A empresa fictícia "Freios Rodovia Ltda", com 12 meses de dados, de onde toda demonstração é copiada. Ninguém usa o modelo diretamente.
_Evitar_: template, seed
No código: `isTemplate`/`is_template` (coluna); o módulo e as rotas usam `demo`, que é o termo em inglês para "demonstração" (ver abaixo)

**Demonstração**:
Uma empresa temporária copiada do modelo para um visitante, que dura 2 horas e depois é apagada.
_Evitar_: sandbox, trial, demo (na interface, em português)
No código: `demo` (nome do módulo e das rotas; "demo" é o termo em inglês para "demonstração", só proibido na interface em português)

**Visitante**:
Quem abre uma demonstração, com ou sem cadastro.
No código: `visitor`

## Clientes e veículos

**Cliente**:
Quem compra peças ou serviços da empresa.
_Evitar_: consumidor, comprador

**Frotista**:
Cliente com vários veículos que compra faturado a prazo, dentro de um limite de crédito.
_Evitar_: transportadora (como tipo de cliente), cliente PJ

**Autônomo**:
Cliente com um caminhão próprio que compra no balcão.
_Evitar_: caminhoneiro (como tipo de cliente), cliente PF

**Veículo**:
Um caminhão de um cliente, identificado pela placa, com modelo e número de eixos.
_Evitar_: caminhão (no cadastro), frota (para um veículo só)

## Estoque e compras

**Peça**:
Um item vendido ou aplicado em serviço, com código, marca e os veículos em que serve.
_Evitar_: produto, item, mercadoria

**Aplicação**:
Os modelos de veículo e eixos em que uma peça serve.
_Evitar_: compatibilidade

**Fornecedor**:
Empresa de quem se compram peças.

**Pedido de compra**:
O que a empresa encomenda de um fornecedor. Pode chegar de uma vez ou em várias entradas.
_Evitar_: compra (sozinho), encomenda

**Entrada de mercadoria**:
A chegada de peças de um pedido de compra (toda ou em parte), que aumenta o estoque, atualiza o custo médio e gera títulos a pagar.
_Evitar_: recebimento (é usado para dinheiro), recepção

## Vendas e oficina

**Venda de balcão**:
Venda de peças direto ao cliente, sem serviço, que baixa o estoque ao ser finalizada.
_Evitar_: pedido, venda (sozinho, quando houver dúvida com OS)

**Orçamento**:
Uma venda de balcão ou OS ainda não aprovada pelo cliente. Não mexe no estoque.

**Ordem de serviço (OS)**:
Um serviço feito num veículo, com o problema relatado, as peças aplicadas e a mão de obra.
_Evitar_: serviço (para o documento), chamado, atendimento

**Mão de obra**:
As horas de trabalho de um mecânico cobradas numa OS.

## Financeiro

**Faturado**:
Venda ou OS paga a prazo, que vira títulos a receber.
_Evitar_: fiado, crediário
No código: `on_account` (tipo de forma de pagamento)

**Título**:
Uma parcela a receber de um cliente ou a pagar a um fornecedor, com valor e vencimento. Pertence à filial que faturou ou comprou.
_Evitar_: boleto (é só uma forma de pagamento), parcela (fora do contexto de um título)

**Forma de pagamento**:
Como o dinheiro chega (dinheiro, Pix, débito, crédito, boleto, faturado), com a taxa cobrada e em quantos dias o dinheiro cai. Cada empresa cadastra as suas.
_Evitar_: meio de pagamento, método
No código: `payment_method`

**Condição de pagamento**:
Um modelo de parcelamento reaproveitável ("à vista", "30/60/90", "entrada + 3x", "28/56 dias"); cada parcela vira um título.
_Evitar_: plano de pagamento, prazo (sozinho)
No código: `payment_term`

**Operadora**:
A empresa da maquininha (Stone, Cielo, PagBank...) que repassa o dinheiro das vendas no cartão, descontada a taxa.
_Evitar_: adquirente, credenciadora (na interface)
No código: `acquirer`

**Taxa**:
O percentual que a operadora desconta de cada venda no cartão. Muda por modalidade e número de parcelas, e pode mudar com o tempo.
_Evitar_: MDR (na interface), tarifa
No código: `fee` (tabela `acquirer_fees`)

**Vigência**:
A data a partir da qual uma taxa vale. A taxa vigente é a de vigência mais recente que não está no futuro; as antigas ficam como histórico.
_Evitar_: validade, início
No código: `validFrom`/`valid_from`

**Parcelado lojista**:
Venda parcelada sem juros para o cliente, em que a empresa paga a taxa e recebe uma parcela por mês.
No código: `merchant_installments` (modalidade da taxa)

**Parcelado emissor**:
Venda parcelada em que o cliente paga os juros ao banco do cartão e a empresa recebe o valor todo de uma vez, com uma taxa própria, em geral igual à do crédito à vista.
No código: `issuer_installments` (modalidade da taxa)

**Antecipação**:
Receber da operadora antes do prazo, pagando uma taxa extra.
No código: `anticipation`

**Recebimento**:
A baixa de um título a receber quando o dinheiro chega.
_Evitar_: entrada (é usado para mercadoria)

**Limite de crédito**:
O valor máximo em títulos a receber em aberto que um frotista pode ter, somando todas as filiais da empresa.

**Caixa**:
O dinheiro de uma filial num dia: abre, recebe e paga, e fecha com conferência.
_Evitar_: "caixa" para falar da previsão de entradas e saídas (isso é fluxo de caixa)

**Fluxo de caixa**:
A previsão de entradas e saídas dos próximos dias, a partir dos títulos.
