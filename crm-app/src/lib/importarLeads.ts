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
 * Classifica cada linha mapeada. A chave de dedup é o e-mail (normalizado);
 * na falta dele, o CNPJ (só dígitos). Linhas sem nenhuma das duas não têm como
 * ser deduplicadas e entram como novas.
 */
export function classificarImportacao(
  linhas: LinhaImportada[],
  existentesEmails: Set<string>,
  existentesCnpj: Set<string>,
  offsetLinha = 2, // linha 1 é o cabeçalho
): { classificadas: LinhaClassificada[]; resumo: ResumoImportacao } {
  const vistosEmail = new Set<string>();
  const vistosCnpj = new Set<string>();
  const classificadas: LinhaClassificada[] = [];

  linhas.forEach((linha, i) => {
    const numero = i + offsetLinha;
    const email = normalizarEmail(linha.email);
    const cnpj = normalizarCnpj(linha.cnpj);

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
    } else {
      status = "novo";
      if (email) vistosEmail.add(email);
      if (cnpj) vistosCnpj.add(cnpj);
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

/** Extrai só os campos gravaveis de uma linha classificada (sem os _metadados). */
export function paraContato(linha: LinhaClassificada): LinhaImportada {
  const out: LinhaImportada = {};
  for (const campo of CAMPOS_IMPORTAVEIS) {
    const v = linha[campo];
    if (v !== undefined && v !== null && String(v).trim() !== "") out[campo] = String(v).trim();
  }
  return out;
}
