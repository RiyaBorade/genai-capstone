import { describe, expect, it } from 'vitest';
import {
  angleToMappedDirections,
  deviceOrientationToHeading,
  headingToVastuDirection,
  mapSlotsToDirections,
} from '../../features/vastuCompass/compassUtils';

describe('headingToVastuDirection', () => {
  it.each([
    [0, 'north'],
    [30, 'northeast'],
    [90, 'east'],
    [150, 'southeast'],
    [180, 'south'],
    [225, 'southwest'],
    [270, 'west'],
    [315, 'northwest'],
    [359, 'north'],
    [-90, 'west'],
  ] as const)('maps heading %i to %s', (heading, expected) => {
    expect(headingToVastuDirection(heading)).toBe(expected);
  });
});

describe('deviceOrientationToHeading', () => {
  it('converts absolute alpha readings to compass headings', () => {
    expect(deviceOrientationToHeading({ alpha: 0, absolute: true })).toBe(0);
    expect(deviceOrientationToHeading({ alpha: 90, absolute: true })).toBe(270);
    expect(deviceOrientationToHeading({ alpha: 270, absolute: true })).toBe(90);
  });

  it('uses the native webkit compass heading when available', () => {
    expect(
      deviceOrientationToHeading({
        alpha: 20,
        absolute: false,
        webkitCompassHeading: 123,
      })
    ).toBe(123);
  });

  it('does not turn relative orientation into a fake compass heading', () => {
    expect(deviceOrientationToHeading({ alpha: 90, absolute: false })).toBeNull();
    expect(
      deviceOrientationToHeading({ alpha: null, absolute: true })
    ).toBeNull();
  });
});

describe('angleToMappedDirections', () => {
  it('maps phone-facing direction to the north photo slot', () => {
    expect(angleToMappedDirections(270).north).toBe('east');
    expect(angleToMappedDirections(180).north).toBe('south');
    expect(angleToMappedDirections(90).north).toBe('west');
  });
});

describe('mapSlotsToDirections', () => {
  it('assigns each uploaded photo to its captured cardinal direction', () => {
    const filesBySlot = {
      north: 'top-photo',
      east: 'right-photo',
      south: 'bottom-photo',
      west: 'left-photo',
    };

    expect(mapSlotsToDirections(filesBySlot, angleToMappedDirections(270))).toEqual({
      north: 'left-photo',
      east: 'top-photo',
      south: 'right-photo',
      west: 'bottom-photo',
    });
  });
});
