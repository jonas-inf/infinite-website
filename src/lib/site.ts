// Flip SITE_LIVE only at launch: it opens indexing and closes localhost and preview hosts to the lead API.
export const SITE = {
  url: "https://infinitefitnessaustin.com", name: "Infinite Fitness", live: process.env.SITE_LIVE === "true",
  image: "/img/og.jpg", // share image: a 1200×630 crop of the home hero photo
  social: ["https://www.instagram.com/infinite_fitness_atx/", "https://www.facebook.com/InfiniteFitnessATX"], // the footer's links
};
