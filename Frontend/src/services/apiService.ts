/**
 * Enterprise API Service Layer
 * AntarAalay.ai - API Integration with Error Handling
 */

import axios, { AxiosError, type AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased to 60 seconds for Flux AI generation
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Types
export interface UploadResponse {
  room_id: string;
  message: string;
  direction?: string | null;
  heading_degrees?: number | null;
  images: {
    north: string;
    south: string;
    east: string;
    west: string;
  };
}

export interface GenerateRequest {
  room_id: string;
  style: string;
  room_type?: string;
  room_location?: 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
  budget?: number;
  wall_color?: string;
  flooring_material?: string;
  custom_prompt?: string;
}

export interface GenerateResponse {
  design_id: string;
  status: string;
  message: string;
}

export interface ImageVastuFinding {
  guideline: string;
  assessment: 'aligned' | 'concern' | 'unknown';
  evidence: string;
  confidence: number;
}

export interface ImageVastuAnalysis {
  image_index: number;
  status: 'analyzed' | 'insufficient_evidence' | 'not_configured' | 'failed';
  score: number | null;
  confidence: number | null;
  summary: string;
  findings: ImageVastuFinding[];
  limitations: string[];
  error_message?: string | null;
  room_type?: string | null;
  camera_direction?: string | null;
  room_location?: string | null;
  model?: string | null;
}

export interface Design {
  id: string;
  room_id: string;
  user_id: string;
  style: string;
  budget?: number;
  wall_color?: string;
  flooring_material?: string;
  image_1_url?: string;
  image_2_url?: string;
  image_3_url?: string;
  estimated_cost?: number;
  budget_match_percentage?: number;
  vastu_score?: number | null;
  vastu_suggestions?: string[];
  vastu_warnings?: string[];
  image_vastu_analyses?: ImageVastuAnalysis[];
  status: string;
  created_at: string;
}

export interface DashboardStats {
  totalDesigns: number;
  thisMonth: number;
  avgGenerationTime: number;
  favoriteStyle: string;
}

export interface DashboardResponse {
  status: string;
  stats: DashboardStats;
  recentDesigns: Design[];
}

export interface VastuAnalyzeRequest {
  direction: string;
  room_type: string;
}

export interface VastuAnalyzeResponse {
  vastu_score: number;
  suggestions: string[];
  warnings: string[];
  direction_rating: string;
  element_balance?: {
    dominant_element: string;
  };
}

export interface UploadOrientationMetadata {
  heading_degrees: number;
  compass_confirmed?: boolean;
}

export interface UploadedRoom {
  room_id: string;
  image_url?: string;
  images: Partial<Record<'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest', string>>;
  direction?: string | null;
  heading_degrees?: number | null;
}

export interface SingleRoomUploadResponse {
  room_id: string;
  image_url: string;
  direction: string;
  heading_degrees?: number | null;
  status: string;
}

// Upload Service
export const uploadService = {
  async uploadSingleRoomPhoto(
    image: File,
    direction: string,
    orientation?: UploadOrientationMetadata
  ): Promise<SingleRoomUploadResponse> {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(image.type)) {
      throw new Error('Room photo must be JPEG, PNG, or WebP format.');
    }
    if (image.size > 10 * 1024 * 1024) {
      throw new Error('Room photo must be smaller than 10MB.');
    }

    const formData = new FormData();
    formData.append('image', image);
    formData.append('direction', direction);
    if (orientation) {
      formData.append('heading_degrees', String(orientation.heading_degrees));
      formData.append('compass_confirmed', String(orientation.compass_confirmed ?? false));
    }
    try {
      const response = await apiClient.post<SingleRoomUploadResponse>(
        '/api/room/upload-single',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    } catch (error: unknown) {
      const axiosError = axios.isAxiosError<{ detail?: string }>(error) ? error : undefined;
      if (axiosError?.response?.data?.detail) {
        throw new Error(axiosError.response.data.detail);
      }
      throw new Error(error instanceof Error ? error.message : 'Room photo upload failed.');
    }
  },

  async uploadRoomImages(
    files: {
      north: File;
      south: File;
      east: File;
      west: File;
    },
    onProgress?: (progress: number) => void,
    orientation?: UploadOrientationMetadata
  ): Promise<UploadResponse> {
    // Validate files
    const requiredFiles = ['north', 'south', 'east', 'west'] as const;
    for (const direction of requiredFiles) {
      const file = files[direction];
      if (!file) {
        throw new Error(`${direction} image is required`);
      }
      
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`${direction} image must be JPEG, PNG, or WebP format`);
      }
      
      // Check file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error(`${direction} image must be smaller than 10MB`);
      }
    }

    const formData = new FormData();
    formData.append('north', files.north);
    formData.append('south', files.south);
    formData.append('east', files.east);
    formData.append('west', files.west);

    if (orientation) {
      formData.append('heading_degrees', String(orientation.heading_degrees));
      if (typeof orientation.compass_confirmed !== 'undefined') {
        formData.append('compass_confirmed', String(orientation.compass_confirmed));
      }
    }

    const postUpload = async (data: FormData) => {
      return apiClient.post<UploadResponse>('/api/room/upload', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });
    };

    try {
      const response = await postUpload(formData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = axios.isAxiosError<{ detail?: string }>(error) ? error : undefined;

      // Enhanced error handling
      if (axiosError?.response?.data?.detail) {
        throw new Error(axiosError.response.data.detail);
      } else if (axiosError?.response?.status === 413) {
        throw new Error('Files are too large. Please ensure each image is under 10MB.');
      } else if (axiosError?.response?.status === 400) {
        throw new Error('Invalid file format. Please use JPEG, PNG, or WebP images.');
      } else if (axiosError?.response?.status === 401) {
        throw new Error('Please log in to upload images.');
      } else {
        throw new Error(error instanceof Error ? error.message : 'Upload failed. Please try again.');
      }
    }
  },

  async getRoom(roomId: string): Promise<UploadedRoom> {
    const response = await apiClient.get<UploadedRoom>(`/api/room/${roomId}`);
    return response.data;
  },
};

