CREATE TABLE "auth"."rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint

-- Tabela do Better Auth: sem RLS de empresa (é por IP), só o que o app precisa.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.rate_limits TO lona_app;
--> statement-breakpoint

-- Teto de demonstrações vivas. O lock de transação faz as criações simultâneas passarem uma de cada vez
-- pela conferência: a segunda espera a primeira confirmar e já conta com ela. O lock cai no COMMIT/ROLLBACK
-- da transação que copia. Apaga antes as vencidas (limpeza preguiçosa, ADR 0002), que não contam no teto.
-- SECURITY DEFINER porque o app não enxerga as empresas dos outros (RLS).
CREATE FUNCTION lona_demo_has_room(p_max integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtext('lona_demo_cap'));
	PERFORM lona_delete_expired_demos();
	RETURN (SELECT count(*) FROM companies WHERE NOT is_template AND expires_at > now()) < p_max;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_demo_has_room(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_demo_has_room(integer) TO lona_app;
