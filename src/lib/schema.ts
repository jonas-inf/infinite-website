import studios from "../content/generated/studios.json" with { type: "json" };
import { SITE } from "./site.ts";

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const org = { "@type": "Organization", "@id": `${SITE.url}/#organization`, name: SITE.name, url: SITE.url, logo: `${SITE.url}/img/logo-wordmark.png`, sameAs: SITE.social };
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// LocalBusiness data for a studio page, each from that studio's own facts (hours as shown on the page, D-026).
export function studioSchema(route: string) {
  const s = studios.find((x) => x.href === route);
  if (!s) return null;
  const [locality, rest] = s.city.split(", ");
  const [region, postalCode] = rest.split(" ");
  return {
    "@context": "https://schema.org", "@type": "HealthClub", name: `Infinite Fitness ${s.name}`, url: `${SITE.url}${s.href}`, telephone: s.phone,
    address: { "@type": "PostalAddress", streetAddress: s.street, addressLocality: locality, addressRegion: region, postalCode, addressCountry: "US" },
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
    openingHoursSpecification: s.hours.flatMap((h, i) => {
      if (!h) return [];
      const [opens, closes] = h.split("-");
      return [{ "@type": "OpeningHoursSpecification", dayOfWeek: WEEK[i], opens, closes }];
    }),
    sameAs: [s.gbp],
    parentOrganization: { "@id": org["@id"] },
  };
}

// Every structured-data block for a page: the business on the home page, each studio on its page, the questions on /faq.
export function schemas(route: string, body: string): object[] {
  const out: object[] = [];
  if (route === "/") out.push({ "@context": "https://schema.org", "@graph": [org, { "@type": "WebSite", name: SITE.name, url: SITE.url, publisher: { "@id": org["@id"] } }] });
  const studio = studioSchema(route);
  if (studio) out.push(studio);
  if (route === "/faq") {
    const qs = [...body.matchAll(/<div class="faq-row"><h3>([\s\S]*?)<\/h3><div class="faq-a">([\s\S]*?)<\/div><\/div>/g)];
    out.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qs.map((m) => ({ "@type": "Question", name: text(m[1]), acceptedAnswer: { "@type": "Answer", text: text(m[2]) } })) });
  }
  return out;
}
