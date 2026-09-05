"use client";

import { useEffect, useState } from "react";

/**
 * O movimento L2 do sistema de design, em dois ganchos.
 *
 * A regra do `DESIGN.md` é explícita: L2 aqui é `IntersectionObserver` + CSS.
 * Sem GSAP, sem Lenis, sem ScrollTrigger — zero dependência nova, e nada que
 * possa travar a rolagem de um board com 25 cards. O observador é passivo: ele
 * não escuta `scroll`, o navegador avisa.
 *
 * A entrada em cascata dos cards NÃO mora aqui, e isso é uma decisão pagando
 * um erro: a primeira versão usava um observador e deixava o card em
 * `opacity: 0` até ele entrar na tela — no render de prova, as colunas do
 * board saíram VAZIAS, porque card abaixo da dobra nunca recebia o sinal.
 * Conteúdo não pode depender de animação para existir. A cascata virou
 * animação de CSS ao montar (utilidade `surge`), que termina visível sempre.
 *
 * Sobrou aqui o que só o JS sabe: se a página saiu do topo.
 */

/**
 * `true` quando a página saiu do topo — para a barra fixa ganhar fio e sombra.
 *
 * Um sentinela de 1px no topo do documento, e não um ouvinte de `scroll`: o
 * ouvinte dispara dezenas de vezes por segundo e roda no thread principal, que
 * é exatamente o que faz um board de 25 cards engasgar ao rolar.
 */
export function useRolou(): boolean {
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const sentinela = document.createElement("div");
    sentinela.setAttribute("aria-hidden", "true");
    sentinela.style.cssText = "position:absolute;top:0;left:0;height:1px;width:1px;pointer-events:none;";
    document.body.prepend(sentinela);

    const observador = new IntersectionObserver(
      ([entrada]) => setRolou(!entrada.isIntersecting),
      { threshold: 0 },
    );
    observador.observe(sentinela);

    return () => {
      observador.disconnect();
      sentinela.remove();
    };
  }, []);

  return rolou;
}
