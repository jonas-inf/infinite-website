import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PAGES, ROUTES, UNLISTED } from "@/lib/pages";
import { studioSchema } from "@/lib/schema";
import { SITE } from "@/lib/site";

type Props = { params: Promise<{ slug?: string[] }> };
const route = (slug?: string[]) => `/${(slug ?? []).join("/")}`;

export const dynamicParams = false;
export const generateStaticParams = () => ROUTES.map((r) => ({ slug: r === "/" ? [] : r.slice(1).split("/") }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = route((await params).slug);
  const p = PAGES[r];
  if (!p) return {};
  const index = SITE.live && !UNLISTED.has(r);
  return { metadataBase: new URL(SITE.url), title: p.title, description: p.description, alternates: { canonical: r }, robots: { index, follow: index } };
}

export default async function Page({ params }: Props) {
  const r = route((await params).slug);
  const p = PAGES[r];
  if (!p) notFound();
  const schema = studioSchema(r);
  return (
    <>
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />}
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.body }} />
    </>
  );
}
