export type Point3 = { x: number; y: number; z: number };

export function projectHorizontalPointerLook(options: {
  origin: Point3;
  direction: Point3;
  planeY: number;
  avatar: Point3;
  minimumDistance?: number;
  maximumRayDistance?: number;
  output?: {
    yaw: number;
    pitch: number;
    distance: number;
    rayDistance: number;
    target: Point3;
  } | null;
}): Readonly<{
  yaw: number;
  pitch: 0;
  distance: number;
  rayDistance: number;
  target: Readonly<Point3>;
}> | null;

export function traceSolidSegment(options: {
  start: Point3;
  end: Point3;
  isSolid: (x: number, y: number, z: number) => boolean;
  step?: number;
  startPadding?: number;
  endPadding?: number;
  maximumSamples?: number;
}): Readonly<{
  occluded: boolean;
  hit: Readonly<{ x: number; y: number; z: number; distance: number }> | null;
  samples: number;
  reason: string;
}>;

export function traceVisibilityCorridor(options: {
  start: Point3;
  target: Point3;
  isSolid: (x: number, y: number, z: number) => boolean;
  shoulderOffset?: number;
  startPadding?: number;
  endPadding?: number;
  maximumSamples?: number;
}): Readonly<{
  occluded: boolean;
  hit: Readonly<{ x: number; y: number; z: number; distance: number }> | null;
  samples: number;
  reason: string;
  ray: Readonly<{
    name: string;
    height: number;
    lateral: number;
    end: Readonly<Point3>;
  }> | null;
}>;

export function updateOcclusionHysteresis(
  previous: { active?: boolean; clearSamples?: number } | null | undefined,
  occluded: boolean,
  releaseSamples?: number,
): Readonly<{ active: boolean; clearSamples: number }>;
