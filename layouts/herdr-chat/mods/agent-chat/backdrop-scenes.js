export const SCENE_NAMES = [
  { id: "sharks", label: "Sharks", about: "Sharks hunting a school of fish. Click to make a splash." },
  { id: "jellyfish", label: "Jellyfish", about: "Jellyfish drifting up through the dark." },
  { id: "sky", label: "Night sky", about: "Stars twinkling, now and then a shooting one." },
  { id: "rain", label: "Rain", about: "Rain falling and splashing at the bottom." },
];

/** How the background reads when it's off, as the scene button names it. */
export const NO_BACKDROP = { id: "none", label: "No background" };

/**
 * The background after the one shown, as the scene button steps through them: each scene in turn, then none (`on`
 * false: `herdr-chat.animation`), then the first scene again, the choices Settings offers. `id` is the scene shown
 * (`herdr-chat.backdrop`), an unknown one counting as the first.
 */
export function nextBackdrop(on, id) {
  if (!on) return { on: true, id: SCENE_NAMES[0].id };
  const i = Math.max(0, SCENE_NAMES.findIndex(s => s.id === id));
  return i === SCENE_NAMES.length - 1 ? { on: false, id: SCENE_NAMES[i].id } : { on: true, id: SCENE_NAMES[i + 1].id };
}
