import "@fontsource-variable/fraunces/wght-italic.css";
import "../site.css";

/** The website's text pages: support, privacy policy and terms. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site">{children}</div>;
}
