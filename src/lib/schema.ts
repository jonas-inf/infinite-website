import studios from "../content/generated/studios.json" with { type: "json" };
import { SITE } from "./site.ts";

// LocalBusiness data for a studio page, each from that studio's own facts; null everywhere else.
export function studioSchema(route: string) {
  const s = studios.find((x) => x.href === route);
  if (!s) return null;
  const [locality, rest] = s.city.split(", ");
  const [region, postalCode] = rest.split(" ");
  return {
    "@context": "https://schema.org", "@type": "HealthClub", name: `Infinite Fitness ${s.name}`, url: `${SITE.url}${s.href}`, telephone: s.phone,
    address: { "@type": "PostalAddress", streetAddress: s.street, addressLocality: locality, addressRegion: region, postalCode, addressCountry: "US" },
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
  };
}
