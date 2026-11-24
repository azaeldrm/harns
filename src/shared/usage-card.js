import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { HARNESSES, formatTokens } from "./token-usage.js";
import { seriesColor, brightest } from "./tones.js";

const peak = days => Math.max(1, ...days.map(d => d.fresh));
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A day as the card names it, "Sat 14", spelled out by hand: herdr's scripts have no `Intl` for dates. */
function dayName(day) {
  const d = new Date(day.start);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

/**
 * Columns, one per day, as tall as each day's fresh tokens against the busiest one; today's in the theme's brightest
 * (`brightest`).
 */
function columns(t, days, { height, width = null, gap }) {
  const top = peak(days);
  return h_flex().h(height).gap(gap).items_end()
    .children(days.map(d => {
      const col = div().rounded(width && width < 5 ? 1 : 2).h(Math.max(2, Math.round(height * d.fresh / top)))
        .bg(d.today ? brightest(t) : t.muted).opacity(d.today ? 1 : d.fresh ? 0.45 : 0.25);
      return width ? col.w(width).flex_none() : col.flex_1();
    }));
}

/** Today's tokens in gray after the token icon (`icon`, from the calling mod's folder), as every form of usage shows them. */
function todayTotal(t, days, icon) {
  return h_flex().flex_none().gap(4).items_center().text_color(t.muted)
    .child(svg(icon).size(12).flex_none())
    .child(div().child(days ? formatTokens(days.at(-1).fresh) : "–"));
}

/**
 * The sidebar's usage row (the Strip): "Usage" and today's tokens, then two weeks of columns under them, today the
 * accent one at the right end. `days` null while the first reading runs.
 */
export function usageStrip(t, days, { icon }) {
  return v_flex().w_full().px(8).py(6).gap(6).rounded(7).hover(s => s.bg(t.hover)).cursor_pointer()
    .child(h_flex().w_full().gap(6).items_center().text_size(12)
      .child(div().flex_1().min_w(0).text_color(t.muted).child("Usage"))
      .child(todayTotal(t, days, icon)))
    .child(days ? columns(t, days, { height: 24, gap: 3 }) : div().h(24));
}

/**
 * The footer's usage (no row of its own): the last seven days as small columns, then the token icon and today's
 * tokens in gray, as the Strip shows them.
 */
export function usageSpark(t, days, { icon }) {
  return h_flex().h(28).px(6).gap(6).items_center().rounded(7).hover(s => s.bg(t.hover)).cursor_pointer()
    .child(days ? columns(t, days.slice(-7), { height: 16, width: 4, gap: 2 }) : div())
    .child(todayTotal(t, days, icon).text_size(11.5));
}

/**
 * Usage on the folded sidebar's rail, drawn as the Strip is: on top, the token icon (`icon`, from the calling mod's
 * folder) and today's tokens in gray, over the last five days as columns as tall as the Strip's, across the rail.
 */
export function usageRailMark(t, days, { icon }) {
  return v_flex().w(44).px(4).py(6).gap(6).items_center().rounded(7).hover(s => s.bg(t.hover)).cursor_pointer()
    .child(todayTotal(t, days, icon).text_size(11.5))
    .child(h_flex().w_full().child(days ? columns(t, days.slice(-5), { height: 24, gap: 3 }).w_full() : div().h(24)));
}

/**
 * The card beside the sidebar: each day of the last two weeks, newest first, its bar split by harness, its fresh and
 * cached tokens, then the totals. Every row spans the card: the bar takes what the day's name and the two numbers
 * leave, so the numbers end at the card's right edge, under the legend's right column. `icon` is the coins icon from
 * the calling mod's folder; `errors` the reading's (by machine key), named at the bottom as machines it couldn't read.
 */
export function usageDetails(t, days, { icon, errors = {} } = {}) {
  const failed = Object.keys(errors ?? {}).map(k => k === "@local" ? "this computer" : k);
  const note = failed.length ? `Couldn't read ${failed.join(", ")}.` : null;
  const NAME = 46, FRESH = 40, CACHED = 44;
  const card = v_flex().w(320).p(12).gap(8).rounded(10).border_1().border_color(t.border).bg(t.surface).text_size(12).shadow_md()
    .child(h_flex().w_full().gap(8).items_center()
      .child(svg(icon).size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Token usage"))
      .child(div().text_size(11).text_color(t.dim).child("all machines")));
  if (!days) return card.child(div().text_size(11.5).text_color(t.dim).child("Reading the harnesses' logs…"));
  const top = peak(days);
  const total = key => days.reduce((s, d) => s + d[key], 0);
  const used = HARNESSES.filter(h => days.some(d => d.harnesses[h.id]?.fresh > 0));
  const columns = (name, middle, fresh, cached) => h_flex().w_full().gap(8).items_center()
    .child(div().w(NAME).flex_none().child(name))
    .child(h_flex().flex_1().min_w(0).child(middle))
    .child(h_flex().w(FRESH).flex_none().justify_end().child(fresh))
    .child(h_flex().w(CACHED).flex_none().justify_end().child(cached));
  const row = d => columns(
    div().text_color(d.today ? t.foreground : t.dim).when(d.today, el => el.font_semibold()).child(d.today ? "Today" : dayName(d)),
    h_flex().w_full().h(5).rounded_full().bg(t.border).overflow_hidden()
      .children(HARNESSES.map((h, i) => div().h_full().flex_none().w(`${100 * (d.harnesses[h.id]?.fresh ?? 0) / top}%`).bg(seriesColor(t, h.color, i)))),
    div().text_color(d.fresh ? t.muted : t.dim).child(d.fresh ? formatTokens(d.fresh) : "–"),
    div().text_color(t.dim).child(d.cached ? formatTokens(d.cached) : "")).h(18).text_size(11);
  const legendItem = h => h_flex().flex_1().min_w(0).gap(6).items_center()
    .child(div().size(7).flex_none().rounded_full().bg(seriesColor(t, h.color, HARNESSES.indexOf(h))))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(h.name))
    .child(div().flex_none().text_color(t.dim).child(formatTokens(days.reduce((s, d) => s + (d.harnesses[h.id]?.fresh ?? 0), 0))));
  const pairs = Array.from({ length: Math.ceil(used.length / 2) }, (_, i) => used.slice(i * 2, i * 2 + 2));
  return card
    .when(used.length > 0, el => el.child(v_flex().w_full().gap(4).text_size(11)
      .children(pairs.map(pair => h_flex().w_full().gap(16)
        .child(legendItem(pair[0]))
        .child(pair[1] ? legendItem(pair[1]) : div().flex_1()))))
      .child(div().h(1).bg(t.border)))
    .child(columns(div(), div(), div().child("fresh"), div().child("cached")).text_size(10).text_color(t.dim))
    .child(v_flex().w_full().gap(1).children([...days].reverse().map(row)))
    .child(div().h(1).bg(t.border))
    .child(h_flex().w_full().justify_between().text_size(11).text_color(t.dim)
      .child(`${days.length} days ${formatTokens(total("fresh"))}`)
      .child(`avg ${formatTokens(total("fresh") / days.length)}/day`)
      .child(`${formatTokens(total("cached"))} cached`))
    .when(Boolean(note), el => el.child(div().text_size(10.5).text_color(t.dim).child(note)));
}
