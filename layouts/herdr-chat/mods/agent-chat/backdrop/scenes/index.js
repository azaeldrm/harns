// Every scene the backdrop can show, in the order the chat's button steps through them: the shared list of names
// (harns Settings offers the same ones), each with how to make it.
import { SCENE_NAMES } from "../../backdrop-scenes.js";
import { SharksScene } from "./sharks/scene.js";
import { SkyScene } from "./sky.js";
import { RainScene } from "./rain.js";
import { JellyfishScene } from "./jellyfish.js";

const MAKE = {
  sharks: () => new SharksScene(),
  jellyfish: () => new JellyfishScene(),
  sky: () => new SkyScene(),
  rain: () => new RainScene(),
};

export const SCENES = SCENE_NAMES.map(s => ({ ...s, make: MAKE[s.id] }));

export const sceneFor = id => SCENES.find(s => s.id === id) ?? SCENES[0];
export const nextScene = id => SCENES[(SCENES.indexOf(sceneFor(id)) + 1) % SCENES.length];
