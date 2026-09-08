// Lógica pura de importação de leads: mapeamento de colunas, validação e
// deduplicação (dentro do arquivo e contra o que já existe no banco).
// Sem I/O — testável isoladamente.

export interface LinhaImportada {
  nome?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
}

export const CAMPOS_IMPORTAVEIS: (keyof LinhaImportada)[] = [
  "nome",
  "empresa",
  "email",
  "telefone",
  "cargo",
  "cidade",
  "estado",
  "cnpj",
];

export function normalizarChave(k: string): string {
  return k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const MAPA_CAMPOS: Record<string, keyof LinhaImportada> = {
  nome: "nome",
  name: "nome",
  contato: "nome",
  empresa: "empresa",
  company: "empresa",
  razaosocial: "empresa",
  "razao social": "empresa",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  phone: "telefone",
  celular: "telefone",
  fone: "telefone",
  cargo: "cargo",
  role: "cargo",
  funcao: "cargo",
  cidade: "cidade",
  city: "cidade",
  estado: "estado",
  uf: "estado",
  cnpj: "cnpj",
};

export function mapearLinha(linha: Record<string, unknown>): LinhaImportada {
  const contato: LinhaImportada = {};
  for (const [chave, valor] of Object.entries(linha)) {
    const campo = MAPA_CAMPOS[normalizarChave(chave)];
    if (campo && valor !== undefined && valor !== null && String(valor).trim() !== "") {
      contato[campo] = String(valor).trim();
    }
  }
  return contato;
}

export function normalizarEmail(email: string | undefined | null): string {
  return (email || "").trim().toLowerCase();
}

export function normalizarCnpj(cnpj: string | undefined | null): string {
  return (cnpj || "").replace(/\D/g, "");
}

/**
 * A TERCEIRA chave de deduplicação: empresa + nome.
 *
 * Ela existe porque as outras duas podem faltar as duas juntas. `email` casa a
 * maioria das linhas e o CNPJ cobre quem não tem e-mail — mas quem não tem
 * NENHUM dos dois caía direto em "novo", sempre. Importar a mesma planilha duas
 * vezes recriava essas pessoas, e o banco não tinha como reclamar: o índice
 * único de `contatos` é parcial (`where email is not null`), então linha sem
 * e-mail não colide com nada.
 *
 * Não é teórico. A planilha que motivou isto tem 8 linhas sem e-mail e nenhuma
 * com CNPJ — 8 duplicatas garantidas na segunda importação.
 *
 * A normalização é a de sempre para comparar texto digitado por gente:
 * minúsculas, sem acento, espaços colapsados. Devolve string vazia quando não
 * dá para formar a chave, e o chamador trata vazio como "sem chave" — porque
 * duas linhas sem empresa E sem nome não são a mesma pessoa, são duas linhas
 * pobres.
 */
export function chaveEmpresaNome(
  empresa: string | undefined | null,
  nome: string | undefined | null,
): string {
  const limpar = (v: string | undefined | null) =>
    (v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  const e = limpar(empresa);
  const n = limpar(nome);
  return e && n ? `${e}|${n}` : "";
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailValido(email: string): boolean {
  return RE_EMAIL.test(email);
}

export type StatusLinha = "novo" | "sem_nome" | "email_invalido" | "dup_arquivo" | "existe";

export interface LinhaClassificada extends LinhaImportada {
  /** número da linha na planilha (1-based, considerando o cabeçalho). */
  _linha: number;
  _status: StatusLinha;
  _motivo?: string;
}

export interface ResumoImportacao {
  total: number;
  novos: number;
  semNome: number;
  emailInvalido: number;
  dupArquivo: number;
  existentes: number;
}

const ROTULO_STATUS: Record<StatusLinha, string> = {
  novo: "Será importado",
  sem_nome: "Sem nome — ignorado",
  email_invalido: "E-mail inválido — ignorado",
  dup_arquivo: "Repetido no arquivo — ignorado",
  existe: "Já existe na base — ignorado",
};

export function rotuloStatus(status: StatusLinha): string {
  return ROTULO_STATUS[status];
}

/**
 * Classifica cada linha mapeada, em três chaves, nesta ordem: e-mail
 * (normalizado), CNPJ (só dígitos) e, na falta dos dois, empresa + nome.
 *
 * A terceira entrou depois — ver `chaveEmpresaNome`. Sem ela, linha sem e-mail
 * e sem CNPJ entrava como nova TODA vez, e reimportar a mesma planilha
 * duplicava essas pessoas em silêncio.
 *
 * `existentesEmpresaNome` é opcional para não quebrar chamador antigo: sem o
 * conjunto, a terceira chave ainda deduplica DENTRO do arquivo, que já é a
 * metade do problema.
 */
export function classificarImportacao(
  linhas: LinhaImportada[],
  existentesEmails: Set<string>,
  existentesCnpj: Set<string>,
  offsetLinha = 2, // linha 1 é o cabeçalho
  existentesEmpresaNome: Set<string> = new Set(),
): { classificadas: LinhaClassificada[]; resumo: ResumoImportacao } {
  const vistosEmail = new Set<string>();
  const vistosCnpj = new Set<string>();
  const vistosEmpresaNome = new Set<string>();
  const classificadas: LinhaClassificada[] = [];

  linhas.forEach((linha, i) => {
    const numero = i + offsetLinha;
    const email = normalizarEmail(linha.email);
    const cnpj = normalizarCnpj(linha.cnpj);
    const empresaNome = chaveEmpresaNome(linha.empresa, linha.nome);

    let status: StatusLinha;
    let motivo: string | undefined;

    if (!linha.nome || !linha.nome.trim()) {
      status = "sem_nome";
    } else if (email && !emailValido(email)) {
      status = "email_invalido";
      motivo = email;
    } else if (email && (vistosEmail.has(email) || existentesEmails.has(email))) {
      status = existentesEmails.has(email) ? "existe" : "dup_arquivo";
      motivo = email;
    } else if (!email && cnpj && (vistosCnpj.has(cnpj) || existentesCnpj.has(cnpj))) {
      status = existentesCnpj.has(cnpj) ? "existe" : "dup_arquivo";
      motivo = linha.cnpj;
    } else if (
      !email &&
      !cnpj &&
      empresaNome &&
      (vistosEmpresaNome.has(empresaNome) || existentesEmpresaNome.has(empresaNome))
    ) {
      status = existentesEmpresaNome.has(empresaNome) ? "existe" : "dup_arquivo";
      motivo = `${linha.empresa} / ${linha.nome}`;
    } else {
      status = "novo";
      if (email) vistosEmail.add(email);
      if (cnpj) vistosCnpj.add(cnpj);
      if (!email && !cnpj && empresaNome) vistosEmpresaNome.add(empresaNome);
    }

    classificadas.push({ ...linha, _linha: numero, _status: status, _motivo: motivo });
  });

  const resumo: ResumoImportacao = {
    total: classificadas.length,
    novos: classificadas.filter((l) => l._status === "novo").length,
    semNome: classificadas.filter((l) => l._status === "sem_nome").length,
    emailInvalido: classificadas.filter((l) => l._status === "email_invalido").length,
    dupArquivo: classificadas.filter((l) => l._status === "dup_arquivo").length,
    existentes: classificadas.filter((l) => l._status === "existe").length,
  };

  return { classificadas, resumo };
}

/**
 * Extrai só os campos gravaveis de uma linha classificada (sem os _metadados).
 *
 * O e-mail sai em MINÚSCULAS, e isso não é cosmético: a comparação desta tela
 * sempre usou `normalizarEmail`, mas a gravação só fazia `trim()`. Os dois
 * lados discordavam, e o banco tem DOIS índices únicos de e-mail — um em
 * `(tenant_id, email)`, sensível à caixa, e outro em `(tenant_id, lower(email))`,
 * insensível. Gravar `Joao@x.com` com `joao@x.com` já na base não casava com o
 * `onConflict`, então o Postgres tentava INSERIR e o índice do `lower` barrava
 * com 23505 — derrubando o lote inteiro, não só a linha.
 *
 * Guardar já normalizado faz os dois índices concordarem e o `onConflict`
 * reconhecer o conflito de verdade.
 */
export function paraContato(linha: LinhaClassificada): LinhaImportada {
  const out: LinhaImportada = {};
  for (const campo of CAMPOS_IMPORTAVEIS) {
    const v = linha[campo];
    if (v !== undefined && v !== null && String(v).trim() !== "") out[campo] = String(v).trim();
  }
  if (out.email) out.email = normalizarEmail(out.email);
  return out;
}
