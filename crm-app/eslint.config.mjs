import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Ler `etapas_pipeline` sem filtro de funil é a regressão silenciosa mais
      // cara do projeto: a primeira etapa de SDR criada vira coluna extra no
      // board do vendedor, na lista e no seletor de etapa do negócio — em
      // produção, sem erro nenhum. `src/lib/pipelines.ts` é o único lugar
      // autorizado a fazer essa consulta, e é lá que o filtro mora.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'] > Literal[value='etapas_pipeline']",
          message:
            "Leia etapas por carregarEtapas()/carregarFunil() de @/lib/pipelines — consulta direta ignora o funil e mistura as etapas do SDR com as do vendedor.",
        },
      ],
    },
  },
  {
    // O módulo que centraliza a consulta precisa poder fazê-la.
    files: ["src/lib/pipelines.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
