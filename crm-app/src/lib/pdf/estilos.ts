import { StyleSheet, Font } from "@react-pdf/renderer";

export const CORES = {
  navy: "#0f172a",
  indigo: "#4f46e5",
  slate: "#475569",
  slateLight: "#94a3b8",
  border: "#e2e8f0",
  bg: "#f8fafc",
  blue: "#2563eb",
};

export const estilos = StyleSheet.create({
  page: {
    fontSize: 9.5,
    color: "#1e293b",
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 36,
    lineHeight: 1.4,
  },
  h1: { fontSize: 12, fontWeight: 700, color: CORES.navy, marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 10, fontWeight: 700, color: CORES.indigo, marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 6, textAlign: "justify" },
  li: { marginBottom: 4, textAlign: "justify" },
  small: { fontSize: 8, color: CORES.slate },
  tabela: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: CORES.border, marginTop: 4, marginBottom: 8 },
  linha: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CORES.border },
  linhaHeader: { flexDirection: "row", backgroundColor: CORES.navy },
  celula: { padding: 5, fontSize: 8.5, flex: 1, borderRightWidth: 1, borderRightColor: CORES.border },
  celulaHeader: { padding: 5, fontSize: 8, flex: 1, color: "#ffffff", fontWeight: 700, borderRightWidth: 1, borderRightColor: "#334155" },
  rodape: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: CORES.slateLight,
    borderTopWidth: 1,
    borderTopColor: CORES.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  link: { color: "#2563eb", fontSize: 9, textDecoration: "underline", marginBottom: 6 } as any,
  assinaturaLinha: { marginTop: 44, borderTopWidth: 1, borderTopColor: "#1e293b", width: 140, paddingTop: 4 },
  assinaturaNome: { fontSize: 8, fontWeight: 700, marginTop: 2 },
  assinaturaSub: { fontSize: 7, color: CORES.slate, marginTop: 1 },
});
