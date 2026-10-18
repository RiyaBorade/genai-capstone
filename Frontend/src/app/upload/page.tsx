'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  CompassIcon,
  ImageIcon,
  RefreshCwIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { uploadService } from '../../services/apiService';
import { useAuthStore } from '../../store/authStore';
import { CompassErrorBoundary, useCompassStore, VastuCompass } from '../../features/vastuCompass';
import { headingToVastuDirection, normalizeAngle, type VastuDirection } from '../../features/vastuCompass/compassUtils';

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

type PhotoSource = 'upload' | 'camera';
type DirectionSource = 'manual' | 'compass';

export default function UploadPage() {
  const { isAuthenticated, initializeAuth } = useAuthStore();
  const compass = useCompassStore();
  const [photoSource, setPhotoSource] = useState<PhotoSource>('upload');
  const [directionSource, setDirectionSource] = useState<DirectionSource>('manual');
  const [manualDirection, setManualDirection] = useState<VastuDirection | ''>('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
    return () => cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photo);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const headingDegrees = normalizeAngle(360 - compass.angle);
  const compassDirection = headingToVastuDirection(headingDegrees);
  const selectedDirection = directionSource === 'compass'
    ? compass.confirmed ? compassDirection : ''
    : manualDirection;

  const startCamera = async () => {
    setError(null);
    setIsStartingCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable. Use HTTPS or localhost, or upload a photo instead.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      setCameraStream(stream);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : 'Could not open the camera.');
    } finally {
      setIsStartingCamera(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Wait for the preview, then try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not capture the camera frame. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setError('Could not create a photo from the camera frame. Please try again.');
      return;
    }
    setPhoto(new File([blob], `antar-aalay-room-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    setCameraStream(null);
    setError(null);
  };

  const handleUpload = async () => {
    setError(null);
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!photo) {
      setError('Choose a room photo or take one with the camera.');
      return;
    }
    if (!selectedDirection) {
      setError(directionSource === 'compass'
        ? 'Capture and lock the compass direction before continuing.'
        : 'Select the direction the camera is facing.');
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadService.uploadSingleRoomPhoto(
        photo,
        selectedDirection,
        directionSource === 'compass'
          ? { heading_degrees: headingDegrees, compass_confirmed: compass.confirmed }
          : undefined,
      );
      window.sessionStorage.setItem('latest_room_id', result.room_id);
      window.sessionStorage.setItem('latest_room_direction', result.direction);
      window.sessionStorage.setItem('latest_room_image_url', result.image_url);
      router.push('/generate');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Photo upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4EFE6]">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[#C6A75E]/20 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <CompassIcon className="h-8 w-8 text-[#C6A75E]" />
            <span className="text-xl font-bold text-[#1F1F1F]">AntarAalay.ai</span>
          </Link>
          <Link href="/dashboard" className="flex items-center text-gray-600 transition-colors hover:text-[#1F1F1F]">
            <ArrowLeftIcon className="mr-2 h-5 w-5" />
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-[#1F1F1F]">Start with one room photo</h1>
            <p className="text-gray-600">
              Upload a photo or take one with your camera, then tell us which direction the camera faces.
            </p>
          </motion.div>

          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-[#1F1F1F]">1. Choose how to add your photo</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setPhotoSource('upload'); setCameraStream(null); }}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left ${photoSource === 'upload' ? 'border-[#C6A75E] bg-[#C6A75E]/5' : 'border-gray-200'}`}
              >
                <ImageIcon className="h-6 w-6 text-[#C6A75E]" />
                <span><strong className="block">Upload a photo</strong><small className="text-gray-500">Choose an image from your device</small></span>
              </button>
              <button
                type="button"
                onClick={() => { setPhotoSource('camera'); setCameraStream(null); }}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left ${photoSource === 'camera' ? 'border-[#C6A75E] bg-[#C6A75E]/5' : 'border-gray-200'}`}
              >
                <CameraIcon className="h-6 w-6 text-[#C6A75E]" />
                <span><strong className="block">Take a photo</strong><small className="text-gray-500">Open your device camera</small></span>
              </button>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-[#1F1F1F]">2. Set the direction the camera faces</h2>
            <p className="mb-4 text-sm text-gray-600">
              This is the direction you are facing while taking the photo, not where the room is located in your home.
              You&apos;ll select the room&apos;s home location on the next step.
            </p>
            <div className="mb-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setDirectionSource('manual')}
                className={`rounded-lg border px-4 py-2 text-sm ${directionSource === 'manual' ? 'border-[#C6A75E] bg-[#C6A75E]/10 font-medium' : 'border-gray-200'}`}
              >
                Set direction manually
              </button>
              <button
                type="button"
                onClick={() => setDirectionSource('compass')}
                className={`rounded-lg border px-4 py-2 text-sm ${directionSource === 'compass' ? 'border-[#C6A75E] bg-[#C6A75E]/10 font-medium' : 'border-gray-200'}`}
              >
                Use device compass
              </button>
            </div>
            {directionSource === 'manual' ? (
              <label className="block max-w-sm text-sm font-medium text-gray-700">
                Camera facing direction
                <select
                  value={manualDirection}
                  onChange={(event) => setManualDirection(event.target.value as VastuDirection | '')}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                >
                  <option value="">Select direction</option>
                  {directions.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction.charAt(0).toUpperCase() + direction.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <CompassErrorBoundary>
                  <VastuCompass />
                </CompassErrorBoundary>
                <p className="text-sm font-medium text-[#8A6D2F]">
                  {compass.confirmed
                    ? `Locked direction: ${compassDirection} (${Math.round(headingDegrees)}°)`
                    : 'Capture and lock the direction before continuing.'}
                </p>
              </>
            )}
          </section>

          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-[#1F1F1F]">3. Add your room photo</h2>
            <p className="mb-4 text-sm text-gray-600">
              You can take the photo first. Select or confirm the camera-facing direction in step 2 before continuing.
            </p>
            {photoSource === 'upload' ? (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center hover:border-[#C6A75E]/70">
                <UploadIcon className="mb-3 h-8 w-8 text-[#C6A75E]" />
                <span className="font-medium text-gray-700">Choose one room photo</span>
                <span className="mt-1 text-sm text-gray-500">JPEG, PNG, or WebP, up to 10 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    setPhoto(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              </label>
            ) : (
              <div className="space-y-4">
                {cameraStream ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="max-h-[480px] w-full rounded-xl bg-black object-contain"
                  />
                ) : (
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-center">
                    <CameraIcon className="mb-3 h-8 w-8 text-[#C6A75E]" />
                    <p className="text-sm text-gray-600">Camera preview will appear here.</p>
                  </div>
                )}
                {cameraStream ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void capturePhoto()}
                      className="rounded-lg bg-[#C6A75E] px-5 py-3 font-medium text-white"
                    >
                      <CameraIcon className="mr-2 inline h-5 w-5" />
                      Capture photo
                    </button>
                    <button type="button" onClick={() => setCameraStream(null)} className="rounded-lg border px-5 py-3">
                      Close camera
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={isStartingCamera}
                    className="rounded-lg bg-[#C6A75E] px-5 py-3 font-medium text-white disabled:opacity-50"
                  >
                    <CameraIcon className="mr-2 inline h-5 w-5" />
                    {isStartingCamera ? 'Opening camera...' : photo ? 'Retake photo' : 'Open camera'}
                  </button>
                )}
              </div>
            )}
            {previewUrl && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Photo preview · facing {selectedDirection || 'direction not set'}</span>
                  <button type="button" onClick={() => setPhoto(null)} className="text-sm text-red-600">
                    <XIcon className="mr-1 inline h-4 w-4" />Remove
                  </button>
                </div>
                <img src={previewUrl} alt="Selected room" className="max-h-[480px] w-full rounded-xl bg-[#F4EFE6] object-contain" />
              </div>
            )}
          </section>

          {error && (
            <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={isUploading || !photo || !selectedDirection}
              className="rounded-xl bg-[#C6A75E] px-8 py-4 font-semibold text-white shadow-lg transition-all hover:bg-[#B89A4F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? 'Uploading photo...' : 'Continue to room and style'}
            </button>
            {isUploading && <RefreshCwIcon className="ml-3 inline h-5 w-5 animate-spin text-[#C6A75E]" />}
            {photo && selectedDirection && !isUploading && (
              <p className="mt-3 text-sm text-green-700"><CheckIcon className="mr-1 inline h-4 w-4" />Ready · {selectedDirection}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
