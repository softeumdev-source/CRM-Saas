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
        // Texto livre no WhatsApp fora da janela de 24h é violação de política
        // da Meta, e o preço é a nota de qualidade do número cair até o
        // banimento. `enviarTextoLivre` NÃO confere a janela — a conferência
        // precisa da linha do negócio, junto do `pausado` e do teto por hora, e
        // acontece numa rota só. Esta trava existe para que usar a função no
        // lugar errado seja impossível por descuido, e não só desaconselhado
        // por um comentário.
        {
          selector: "ImportSpecifier[imported.name='enviarTextoLivre']",
          message:
            "enviarTextoLivre só pode ser importado por src/app/api/whatsapp/responder/route.ts, que é onde a janela de 24h, o `pausado` e o teto por hora são conferidos. Para mensagem fora da janela use enviarTemplate.",
        },
      ],
    },
  },
  {
    // O módulo que centraliza a consulta precisa poder fazê-la.
    files: ["src/lib/pipelines.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // A única rota autorizada a mandar texto livre — é ela que confere a janela.
    files: ["src/app/api/whatsapp/responder/route.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `public/` não é código do projeto: é o que o servidor entrega tal e qual
    // ao navegador. Nada ali passa pelo compilador, e o eslint não tem o que
    // dizer sobre um arquivo minificado de terceiros.
    //
    // Sem esta linha, o `pdf.worker.min.mjs` do pdf.js — 1448 problemas numa
    // única linha de código minificado — respondia por 95% do relatório e
    // afogava os 79 problemas que são de verdade nossos. Um lint que ninguém
    // consegue ler é um lint que ninguém lê.
    "public/**",
  ]),
]);

export default eslintConfig;
