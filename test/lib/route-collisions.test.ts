// The guard on a flat route namespace.
//
// `app/(dashboard)` and `app/(admin)` are route groups, so neither folder appears in the URL: the
// workspace sections sit at `/portfolio`, `/market-pulse`, `/ipos`, and the admin pages at `/users`,
// `/analytics`, `/platform-logs`. That is what was asked for, and it has one structural consequence worth a
// test rather than a comment — every one of those now shares a namespace with the marketing pages
// (`/pricing`, `/news`, `/about`) and with each other.
//
// A clash is not something the build can catch on its own. Adding a dashboard section whose slug is
// `pricing` gives two folders claiming `/pricing`; whichever loses is simply unreachable, and the
// first sign of it is a reader landing somewhere unexpected. This suite turns that into a failing
// test at the moment the name is added.
//
// It checks the route tables against each other *and* against the folders on disk. The tables are
// what every link and the sidebar are built from; the folders are what Next actually serves. Either
// drifting from the other is a broken link, so both halves are asserted.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ROUTE_PATHS,
  DASHBOARD_SECTION_ROUTES,
  HOME_SECTION_ROUTES,
  isAdminPath,
  dashboardSectionIdFromPath,
} from "../../app/lib/section-routes";

const APP_DIR = join(__dirname, "..", "..", "app");

/**
 * The top-level URLs that exist as real folders in `app/`, route groups resolved.
 *
 * A folder in parentheses contributes its children rather than itself, which is the whole point of
 * the convention — so `(admin)/users` is the URL `/users`, and that is what has to be compared.
 */
function filesystemRoutes(): string[] {
  const routes: string[] = [];

  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Not routes: private folders, the API surface, and the shared code directories.
      if (["api", "components", "lib", "data"].includes(entry.name)) continue;
      if (entry.name.startsWith("_")) continue;

      const grouped = entry.name.startsWith("(") && entry.name.endsWith(")");
      const path = grouped ? prefix : `${prefix}/${entry.name}`;

      if (grouped) {
        walk(join(dir, entry.name), path);
      } else {
        routes.push(path);
      }
    }
  };

  walk(APP_DIR, "");
  return routes;
}

describe("the flat route namespace", () => {
  it("gives every dashboard section a path that no other route claims", () => {
    const paths = DASHBOARD_SECTION_ROUTES.map((route) => route.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps the admin pages clear of the dashboard sections", () => {
    const dashboard = new Set(DASHBOARD_SECTION_ROUTES.map((route) => route.path));
    const clashes = ADMIN_ROUTE_PATHS.filter((path) => dashboard.has(path));

    expect(clashes).toEqual([]);
  });

  /**
   * The one that would actually bite. The marketing routes are the public face of the site and the
   * dashboard sections are behind a sign-in, so a collision here means one of them is unreachable
   * for the readers it was written for.
   */
  it("keeps both workspaces clear of the marketing section routes", () => {
    const marketing = new Set(HOME_SECTION_ROUTES.map((route) => route.path));

    for (const route of DASHBOARD_SECTION_ROUTES) {
      expect(marketing.has(route.path)).toBe(false);
    }
    for (const path of ADMIN_ROUTE_PATHS) {
      expect(marketing.has(path)).toBe(false);
    }
  });

  /**
   * Both areas are plain static folders now — there is no dynamic segment left to paper over a
   * missing one — so every declared path has to exist on disk or its links are 404s.
   */
  it("has a real folder behind every declared path", () => {
    const onDisk = new Set(filesystemRoutes());

    for (const path of ADMIN_ROUTE_PATHS) {
      expect(onDisk.has(path)).toBe(true);
    }
    for (const route of DASHBOARD_SECTION_ROUTES) {
      expect(onDisk.has(route.path)).toBe(true);
    }
  });

  it("does not let a marketing route collide with a folder from either group", () => {
    const onDisk = filesystemRoutes();

    expect(new Set(onDisk).size).toBe(onDisk.length);
  });

  it("keeps every rendered super-admin page inside the shared admin shell", () => {
    const adminDir = join(APP_DIR, "(admin)");
    const pages: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (entry.name === "page.tsx") pages.push(fullPath);
      }
    };

    walk(adminDir);

    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      const redirectsToAnotherAdminPage = source.includes("redirect(");

      if (redirectsToAnotherAdminPage) continue;

      expect(source).toContain("SuperAdminDashboard");
    }
  });
});

describe("isAdminPath", () => {
  // The trackers exclude admin activity from the traffic figures with this. Before the route
  // groups it was a `/admin` prefix test, which now matches nothing.
  it("recognises every admin page", () => {
    for (const path of ADMIN_ROUTE_PATHS) {
      expect(isAdminPath(path)).toBe(true);
    }
  });

  it("tolerates a query string and a trailing slash", () => {
    expect(isAdminPath("/users/")).toBe(true);
    expect(isAdminPath("/users?days=7")).toBe(true);
  });

  it("does not claim the marketing pages or the workspace sections", () => {
    for (const route of [...HOME_SECTION_ROUTES, ...DASHBOARD_SECTION_ROUTES]) {
      expect(isAdminPath(route.path)).toBe(false);
    }
    expect(isAdminPath("/")).toBe(false);
  });
});

describe("dashboardSectionIdFromPath", () => {
  it("names the section behind each workspace path", () => {
    for (const route of DASHBOARD_SECTION_ROUTES) {
      expect(dashboardSectionIdFromPath(route.path)).toBe(route.id);
    }
  });

  it("tolerates a query string and a trailing slash", () => {
    expect(dashboardSectionIdFromPath("/portfolio/")).toBe("portfolio");
    expect(dashboardSectionIdFromPath("/portfolio?tab=holdings")).toBe("portfolio");
  });

  // The namespace is shared now, so this has to say no to everything that is not a section.
  it("claims neither the marketing routes nor the admin pages", () => {
    for (const route of HOME_SECTION_ROUTES) {
      expect(dashboardSectionIdFromPath(route.path)).toBeUndefined();
    }
    for (const path of ADMIN_ROUTE_PATHS) {
      expect(dashboardSectionIdFromPath(path)).toBeUndefined();
    }
    expect(dashboardSectionIdFromPath("/nothing-here")).toBeUndefined();
  });
});
