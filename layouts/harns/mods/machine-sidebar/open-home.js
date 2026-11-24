import { find } from "./layout.js";

/** Whether Home's screen is shown: the layout's `main-stack` on its `home` child. `layout` is herdr's layout(). */
export const atHome = layout => find(layout(), "main-stack")?.active === "home";

/** The shared state key holding when Home's screen was last asked for, so the screen starts over each time. */
export const HOME_SHOWN = "harness.home.shown";

/** The shared state key holding where Home was last asked to start ({ at, machine, folder }), when it was. */
export const HOME_WHERE = "harness.home.where";

/**
 * Shows Home's screen in the work area, in a layout that has one, starting it over: on `where`'s machine (its name, null
 * for this computer) with its folder chosen when given (a machine's or an agent's menu), else on the active space's.
 * `run`, `layout` and `setShared` are herdr's.
 */
export function showHome(run, layout, setShared, where = null) {
  if (!find(layout(), "main-stack")) return;
  const at = Date.now();
  setShared(HOME_WHERE, where ? { at, machine: where.machine ?? null, folder: where.folder ?? null } : null);
  setShared(HOME_SHOWN, at);
  run("layout.select", { stack: "main-stack", child: "home" });
}


/** Leaves Home's screen for the work area (the shown tab), if Home is shown. `run` and `layout` are herdr's. */
export function showWork(run, layout) {
  if (atHome(layout)) run("layout.select", { stack: "main-stack", child: "work-body" });
}

/**
 * Opens the tab bar's + dialog, Home's quick form, through herdr's `openOverlay`: a new session where the active space
 * is.
 */
export function openNew(openOverlay) {
  openOverlay({ mod: "machine-sidebar", kind: "dialog", width: 640, height: 250, props: { home: true } });
}
