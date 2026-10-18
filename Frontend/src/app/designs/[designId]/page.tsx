'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  HomeIcon,
  UploadIcon,
  CompassIcon,
  SparklesIcon,
  AlertTriangleIcon,
  PaletteIcon,
  DollarSignIcon,
  Wand2Icon
} from 'lucide-react';
import Link from 'next/link';
import { designService, uploadService, type Design } from '../../../services/apiService';
import { useAuthStore } from '../../../store/authStore';
import { ImageVastuAssessment } from '../../../features/vastu/ImageVastuAssessment';

export default function DesignResultPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, initializeAuth } = useAuthStore();
  const [design, setDesign] = useState<Design | null>(null);
  const [originalRoomImage, setOriginalRoomImage] = useState<string | null>(null);
  const [roomImageError, setRoomImageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [customBudget, setCustomBudget] = useState<number | ''>('');
  const [customWallColor, setCustomWallColor] = useState('');
  const [customFlooring, setCustomFlooring] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const designId =
    params &&
    typeof (params as Record<string, string | string[] | undefined>).designId !== 'undefined'
      ? (() => {
          const value = (params as Record<string, string | string[] | undefined>).designId;
          if (typeof value === 'string') return value;
          if (Array.isArray(value)) return value[0] ?? '';
          return '';
        })()
      : '';

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!designId) return;

    const fetchDesign = async () => {
      try {
        setIsLoading(true);
        const designData = await designService.getDesignById(designId);
        setDesign(designData);
        try {
          const room = await uploadService.getRoom(designData.room_id);
          setOriginalRoomImage(
            room.image_url ??
            Object.values(room.images).find((imageUrl): imageUrl is string => Boolean(imageUrl)) ??
            null
          );
        } catch (roomError) {
          setRoomImageError(
            roomError instanceof Error ? roomError.message : 'Could not load the original room photo.'
          );
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load design');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDesign();
  }, [designId, isAuthenticated, router]);

  const handleRegenerate = async () => {
    if (!designId) return;
    try {
      setIsRegenerating(true);
      const response = await designService.regenerateDesign(designId, {
        budget: customBudget ? Number(customBudget) : undefined,
        wall_color: customWallColor || undefined,
        flooring_material: customFlooring || undefined,
      });
      router.push(`/designs/${response.design_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate design');
    } finally {
      setIsRegenerating(false);
      setShowRegenerateModal(false);
    }
  };

  const getImageUrl = (imageUrl: string | undefined): string => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:')) return imageUrl;
    if (imageUrl.startsWith('http')) return imageUrl;
    return `data:image/jpeg;base64,${imageUrl}`;
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4EFE6] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#C6A75E]/30 border-t-[#C6A75E] rounded-full"
        />
      </div>
    );
  }

  if (error || !design) {
    return (
      <div className="min-h-screen bg-[#F4EFE6] flex items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1F1F1F] mb-2">Design Not Found</h2>
          <p className="text-[#666] mb-6">{error || 'This design could not be loaded.'}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-[#C6A75E] text-white rounded-xl font-medium hover:bg-[#B89A4F] transition-all"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const alternatives = [
    { imageUrl: design.image_2_url, imageIndex: 2 },
    { imageUrl: design.image_3_url, imageIndex: 3 },
  ].filter((image): image is { imageUrl: string; imageIndex: number } => Boolean(image.imageUrl));

  return (
    <div className="min-h-screen bg-[#F4EFE6]">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-[#C6A75E]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-2 text-[#1F1F1F] hover:text-[#C6A75E] transition-colors">
              <ArrowLeftIcon className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </Link>
            <Link href="/upload" className="inline-flex items-center px-4 py-2 bg-[#C6A75E] text-white rounded-lg font-medium hover:bg-[#B89A4F] transition-all">
              <UploadIcon className="w-4 h-4 mr-2" />
              New Design
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Design Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-[#1F1F1F] mb-2">Design Results</h1>
              <p className="text-[#666]">
                Style: <span className="font-medium">{design.style}</span> • 
                Created: {new Date(design.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-[#666] mb-1">Average of analyzed images</div>
              <div className="text-3xl font-bold text-[#8A6D2F]">
                {design.vastu_score == null ? 'Not assessed' : `${Math.round(design.vastu_score)}/100`}
              </div>
            </div>
          </div>

          {/* Design Details */}
          {(design.budget || design.wall_color || design.flooring_material) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {design.budget && (
                <div className="bg-white p-4 rounded-lg border border-[#C6A75E]/20">
                  <div className="flex items-center space-x-2 text-[#C6A75E] mb-1">
                    <DollarSignIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Budget</span>
                  </div>
                  <div className="text-xl font-bold text-[#1F1F1F]">${design.budget}</div>
                </div>
              )}
              {design.wall_color && (
                <div className="bg-white p-4 rounded-lg border border-[#C6A75E]/20">
                  <div className="flex items-center space-x-2 text-[#C6A75E] mb-1">
                    <PaletteIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Wall Color</span>
                  </div>
                  <div className="text-xl font-bold text-[#1F1F1F]">{design.wall_color}</div>
                </div>
              )}
              {design.flooring_material && (
                <div className="bg-white p-4 rounded-lg border border-[#C6A75E]/20">
                  <div className="flex items-center space-x-2 text-[#C6A75E] mb-1">
                    <HomeIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Flooring</span>
                  </div>
                  <div className="text-xl font-bold text-[#1F1F1F]">{design.flooring_material}</div>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Before and after */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-2xl font-bold text-[#1F1F1F] mb-4 flex items-center">
            <SparklesIcon className="w-6 h-6 text-[#C6A75E] mr-2" />
            Before &amp; After
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-[#C6A75E]/20 bg-white shadow-lg">
              <div className="border-b p-4 font-semibold text-[#1F1F1F]">Before · Original room</div>
              {originalRoomImage ? (
                <img src={originalRoomImage} alt="Original room before redesign" className="aspect-square w-full bg-gray-100 object-contain" />
              ) : (
                <p className="p-6 text-sm text-gray-600">{roomImageError || 'Original room photo unavailable.'}</p>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-[#C6A75E]/20 bg-white shadow-lg">
              <div className="border-b p-4 font-semibold text-[#1F1F1F]">After · AI redesign</div>
              {design.image_1_url ? (
                <>
                  <img src={getImageUrl(design.image_1_url)} alt="AI redesigned room" className="aspect-square w-full bg-gray-100 object-contain" />
                  <div className="p-4">
                    <ImageVastuAssessment
                      analysis={design.image_vastu_analyses?.find((analysis) => analysis.image_index === 1)}
                    />
                  </div>
                </>
              ) : (
                <p className="p-6 text-sm text-gray-600">No redesigned image is available for this design.</p>
              )}
            </div>
          </div>
          {alternatives.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {alternatives.map(({ imageUrl, imageIndex }, index) => (
              <motion.div 
                key={imageIndex}
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }} 
                transition={{ delay: 0.2 + index * 0.1 }}
                className="bg-white rounded-lg overflow-hidden shadow-lg border border-[#C6A75E]/20"
              >
                <div className="aspect-square bg-gray-100 relative">
                  <img
                    src={getImageUrl(imageUrl)}
                    alt={`Design option ${imageIndex}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-[#1F1F1F] mb-1">Alternative {imageIndex - 1}</h3>
                  <p className="text-sm text-[#666]">Another AI design variation</p>
                  <div className="mt-3">
                    <ImageVastuAssessment
                      analysis={design.image_vastu_analyses?.find((analysis) => analysis.image_index === imageIndex)}
                    />
                  </div>
                </div>
              </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="text-2xl font-bold text-[#1F1F1F] mb-4 flex items-center">
            <CompassIcon className="w-6 h-6 text-[#C6A75E] mr-2" />
            About these image scores
          </h2>
          <p className="rounded-lg border border-[#C6A75E]/20 bg-white p-5 text-sm text-[#666]">
            Each score is generated by a vision model inspecting that specific image and citing visible evidence.
            A single perspective photo cannot verify a complete floor plan or exact cardinal zones, so these are
            limited visual assessments rather than a certified whole-home Vastu score.
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-8 flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => setShowRegenerateModal(true)} 
            className="inline-flex items-center justify-center px-6 py-3 bg-[#1F1F1F] text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl"
          >
            <Wand2Icon className="w-5 h-5 mr-2" />
            Regenerate with Customizations
          </button>
          <Link 
            href="/upload" 
            className="inline-flex items-center justify-center px-6 py-3 bg-[#C6A75E] text-white rounded-xl font-medium hover:bg-[#B89A4F] transition-all shadow-lg hover:shadow-xl"
          >
            <UploadIcon className="w-5 h-5 mr-2" />
            Create New Design
          </Link>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-[#1F1F1F] rounded-xl font-medium hover:bg-gray-50 transition-all border border-[#C6A75E]/20"
          >
            <HomeIcon className="w-5 h-5 mr-2" />
            Back to Dashboard
          </Link>
        </motion.div>
      </main>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-[#1F1F1F] mb-4">Regenerate Design</h3>
            <p className="text-gray-600 mb-6">Customize your design with different preferences.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Budget (optional)</label>
                <input 
                  type="number" 
                  value={customBudget} 
                  onChange={(e) => setCustomBudget(e.target.value ? Number(e.target.value) : '')} 
                  placeholder="e.g., 50000" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C6A75E] focus:border-transparent" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wall Color (optional)</label>
                <input 
                  type="text" 
                  value={customWallColor} 
                  onChange={(e) => setCustomWallColor(e.target.value)} 
                  placeholder="e.g., cream, sage green" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C6A75E] focus:border-transparent" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flooring Material (optional)</label>
                <input 
                  type="text" 
                  value={customFlooring} 
                  onChange={(e) => setCustomFlooring(e.target.value)} 
                  placeholder="e.g., hardwood, marble" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C6A75E] focus:border-transparent" 
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRegenerateModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleRegenerate} disabled={isRegenerating} className="flex-1 px-4 py-2 bg-[#C6A75E] text-white rounded-lg hover:bg-[#B89A4F] transition-colors disabled:opacity-50">
                {isRegenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
