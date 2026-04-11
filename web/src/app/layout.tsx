import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const logo = localFont({
  src: "../../../Hello Valentina.ttf",
  variable: "--font-logo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roamy — itinerari intelligenti",
  description:
    "Pianifica viaggi su misura con AI, mappe e meteo. Camper, auto o moto.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${logo.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
