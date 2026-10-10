# Empresas isoladas por coluna, com RLS no Postgres

Todas as tabelas de negócio têm a coluna da empresa, e o isolamento é garantido por Row Level Security no Postgres, não só pelo código. Escolhemos isso em vez de um banco por empresa (o Neon permite clonar, mas o plano grátis tem poucos clones e cada demonstração seria um banco) ou de um schema por empresa (migrações multiplicadas por empresa), porque o Lona cria uma empresa nova a cada demonstração e precisa aguentar muitas ao mesmo tempo. Consequência: todo índice começa pela coluna da empresa.