// Design Service
export const designService = {
  async generateDesign(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await apiClient.post<GenerateResponse>(
      '/api/design/generate',
      request,
      { timeout: 300000 }
    );
    return response.data;
  },

  async regenerateDesign(
    designId: string,
    customizations: Partial<GenerateRequest>
  ): Promise<GenerateResponse> {
    const response = await apiClient.post<GenerateResponse>(
      `/api/design/${designId}/regenerate`,
      customizations
    );
    return response.data;
  },

  async getUserDesigns(): Promise<Design[]> {
    const response = await apiClient.get<{ designs: Design[] }>('/api/design/user');
    return response.data.designs;
  },

  async getDesignById(id: string): Promise<Design> {
    const response = await apiClient.get<Design>(`/api/design/${id}`);
    return response.data;
  },
};

// Dashboard Service
// Debug function to test authentication and database
export interface DashboardDebugResponse {
  status: string;
  user?: {
    user_id?: string;
    user_email?: string;
  };
  database?: {
    user_designs_count?: number;
    total_designs_in_db?: number;
  };
}

export const debugDashboard = async (): Promise<DashboardDebugResponse> => {
  try {
    const response = await apiClient.get<DashboardDebugResponse>('/api/dashboard/debug');
    return response.data;
  } catch (error) {
    console.error('Debug dashboard failed:', error);
    throw error;
  }
};

export const dashboardService = {
  async getStats(): Promise<DashboardResponse> {
    try {
      const response = await apiClient.get<DashboardResponse>('/api/dashboard/stats');
      return response.data;
    } catch (error) {
      console.warn('Dashboard API failed, using fallback data:', error);
      // Return fallback data when backend is down
      return {
        status: 'success',
        stats: {
          totalDesigns: 0,
          thisMonth: 0,
          avgGenerationTime: 0,
          favoriteStyle: 'Modern'
        },
        recentDesigns: []
      };
    }
  },
};

// Vastu Service
export const vastuService = {
  async analyzeVastu(request: VastuAnalyzeRequest): Promise<VastuAnalyzeResponse> {
    const response = await apiClient.post<VastuAnalyzeResponse>('/api/vastu/analyze', request);
    return response.data;
  },

  async getVastuScore(direction: string, roomType: string): Promise<{
    direction: string;
    room_type: string;
    vastu_score: number;
    rating: string;
    element: string;
  }> {
    const response = await apiClient.get(
      `/api/vastu/score/${direction}/${roomType}`
    );
    return response.data;
  },

  async getVastuRemedies(direction: string, roomType: string): Promise<{
    direction: string;
    room_type: string;
    current_score: number;
    remedies: string[];
    improvement_potential: number;
  }> {
    const response = await apiClient.get(
      `/api/vastu/remedies/${direction}/${roomType}`
    );
    return response.data;
  },
};

// Error Handler Helper
export const handleApiError = (error: AxiosError): string => {
  if (error.response) {
    // Server returned an error response
    const status = error.response.status;
    const data = error.response.data as any;

    switch (status) {
      case 400:
        return data.detail || 'Invalid request. Please check your input.';
      case 401:
        return 'Session expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'Resource not found.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      case 500:
        return 'Server error. Please try again later.';
      default:
        return data.detail || 'An unexpected error occurred.';
    }
  } else if (error.request) {
    // Request was made but no response received
    return 'Network error. Please check your internet connection.';
  } else {
    // Something else happened
    return error.message || 'An unexpected error occurred.';
  }
};

export default apiClient;
