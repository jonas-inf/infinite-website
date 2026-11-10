// Legacy URLs (D-038, D-050, D-054): one hop to the D-039 stems. `/client-form/` is left out on purpose and returns 404.
const team = ["jonas-acevedo", "carson-scott", "naomi-mathew", "johnny-martinez", "carlos", "christopher-collen", "jossalin-eddington"];
const members = ["shoal-creek-facility", "steiner-ranch-facility", "round-rock-facility", "business-operations"];
const stories = ["kyle", "susan", "james", "mona", "scott", "alison"]; // not published: they land on Results

export const LEGACY: [string, string][] = [
  ["/home", "/"],
  ["/fitness-services-in", "/programs"],
  ["/fitness-services-in/small-group-personal-training-in-austin-tx", "/programs/small-group-personal-training"],
  ["/fitness-services-in/private-personal-training-in-austin-tx", "/programs/private-personal-training"],
  ["/about-us", "/about"],
  ["/team-member", "/team"],
  ...team.map((s): [string, string] => [`/team-member/${s}`, "/team"]),
  ...members.map((s): [string, string] => [`/member-location/${s}`, "/team"]),
  ["/success-stories", "/results"],
  ["/testimonials", "/results"],
  ["/success", "/results"],
  ["/scott", "/results"],
  ...stories.map((s): [string, string] => [`/success-stories/${s}`, "/results"]),
  ...stories.map((s): [string, string] => [`/testimonial/${s}`, "/results"]),
  ...["cindy", "jennifer", "lauren"].map((s): [string, string] => [`/testimonial/${s}`, `/success-stories/${s}`]),
  ["/what-causes-externally-rotated-feet-and-how-to-fix-it-part-1", "/"],
  ["/category/uncategorized", "/"],
  ["/location", "/locations"],
  ["/location/shoal-creek", "/locations/shoal-creek"],
  ["/location/steiner-ranch", "/locations/steiner-ranch"],
  ["/location/roundrock", "/locations/roundrock"],
  ["/location/round-rock", "/locations/roundrock"],
  ["/locations/round-rock", "/locations/roundrock"],
  ["/locations/infinitefitnessaustin.com/locations", "/locations"], // a broken relative link on the old site, in Google's 404 list
  ["/talk-with-us", "/book"],
  ["/contact", "/book"],
  ["/contact-us", "/book"],
  ["/apply", "/careers"],
  ["/sitemap_index.xml", "/sitemap.xml"],
  ["/page-sitemap.xml", "/sitemap.xml"],
  ["/video-sitemap.xml", "/sitemap.xml"],
  ["/local-sitemap.xml", "/sitemap.xml"],
  ["/feed", "/"],
  ["/comments/feed", "/"],
];

export function redirects() {
  const rules = LEGACY.flatMap(([from, destination]) => [from, `${from}/`].map((source) => ({ source, destination, permanent: true })));
  return [...rules, { source: "/author/:slug", destination: "/", permanent: true }, { source: "/author/:slug/", destination: "/", permanent: true },
    { source: "/:path+/", destination: "/:path+", permanent: true }]; // kept pages: last, so a moved page never takes two hops
}
