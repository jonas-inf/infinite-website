import type { ReactNode } from "react";
import assets from "@/content/generated/assets.json";
import "./site.css";

const gtm = process.env.NEXT_PUBLIC_GTM_ID;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-app="" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/img/favicon-64.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js");setTimeout(function(){if(!window.IFA_READY)document.documentElement.classList.remove("js")},2500)' }} />
        {gtm && <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];if(location.pathname==="/injuries-and-joint-pain")dataLayer.push({noMeta:true});(function(w,d,s,l,i){w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f)})(window,document,'script','dataLayer','${gtm}')` }} />}
      </head>
      <body>
        {children}
        <script src={`/site.js?v=${assets.site_js}`} defer />
      </body>
    </html>
  );
}
