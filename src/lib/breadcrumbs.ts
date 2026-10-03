import { APP_HOME, findPage } from "@/config/routes";

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$/i;

export interface Crumb {
  label: string;
  to: string;
}

/** Breadcrumbs derived from the URL: registered pages use their title, record ids read "Edit". */
export function buildCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Dashboard", to: APP_HOME }];
  const segments = pathname.replace(/^\/app\/?/, "").split("/").filter(Boolean);
  let path = APP_HOME;
  for (const segment of segments) {
    path = `${path}/${segment}`;
    const page = findPage(path);
    let label: string;
    if (page && page.path === path) label = page.title;
    else if (ID_SEGMENT.test(segment)) label = "Edit";
    else label = segment.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    crumbs.push({ label, to: path });
  }
  return crumbs;
}
