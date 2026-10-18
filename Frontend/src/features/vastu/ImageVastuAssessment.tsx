import type { ImageVastuAnalysis } from '../../services/apiService';

interface ImageVastuAssessmentProps {
  analysis?: ImageVastuAnalysis;
}

export function ImageVastuAssessment({ analysis }: ImageVastuAssessmentProps) {
  if (!analysis) {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        No image-specific Vastu assessment was saved for this variation.
      </div>
    );
  }

  const scoreMessage = {
    insufficient_evidence: 'Not enough visible evidence to assign a score.',
    not_configured: 'Image analysis is not configured on the backend.',
    failed: 'Image analysis could not be completed.',
    analyzed: analysis.summary,
  }[analysis.status];

  return (
    <section className="rounded-lg bg-[#F8F5EF] p-4 text-left" aria-label={`Vastu assessment for image ${analysis.image_index}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[#1F1F1F]">Image Vastu assessment</h3>
        {analysis.score !== null && (
          <strong className="text-xl text-[#8A6D2F]">{Math.round(analysis.score)}/100</strong>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-700">{scoreMessage}</p>
      {analysis.confidence !== null && (
        <p className="mt-1 text-xs text-gray-600">
          Vision-model confidence: {Math.round(analysis.confidence * 100)}%
        </p>
      )}
      {analysis.room_location && (
        <p className="mt-1 text-xs text-gray-600">
          Room location provided: {analysis.room_location}. This is user-reported, not inferred from the image.
        </p>
      )}
      {analysis.error_message && (
        <p className="mt-2 text-sm text-amber-900">{analysis.error_message}</p>
      )}
      {analysis.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {analysis.findings.map((finding, index) => (
            <li key={`${analysis.image_index}-${index}`} className="text-sm text-gray-700">
              <span className="font-medium">{finding.guideline}</span>
              <span className="ml-2 text-xs uppercase text-gray-500">{finding.assessment}</span>
              {finding.evidence && <p className="mt-0.5">{finding.evidence}</p>}
            </li>
          ))}
        </ul>
      )}
      {analysis.limitations.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3">
          {analysis.limitations.map((limitation, index) => (
            <li key={`${analysis.image_index}-limitation-${index}`} className="text-xs text-gray-600">
              {limitation}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
