'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCompassStore } from './useCompassStore';
import {
  deviceOrientationToHeading,
  headingToVastuDirection,
  normalizeAngle,
  snapAngle,
} from './compassUtils';
import { DirectionSelector } from './DirectionSelector';

type DeviceOrientationWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type DeviceOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const CompassDial = dynamic(async () => {
  const mod = await import('./CompassDial');
  return mod.CompassDial;
}, { ssr: false });

export function VastuCompass() {
  const { angle, confirmed, setAngle, confirm, reset } = useCompassStore();
  const [isStarting, setIsStarting] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [hasSensorHeading, setHasSensorHeading] = useState(false);
  const [hasManualHeading, setHasManualHeading] = useState(false);
  const [sensorAccuracy, setSensorAccuracy] = useState<number | null>(null);
  const [sensorMessage, setSensorMessage] = useState<string | null>(null);

  const dialDisabled = confirmed || isTracking;
  const phoneHeading = normalizeAngle(360 - angle);

  const helpText = useMemo(() => {
    return "Allow motion access, keep the phone flat and upright, then turn slowly. The dial follows live device sensor readings; lock the direction when it matches where the phone is pointing. Sensor availability and accuracy depend on your device and browser.";
  }, []);

  const startCompass = useCallback(async () => {
    if (!window.isSecureContext) {
      setSensorMessage('Live compass requires HTTPS on your phone. Open this page using a secure HTTPS address, then allow motion access.');
      return;
    }

    const OrientationEvent = window.DeviceOrientationEvent as DeviceOrientationConstructor | undefined;
    if (!OrientationEvent) {
      setSensorMessage('This browser does not provide device-orientation readings. Use the manual direction controls instead.');
      return;
    }

    setIsStarting(true);
    setSensorMessage(null);
    try {
      const permission = OrientationEvent.requestPermission
        ? await OrientationEvent.requestPermission()
        : 'granted';
      if (permission !== 'granted') {
        throw new Error('Motion and orientation permission was not granted. Allow it in your browser settings or set the direction manually.');
      }
      setHasSensorHeading(false);
      setHasManualHeading(false);
      setSensorAccuracy(null);
      setSensorMessage('Waiting for the device compass. Keep the phone flat and turn it slowly.');
      setIsTracking(true);
    } catch (error) {
      setSensorMessage(error instanceof Error ? error.message : 'Unable to start the device compass. Use the manual controls.');
    } finally {
      setIsStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!isTracking || confirmed) return;

    let hasReceivedReading = false;
    const noReadingTimeout = setTimeout(() => {
      if (hasReceivedReading) return;
      setIsTracking(false);
      setSensorMessage('No absolute compass reading arrived. Check that motion access is enabled and try HTTPS or another supported browser; otherwise use the manual controls.');
    }, 10000);

    const handleOrientation = (event: Event) => {
      const reading = event as DeviceOrientationWithCompass;
      const heading = deviceOrientationToHeading(reading, event.type === 'deviceorientationabsolute');
      if (heading === null) return;

      hasReceivedReading = true;
      clearTimeout(noReadingTimeout);
      setHasSensorHeading(true);
      setHasManualHeading(false);
      setSensorAccuracy(
        typeof reading.webkitCompassAccuracy === 'number' &&
        Number.isFinite(reading.webkitCompassAccuracy) &&
        reading.webkitCompassAccuracy >= 0
          ? reading.webkitCompassAccuracy
          : null
      );
      setAngle(normalizeAngle(360 - heading));
      setSensorMessage('Live device compass is active. Turn the phone slowly; the reading updates as it moves.');
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('deviceorientationabsolute', handleOrientation);
    return () => {
      clearTimeout(noReadingTimeout);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
    };
  }, [confirmed, isTracking, setAngle]);

  const setManualAngle = useCallback((nextAngle: number) => {
    setIsTracking(false);
    setHasSensorHeading(false);
    setHasManualHeading(true);
    setSensorMessage('Manual direction selected. This is not a sensor reading.');
    setAngle(nextAngle);
  }, [setAngle]);

  const resetCompass = useCallback(() => {
    setIsTracking(false);
    setHasSensorHeading(false);
    setHasManualHeading(false);
    setSensorAccuracy(null);
    setSensorMessage('Direction cleared. Start the live compass or set it manually.');
    reset();
  }, [reset]);

  const lockOrientation = useCallback(() => {
    setIsTracking(false);
    confirm();
  }, [confirm]);

  return (
    <section className="mb-6 bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1F1F1F]">Vastu Compass</h2>
          <p className="text-sm text-gray-600 mt-1">{helpText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={confirmed || isStarting}
            onClick={() => {
              if (isTracking) {
                setIsTracking(false);
                setSensorMessage(
                  hasSensorHeading
                    ? 'Live compass stopped. The last sensor reading is shown; restart it to track movement.'
                    : 'Live compass stopped before a reading was received.'
                );
              }
              else void startCompass();
            }}
            className="px-4 py-2 rounded-lg border border-[#C6A75E]/30 text-[#1F1F1F] text-sm disabled:opacity-60"
          >
            {isStarting ? 'Requesting sensor access...' : isTracking ? 'Stop live compass' : 'Start live compass'}
          </button>
          <button
            type="button"
            onClick={resetCompass}
            className="px-4 py-2 rounded-lg border border-[#C6A75E]/30 text-[#1F1F1F] text-sm disabled:opacity-60"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={confirmed || isTracking || (!hasSensorHeading && !hasManualHeading)}
            onClick={lockOrientation}
            className="px-4 py-2 rounded-lg bg-[#C6A75E] text-white text-sm disabled:opacity-60"
          >
            {confirmed ? 'Locked' : isTracking ? 'Stop compass to lock' : 'Lock Orientation'}
          </button>
        </div>
      </div>

      {sensorMessage && (
        <p role="status" className="mt-4 text-sm text-gray-600">
          {sensorMessage}
        </p>
      )}

      <div className="mt-6 flex flex-col md:flex-row gap-6 md:items-center">
        <div className="flex justify-center md:justify-start">
          <CompassDial
            angle={angle}
            hasHeading={hasSensorHeading || hasManualHeading}
            disabled={dialDisabled}
            onChange={setManualAngle}
          />
        </div>
        <div className="flex-1 space-y-3">
          <div className="text-sm text-gray-700">
            <div className="font-medium">Phone facing</div>
            <div className="mt-1">
              {hasSensorHeading || hasManualHeading
                ? `${headingToVastuDirection(phoneHeading)} · ${Math.round(phoneHeading)}°`
                : 'No direction reading'}
            </div>
            {hasSensorHeading && sensorAccuracy !== null && (
              <div className="mt-1 text-xs text-gray-500">
                Reported sensor accuracy: ±{Math.round(sensorAccuracy)}°
              </div>
            )}
            {hasManualHeading && !confirmed && (
              <div className="mt-1 text-xs text-amber-700">Manual setting · not from the device sensor</div>
            )}
          </div>

          <DirectionSelector
            angle={angle}
            disabled={dialDisabled}
            onChange={setManualAngle}
            onSnap={() => setManualAngle(snapAngle(angle, 90))}
          />

          {!confirmed && (
            <div className="text-xs text-gray-500">
              Tip: Use ArrowLeft/ArrowRight keys to rotate (Shift for bigger steps).
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
