# Acesso por vínculo, com consultar e operar separados

O acesso de cada usuário é uma lista de vínculos (filial, cargo), e cada vínculo separa consultar de operar; sem vínculo a pessoa não vê nada. Escolhemos isso em vez de um cargo único por usuário com acesso a todas as filiais, porque o caso real é a pessoa que opera só a própria filial mas precisa ver o estoque das outras, ou que tem um papel diferente em cada loja. A regra é aplicada no banco, junto com o isolamento por empresa (ADR 0001), e não só escondendo telas.
