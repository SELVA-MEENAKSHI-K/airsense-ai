/**
 * Chooses the page backdrop: the WebGL 3D city when the browser supports it, otherwise the
 * 2D canvas skyline. Both expose the same small interface, so the rest of the app never cares.
 */
import { Skyline } from './skyline.js';

/**
 * @param {{reducedMotion: boolean}} options
 * @returns {Promise<{canvas: HTMLCanvasElement, setEnvironment: Function, setReduction: Function, setView: Function, start: Function, reducedMotion: boolean, kind: '3d'|'2d'}>}
 */
export async function createBackdrop({ reducedMotion }) {
  const flat = document.getElementById('sky');
  try {
    const { World3D } = await import('./world3d.js');
    if (World3D.supported()) {
      const world = new World3D(document.body, { reducedMotion });
      flat.hidden = true;
      world.kind = '3d';
      return world;
    }
  } catch {
    /* fall through to the 2D skyline */
  }
  const skyline = new Skyline(flat, { reducedMotion });
  skyline.canvas = flat;
  skyline.kind = '2d';
  skyline.setView = () => {};
  return skyline;
}
