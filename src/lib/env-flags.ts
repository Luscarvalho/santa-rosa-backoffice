/**
 * Feature flags for the Maps Cost Optimization rollout.
 *
 * Flags são lidos de `import.meta.env` (Vite) e normalizados com defaults
 * seguros que preservam o comportamento atual. Ver `README.md` seção
 * "Feature Flags" para a estratégia de rollout de cada flag.
 *
 * Valores aceitos (case-insensitive):
 *   - boolean: `"1" | "true" | "on" | "yes"` => true
 *              `"0" | "false" | "off" | "no" | ""` => false
 *   - string:  retornado como foi lido (trim) ou default se ausente.
 *   - number:  parseado via `Number(...)`, default se `NaN`.
 */

type FlagPrimitive = string | number | boolean;

type EnvRecord = Record<string, string | boolean | undefined>;

const TRUE_TOKENS = new Set(["1", "true", "on", "yes"]);
const FALSE_TOKENS = new Set(["0", "false", "off", "no", ""]);

function readRawFlag(name: string): string | undefined {
  // `import.meta.env` é injetado pelo Vite em build/dev, e pelo setup de
  // testes em vitest. Acessar via indexação para tolerar chaves ausentes.
  const env = (import.meta.env ?? {}) as EnvRecord;
  const raw = env[name];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "boolean") return raw ? "1" : "0";
  const trimmed = String(raw).trim();
  return trimmed;
}

/**
 * Helper tipado para ler uma env flag com fallback seguro.
 *
 * O tipo de retorno é inferido do `defaultValue`, então:
 *   - `getFlag("X", false)` retorna `boolean`.
 *   - `getFlag("X", 0)`     retorna `number`.
 *   - `getFlag("X", "v")`   retorna `string`.
 *
 * Quando a variável não está definida (ou não parseável para o tipo alvo),
 * o `defaultValue` é retornado.
 */
export function getFlag<T extends FlagPrimitive>(name: string, defaultValue: T): T {
  const raw = readRawFlag(name);
  if (raw === undefined) return defaultValue;

  if (typeof defaultValue === "boolean") {
    const normalized = raw.toLowerCase();
    if (TRUE_TOKENS.has(normalized)) return true as T;
    if (FALSE_TOKENS.has(normalized)) return false as T;
    return defaultValue;
  }

  if (typeof defaultValue === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? (parsed as T) : defaultValue;
  }

  // string
  return raw as T;
}

/**
 * Places API (New) com `AutocompleteSessionToken`.
 * Default `false` — ainda usamos o caminho legacy com session token
 * aplicado pela tarefa 7. Flip para `true` após validação em staging.
 */
export const USE_NEW_PLACES: boolean = getFlag("VITE_USE_NEW_PLACES", false);

/**
 * Aplica `where("status", "==", "active")` na query de `locations`.
 * Default `false` para manter compat com seeds antigos sem `status`.
 * Flip para `true` após validar que o app do motorista escreve `status`.
 */
export const FIRESTORE_ACTIVE_ONLY: boolean = getFlag("VITE_FIRESTORE_ACTIVE_ONLY", false);

/**
 * Cache LRU+TTL de resultados do `DirectionsService.route` em memória.
 * Default `true` — é o ganho de custo mais seguro. Flip para `false`
 * apenas em caso de bug emergencial no cache.
 */
export const DIRECTIONS_CACHE: boolean = getFlag("VITE_DIRECTIONS_CACHE", true);
