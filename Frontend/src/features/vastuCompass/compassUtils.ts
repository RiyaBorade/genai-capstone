export type Cardinal = 'north' | 'east' | 'south' | 'west';
export type VastuDirection =
  | Cardinal
  | 'northeast'
  | 'southeast'
  | 'southwest'
  | 'northwest';

export function normalizeAngle(angle: number): number {
  const a = angle % 360;
  return a < 0 ? a + 360 : a;
}

export function deviceOrientationToHeading(
  reading: {
    alpha: number | null;
    absolute: boolean;
    webkitCompassHeading?: number;
  },
  isAbsoluteEvent = false
): number | null {
  if (
    typeof reading.webkitCompassHeading === 'number' &&
    Number.isFinite(reading.webkitCompassHeading)
  ) {
    return normalizeAngle(reading.webkitCompassHeading);
  }

  if (
    (reading.absolute || isAbsoluteEvent) &&
    typeof reading.alpha === 'number' &&
    Number.isFinite(reading.alpha)
  ) {
    return normalizeAngle(360 - reading.alpha);
  }

  return null;
}

export function snapAngle(angle: number, stepDegrees = 90): number {
  const a = normalizeAngle(angle);
  const snapped = Math.round(a / stepDegrees) * stepDegrees;
  return normalizeAngle(snapped);
}

export function headingToVastuDirection(heading: number): VastuDirection {
  const directions: VastuDirection[] = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ];
  return directions[Math.round(normalizeAngle(heading) / 45) % directions.length];
}

export function mapSlotsToDirections<T>(
  slotValues: Record<Cardinal, T>,
  mappedDirections: Record<Cardinal, Cardinal>
): Record<Cardinal, T> {
  const slots: Cardinal[] = ['north', 'east', 'south', 'west'];
  const valueForDirection = (direction: Cardinal): T => {
    const slot = slots.find((candidate) => mappedDirections[candidate] === direction);
    if (!slot) throw new Error(`No image slot is mapped to ${direction}.`);
    return slotValues[slot];
  };

  return {
    north: valueForDirection('north'),
    east: valueForDirection('east'),
    south: valueForDirection('south'),
    west: valueForDirection('west'),
  };
}

export function angleToMappedDirections(angle: number): Record<Cardinal, Cardinal> {
  const a = normalizeAngle(angle);
  const steps = Math.round(a / 90) % 4;

  const base: Cardinal[] = ['north', 'east', 'south', 'west'];
  const rotateRight = (arr: Cardinal[], k: number) => {
    const n = arr.length;
    const r = ((k % n) + n) % n;
    return [...arr.slice(n - r), ...arr.slice(0, n - r)];
  };

  const labelsForSlots = rotateRight(base, steps);

  return {
    north: labelsForSlots[0],
    east: labelsForSlots[1],
    south: labelsForSlots[2],
    west: labelsForSlots[3],
  };
}
