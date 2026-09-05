// Primitivos da interface. Importar sempre daqui, nunca do arquivo direto,
// para que a superficie publica seja uma so.
export { Botao, type BotaoProps } from "./Botao";
export { Campo, Entrada, AreaTexto, Selecao } from "./Campo";
export { Cartao, Recuo, Rotulo, Apoio, Vazio } from "./Cartao";
export { Selo, Ponto, Alerta, type Tom } from "./Selo";
export { Abas, PainelDaAba, useAbaNaUrl, useIdDeAbas, type Aba } from "./Abas";
export { Modal } from "./Modal";
export { Confirmar } from "./Confirmar";
export { Surge, atrasoDaCascata } from "./Surge";
export { Segmentado, type ItemSegmentado } from "./Segmentado";
