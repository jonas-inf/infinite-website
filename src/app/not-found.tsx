import { PAGES } from "@/lib/pages";

export const metadata = { title: PAGES["/404"].title, robots: { index: false, follow: false } };

export default function NotFound() {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: PAGES["/404"].body }} />;
}
