# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Feature Flags

As variáveis abaixo controlam o rollout gradual das otimizações de custo do Google Maps e do Firestore (spec `maps-cost-optimization`). Todas são lidas via `import.meta.env` em `src/lib/env-flags.ts`, com defaults seguros — ou seja, com os valores default o comportamento observável do painel permanece idêntico ao atual.

| Flag | Default | O que faz | Quando flipar |
| --- | --- | --- | --- |
| `VITE_USE_NEW_PLACES` | `"0"` | Quando `"1"`, o `AutocompleteAdapter` usa a Places API (New) em vez do caminho legacy. Em ambos os caminhos o `AutocompleteSessionToken` é sempre aplicado, garantindo billing Per-Session. | Após validar em staging que a Places API (New) está habilitada no GCP e os resultados batem com o caminho legacy para os endereços de Manaus. Risco R2. |
| `VITE_FIRESTORE_ACTIVE_ONLY` | `"0"` | Quando `"1"`, aplica `where("status", "==", "active")` na query de `locations`, reduzindo document-reads a apenas motoristas ativos. Docs sem o campo `status` ficam invisíveis ao painel. | Flip para `"1"` somente após confirmar que o app do motorista escreve `status: "active"` de forma consistente por **pelo menos 1 semana** (cobre re-deploys e dispositivos lentos). Monitorar a coleção antes do flip. Risco R1. |
| `VITE_DIRECTIONS_CACHE` | `"1"` | Quando `"1"`, reutiliza resultados do `DirectionsService.route` por `stopsGeoKey` dentro da sessão (LRU, TTL de 1 h, máx. 50 entradas). `"0"` bypassa o cache completamente. | Manter em `"1"` em produção. Flipar para `"0"` apenas em rollback emergencial se o cache for identificado como causa de bug. Risco R4. |
| `VITE_GOOGLE_MAPS_MAP_ID` | — (ausente) | Map ID do Google Maps (opcional, mas recomendado). Sem ele, `mapId={null}` é usado e `AdvancedMarker` com custom content não funciona. O modo escuro nativo do Maps (`colorScheme="DARK"`) continua funcionando. | Definir assim que o Map ID estiver provisionado no GCP para o domínio do painel. |

Os valores aceitos para flags booleanas (case-insensitive): `"1" | "true" | "on" | "yes"` ⇒ `true`; `"0" | "false" | "off" | "no" | ""` ⇒ `false`. Qualquer outro valor cai no default.

Exemplo de configuração em `.env.local`:

```sh
VITE_USE_NEW_PLACES=0
VITE_FIRESTORE_ACTIVE_ONLY=0
VITE_DIRECTIONS_CACHE=1
# VITE_GOOGLE_MAPS_MAP_ID=your-map-id-here
```

### Rollback

Cada flag pode ser revertida de forma independente, sem redeploy de código — basta atualizar a variável de ambiente no provedor (Vercel dashboard, `.env.local`, CI/CD secrets) e aguardar o próximo deploy ou reiniciar o servidor de desenvolvimento.

Procedimentos de emergência por risco (ver matriz completa em `.kiro/specs/maps-cost-optimization/design.md` §Risco, Rollback e Feature Flags):

- **R1 — Motoristas desaparecem após ativar `VITE_FIRESTORE_ACTIVE_ONLY=1`**: docs no Firestore não têm o campo `status`. Rollback imediato: setar `VITE_FIRESTORE_ACTIVE_ONLY=0`. Investigar se o app do motorista está escrevendo `status: "active"` antes de reativar.
- **R2 — Autocomplete quebrado com `VITE_USE_NEW_PLACES=1`**: Places API (New) não habilitada na API key ou resultados divergentes. Rollback: setar `VITE_USE_NEW_PLACES=0`. O caminho legacy com session token continua funcionando.
- **R3 — Trail distorcido**: bug no `simplifyPath` com tolerância padrão de 15 m. Não há flag de rollback para simplificação — reverter via git revert do commit da tarefa 9.1/9.2.
- **R4 — Cache de Directions servindo rota obsoleta**: setar `VITE_DIRECTIONS_CACHE=0` para bypass imediato. O cache é em memória e é limpo automaticamente no logout/reload.
- **R5 — Spike de reads ao voltar de aba oculta**: ao re-inscrever o listener após `visible`, o Firestore entrega o estado completo atual (proporcional ao número de motoristas ativos). Impacto esperado baixo (≤ 10 docs). Não requer rollback; monitorar cotas no GCP Console.

A consolidação do `<GoogleMapsProvider>` no layout autenticado (tarefa 4) **não tem feature flag** — o rollback é via `git revert` do PR correspondente.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
