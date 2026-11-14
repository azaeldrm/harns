import { div } from "gpui-kit";

export const PROBE_PX = 100;

/** The app's zoom, from how many reported pixels a PROBE_PX box takes up. */
export function zoomFrom(size) {
  return size && size.width > 0 ? size.width / PROBE_PX : 1;
}

/** A reported size (zoomed, from on_size_change) in the unzoomed px that .w(), .h() and v_virtual_list sizes take. */
export function designPx(px, zoom) {
  return zoom > 0 ? px / zoom : px;
}

/**
 * A row measured at .w(designWidth), as the unzoomed height its list slot needs; calibrated by its own reported width,
 * so no zoom is needed.
 */
export function designHeight(size, designWidth) {
  return size.width > 0 ? size.height * designWidth / size.width : size.height;
}

/** An off-screen PROBE_PX box that reports the app's zoom whenever it lays out. */
export function zoomProbe(onZoom) {
  return div().id("herdr-chat-zoom-probe").absolute().top(0).left(-30000).w(PROBE_PX).h(PROBE_PX).flex_none()
    .on_size_change((size, cx) => onZoom(zoomFrom(size), cx));
}
