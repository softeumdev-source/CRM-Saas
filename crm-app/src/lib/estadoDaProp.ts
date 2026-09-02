"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * Estado local que reinicia quando a prop vinda do servidor muda
 * (`router.refresh()`, nova navegação). É o padrão oficial do React de ajustar
 * estado durante o render: sem `useEffect`, sem o render extra com o valor
 * velho na tela.
 */
export function useEstadoDaProp<T>(prop: T, transformar?: (valor: T) => T): [T, Dispatch<SetStateAction<T>>] {
  const aplicar = (valor: T) => (transformar ? transformar(valor) : valor);
  const [valor, setValor] = useState<T>(() => aplicar(prop));
  const [anterior, setAnterior] = useState(prop);

  if (anterior !== prop) {
    setAnterior(prop);
    setValor(aplicar(prop));
  }

  return [valor, setValor];
}
