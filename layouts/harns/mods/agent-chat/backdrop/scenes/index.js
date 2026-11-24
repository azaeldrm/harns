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
