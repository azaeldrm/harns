import { World } from "../../vendor/ascii-sharks/world.js";
import { SHARK_SPEED } from "./config.js";

export class Sea extends World {
  stepSharks(dt) { super.stepSharks(dt * SHARK_SPEED); }
}
