// Flip SITE_LIVE only at launch: it opens indexing and closes localhost and preview hosts to the lead API.
export const SITE = { url: "https://infinitefitnessaustin.com", name: "Infinite Fitness", live: process.env.SITE_LIVE === "true" };
