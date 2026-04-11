-- Corrige errata «Aixarenting» → «Caixarenting» en plantilla y gastos de estructura.
UPDATE gastos_plantilla
SET proveedor = 'Caixarenting', updated_at = now()
WHERE trim(proveedor) ILIKE 'Aixarenting';

UPDATE gastos_estructura
SET proveedor = 'Caixarenting', updated_at = now()
WHERE trim(proveedor) ILIKE 'Aixarenting';
