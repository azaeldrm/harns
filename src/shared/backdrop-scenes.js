// The chat backdrop's scenes by name, in the order its button steps through them: agent-chat plays them
// (backdrop/scenes/index.js adds how to make each), and harns Settings offers them as the chat's background. The scene
// picked is shared `herdr-chat.backdrop`; shared `herdr-chat.animation` false turns the backdrop off.
export const SCENE_NAMES = [
  { id: "sharks", label: "Sharks", about: "Sharks hunting a school of fish. Click to make a splash." },
  { id: "jellyfish", label: "Jellyfish", about: "Jellyfish drifting up through the dark." },
  { id: "sky", label: "Night sky", about: "Stars twinkling, now and then a shooting one." },
  { id: "rain", label: "Rain", about: "Rain falling and splashing at the bottom." },
];
