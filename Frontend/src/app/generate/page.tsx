'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  CompassIcon, 
  ArrowLeftIcon,
  SparklesIcon,
  HomeIcon,
  PaletteIcon,
  Wand2Icon,
  CheckIcon
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  designService,
  uploadService,
  type Design,
} from '../../services/apiService';
import { useAuthStore } from '../../store/authStore';
import type { VastuDirection } from '../../features/vastuCompass/compassUtils';
import { ImageVastuAssessment } from '../../features/vastu/ImageVastuAssessment';

export default function GeneratePage() {
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [roomLocation, setRoomLocation] = useState<VastuDirection | ''>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomDirection, setRoomDirection] = useState<VastuDirection | null>(null);
  const [roomImageUrl, setRoomImageUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [designId, setDesignId] = useState<string | null>(null);
  const [generatedDesign, setGeneratedDesign] = useState<Design | null>(null);
  const [isDemoDesign, setIsDemoDesign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomImageError, setRoomImageError] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated, initializeAuth } = useAuthStore();

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rid = window.sessionStorage.getItem('latest_room_id');
      setRoomId(rid);
      if (!rid) {
        setIsLoadingRoom(false);
        return;
      }

      let cancelled = false;
      void uploadService.getRoom(rid).then((room) => {
        if (cancelled) return;
        const storedDirection = room.direction;
        setRoomImageUrl(
          room.image_url ??
          Object.values(room.images).find((imageUrl): imageUrl is string => Boolean(imageUrl)) ??
          window.sessionStorage.getItem('latest_room_image_url')
        );
        if (
          storedDirection &&
          ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'].includes(storedDirection)
        ) {
          setRoomDirection(storedDirection as VastuDirection);
        }
        setIsLoadingRoom(false);
      }).catch((loadError: unknown) => {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Unable to load the saved room photo.';
        setError(message);
        setRoomImageError(message);
        setIsLoadingRoom(false);
      });

      return () => {
        cancelled = true;
      };
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated === false) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const roomTypes = [
    { id: 'living', label: 'Living Room', icon: HomeIcon },
    { id: 'bedroom', label: 'Bedroom', icon: HomeIcon },
    { id: 'kitchen', label: 'Kitchen', icon: HomeIcon },
    { id: 'office', label: 'Home Office', icon: HomeIcon },
    { id: 'dining', label: 'Dining Room', icon: HomeIcon },
    { id: 'bathroom', label: 'Bathroom', icon: HomeIcon },
  ];

  const designStyles = [
    { id: 'modern', label: 'Modern Minimalist', color: '#1F1F1F' },
    { id: 'traditional', label: 'Traditional Indian', color: '#C6A75E' },
    { id: 'scandinavian', label: 'Scandinavian', color: '#3B82F6' },
    { id: 'bohemian', label: 'Bohemian', color: '#F59E0B' },
    { id: 'industrial', label: 'Industrial', color: '#6B7280' },
    { id: 'coastal', label: 'Coastal', color: '#10B981' },
  ];

  const handleGenerate = async () => {
    setError(null);
    if (!roomId) {
      setError('No uploaded room found. Please upload your directional images first.');
      router.push('/upload');
      return;
    }
    if (!selectedRoom || !selectedStyle) return;
    if (!roomLocation) {
      setError("Select the room's location in your home so Vastu guidance can use the correct zone.");
      return;
    }
    if (!roomDirection) {
      setError('Room direction is missing. Return to upload and capture or set the compass direction.');
      return;
    }

    try {
      setIsGenerating(true);

      const genResp = await designService.generateDesign({
        room_id: roomId,
        style: selectedStyle,
        room_type: selectedRoom,
        room_location: roomLocation,
        wall_color: 'white',
        flooring_material: 'hardwood',
        custom_prompt: customPrompt.trim() || undefined,
      });

      setDesignId(genResp.design_id);
      setIsDemoDesign(/demo|sample|temporarily unavailable/i.test(genResp.message));
      const design = await designService.getDesignById(genResp.design_id);
      setGeneratedDesign(design);
      setGenerationComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const getImageAssessment = (imageIndex: number) =>
    generatedDesign?.image_vastu_analyses?.find((analysis) => analysis.image_index === imageIndex);
  const generatedAlternatives = [
    { imageUrl: generatedDesign?.image_2_url, imageIndex: 2 },
    { imageUrl: generatedDesign?.image_3_url, imageIndex: 3 },
  ].filter((image): image is { imageUrl: string; imageIndex: number } => Boolean(image.imageUrl));

  return (
    <div className="min-h-screen bg-[#F4EFE6]">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#C6A75E]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <CompassIcon className="w-8 h-8 text-[#C6A75E]" />
              <span className="text-xl font-bold text-[#1F1F1F]">AntarAalay.ai</span>
            </Link>
            <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-[#1F1F1F] transition-colors">
              <ArrowLeftIcon className="w-5 h-5 mr-2" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {!generationComplete ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h1 className="text-3xl font-bold text-[#1F1F1F] mb-2">Generate Vastu Design</h1>
                <p className="text-gray-600">Choose your room type and design style for AI-powered Vastu-optimized designs</p>
                {roomDirection && (
                  <p className="mt-2 text-sm font-medium text-[#8A6D2F]">
                    Camera-facing direction: {roomDirection.charAt(0).toUpperCase() + roomDirection.slice(1)}
                  </p>
                )}
                {!isLoadingRoom && !roomDirection && (
                  <p className="mt-2 text-sm text-amber-800">
                    This room has no saved compass direction.{' '}
                    <Link href="/upload" className="font-semibold underline">
                      Capture a direction and upload the room again.
                    </Link>
                  </p>
                )}
                {roomImageUrl && (
                  <div className="mt-5 inline-flex flex-col items-start rounded-xl bg-white p-3 shadow-sm">
                    <span className="mb-2 text-sm font-medium text-gray-700">
                      Your photo · {roomDirection ?? 'direction not set'}
                    </span>
                    <img
                      src={roomImageUrl}
                      alt="Your original room"
                      className="max-h-56 max-w-full rounded-lg object-contain"
                    />
                  </div>
                )}
              </motion.div>

              {error && (
                <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Room Type Selection */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-8"
              >
                <h3 className="text-lg font-semibold text-[#1F1F1F] mb-4">Select Room Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {roomTypes.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoom(room.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        selectedRoom === room.id
                          ? 'border-[#C6A75E] bg-[#C6A75E]/5'
                          : 'border-gray-200 hover:border-[#C6A75E]/50'
                      }`}
                    >
                      <room.icon className={`w-6 h-6 mb-2 ${selectedRoom === room.id ? 'text-[#C6A75E]' : 'text-gray-400'}`} />
                      <span className={`font-medium ${selectedRoom === room.id ? 'text-[#C6A75E]' : 'text-[#1F1F1F]'}`}>
                        {room.label}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              <section className="mb-8">
                <label htmlFor="room-location" className="mb-2 block text-lg font-semibold text-[#1F1F1F]">
                  Where is this room located in your home?
                </label>
                <p className="mb-3 text-sm text-gray-600">
                  This means the room&apos;s position on your home floor plan, not the direction your camera faces.
                  Vastu zone guidance uses your answer; the image analysis will separately assess visible features.
                </p>
                <select
                  id="room-location"
                  value={roomLocation}
                  onChange={(event) => setRoomLocation(event.target.value as VastuDirection | '')}
                  className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 text-gray-800 shadow-sm focus:border-[#C6A75E] focus:outline-none focus:ring-2 focus:ring-[#C6A75E]/20"
                >
                  <option value="">Select the room&apos;s home location</option>
                  {['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'].map((direction) => (
                    <option key={direction} value={direction}>
                      {direction.charAt(0).toUpperCase() + direction.slice(1)}
                    </option>
                  ))}
                </select>
              </section>

              <div className="mb-8">
                <label htmlFor="custom-prompt" className="mb-2 block text-lg font-semibold text-[#1F1F1F]">
                  Optional: describe what you want
                </label>
                <textarea
                  id="custom-prompt"
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value.slice(0, 500))}
                  maxLength={500}
                  rows={4}
                  placeholder="For example: Add a three-seat sofa along the west wall, a reading chair near the window, and warm terracotta accents."
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-gray-800 shadow-sm focus:border-[#C6A75E] focus:outline-none focus:ring-2 focus:ring-[#C6A75E]/20"
                />
                <p className="mt-2 text-right text-xs text-gray-500">{customPrompt.length}/500</p>
              </div>

              {/* Design Style Selection */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-8"
              >
                <h3 className="text-lg font-semibold text-[#1F1F1F] mb-4">Select Design Style</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {designStyles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        selectedStyle === style.id
                          ? 'border-[#C6A75E] bg-[#C6A75E]/5'
                          : 'border-gray-200 hover:border-[#C6A75E]/50'
                      }`}
                    >
                      <PaletteIcon className={`w-6 h-6 mb-2 ${selectedStyle === style.id ? 'text-[#C6A75E]' : 'text-gray-400'}`} />
                      <span className={`font-medium ${selectedStyle === style.id ? 'text-[#C6A75E]' : 'text-[#1F1F1F]'}`}>
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Generate Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <button
                  onClick={handleGenerate}
                  disabled={!selectedRoom || !selectedStyle || !roomLocation || !roomDirection || isLoadingRoom || isGenerating}
                  className="px-8 py-4 bg-[#C6A75E] text-white rounded-xl font-semibold hover:bg-[#B89A4F] transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
                >
                  {isLoadingRoom ? (
                    <>Loading room direction...</>
                  ) : isGenerating ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-3"
                      />
                      Generating Design...
                    </>
                  ) : (
                    <>
                      <Wand2Icon className="w-5 h-5 mr-2" />
                      Generate Vastu Design
                    </>
                  )}
                </button>
              </motion.div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
                <CheckIcon className="w-12 h-12 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-[#1F1F1F] mb-4">
                Design Generated!
              </h2>
              <p className="text-xl text-gray-600 mb-8 max-w-lg mx-auto">
                Your design is ready. Each variation is assessed separately from its visible Vastu evidence.
              </p>
              
              {/* Result Summary */}
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 max-w-2xl mx-auto">
                {roomImageUrl && generatedDesign?.image_1_url ? (
                  <div className="mb-6 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
                    <figure>
                      <figcaption className="mb-2 font-semibold text-[#1F1F1F]">Before</figcaption>
                      <img
                        src={roomImageUrl}
                        alt="Original room before redesign"
                        className="w-full rounded-xl bg-[#F4EFE6] object-contain"
                      />
                    </figure>
                    <figure>
                      <figcaption className="mb-2 font-semibold text-[#1F1F1F]">After</figcaption>
                      {generatedDesign?.image_1_url ? (
                        <>
                          <img
                            src={generatedDesign.image_1_url}
                            alt={`${selectedStyle} ${selectedRoom} redesign`}
                            className="w-full rounded-xl bg-[#F4EFE6] object-contain"
                          />
                          <ImageVastuAssessment analysis={getImageAssessment(1)} />
                        </>
                      ) : (
                        <div className="flex min-h-56 items-center justify-center rounded-xl bg-[#F4EFE6] p-5 text-sm text-gray-600">
                          No redesigned image was saved for this result.
                        </div>
                      )}
                    </figure>
                  </div>
                ) : generatedDesign?.image_1_url ? (
                  <figure className="mb-6 text-left">
                    <figcaption className="mb-2 font-semibold text-[#1F1F1F]">After · AI redesign</figcaption>
                    <img
                      src={generatedDesign.image_1_url}
                      alt={`${selectedStyle} ${selectedRoom} redesign`}
                      className="max-h-[520px] w-full rounded-xl bg-[#F4EFE6] object-contain"
                    />
                    <ImageVastuAssessment analysis={getImageAssessment(1)} />
                    <p className="mt-2 text-sm text-gray-600">
                      Original photo unavailable{roomImageError ? `: ${roomImageError}` : '.'}
                    </p>
                  </figure>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-[#C6A75E]/20 to-[#F4EFE6] rounded-xl flex flex-col items-center justify-center mb-4 text-center p-6">
                    <SparklesIcon className="w-16 h-16 text-[#C6A75E] mb-3" />
                    <p className="text-sm text-gray-600">
                      No redesigned image was saved for this result.
                    </p>
                  </div>
                )}
                {generatedAlternatives.length > 0 && (
                  <div className="mb-6 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
                    {generatedAlternatives.map(({ imageUrl, imageIndex }) => (
                        <figure key={`${designId}-alternative-${imageIndex}`}>
                          <figcaption className="mb-2 font-semibold text-[#1F1F1F]">Alternative {imageIndex - 1}</figcaption>
                          <img
                            src={imageUrl}
                            alt={`${selectedStyle} ${selectedRoom} alternative ${imageIndex - 1}`}
                            className="w-full rounded-xl bg-[#F4EFE6] object-contain"
                          />
                          <ImageVastuAssessment analysis={getImageAssessment(imageIndex)} />
                        </figure>
                    ))}
                  </div>
                )}
                <div className="text-left">
                  <h3 className="text-xl font-bold text-[#1F1F1F] mb-2">
                    {selectedStyle.charAt(0).toUpperCase() + selectedStyle.slice(1)} {selectedRoom.charAt(0).toUpperCase() + selectedRoom.slice(1)}
                  </h3>
                  {designId && (
                    <p className="text-sm text-gray-500 mb-3">Design ID: {designId}</p>
                  )}
                  <div className="flex items-center space-x-2 mb-4">
                    <span className="px-3 py-1 bg-[#C6A75E]/10 text-[#8A6D2F] rounded-full text-sm font-medium">
                      {isDemoDesign ? 'Sample preview' : 'Generated with Stability AI'}
                    </span>
                  </div>
                  {generatedDesign?.vastu_score != null && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600">
                        Average of assessed variations:{' '}
                        <span className="font-semibold">{Math.round(generatedDesign.vastu_score)}/100</span>
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Each variation is assessed separately from its generated image.</p>
                    <p>A single perspective image cannot verify the full floor-plan Vastu layout.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {designId && (
                  <Link
                    href={`/designs/${designId}`}
                    className="px-8 py-4 bg-[#C6A75E] text-white rounded-xl font-semibold hover:bg-[#B89A4F] transition-all shadow-lg hover:shadow-xl text-center"
                  >
                    View Design
                  </Link>
                )}
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-8 py-4 border-2 border-[#C6A75E] text-[#C6A75E] rounded-xl font-semibold hover:bg-[#C6A75E] hover:text-white transition-all"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={() => {
                    setGenerationComplete(false);
                    setSelectedRoom('');
                    setSelectedStyle('');
                  }}
                  className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                >
                  Generate Another
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
