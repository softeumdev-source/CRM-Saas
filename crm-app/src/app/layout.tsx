import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

/**
 * Duas familias, cada uma com um papel:
 * - Instrument Sans: tudo que se le e se opera.
 * - Instrument Serif: so numero de valor e titulo de tela. E a assinatura
 *   visual do estilo "Papel" — usar em mais lugares dilui o efeito.
 */
const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM Softeum",
  description: "CRM comercial da Softeum",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${serif.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased bg-superficie text-tinta selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
