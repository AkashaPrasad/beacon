/**
 * The hero beam's angle (radians, 0..2π), written by the 3D beacon every frame and read by the panel
 * highlight, so the listing cards light up exactly when the light passes over them. A motion value:
 * no React render per frame.
 */
import { motionValue } from 'motion/react';

export const beamAngle = motionValue(0);

/** 0..1: how directly the beam faces the panel (which sits to the camera's left of the beacon). */
export const beamOnPanel = (angle: number) => Math.max(0, Math.cos(angle - Math.PI));
