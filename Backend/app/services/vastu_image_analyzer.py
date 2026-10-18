"""Vision-model analysis for generated room images."""

import base64
import json
import logging
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
IMAGE_VASTU_LIMITATION = (
    "Room location is user-reported and is not independently verifiable from "
    "one perspective image. The camera-facing direction is not the room's "
    "location in a floor plan, and unseen room features cannot be verified."
)

ROOM_GUIDELINES = {
    "living": "Living rooms are preferred in NE, N, or E; keep the center open and heavy furniture toward S or W.",
    "bedroom": "Bedrooms are preferred in NW, W, or S; a master bedroom is preferred in SW or S, with the bed head toward S or E.",
    "kitchen": "Kitchens are preferred in SE or NW; the cooking area/stove is preferred in SE and water fixtures in NE.",
    "dining": "Dining rooms are preferred in W or S; maintain clear circulation and a well-lit, ventilated space.",
    "study": "Study rooms are preferred in NE, N, or E; a study desk facing E or N is preferred.",
    "office": "Home offices follow study guidance: NE, N, or E are preferred; a desk facing E or N is preferred.",
    "bathroom": "Bathrooms/toilets are preferred in NW or SE and avoided in NE or SW; keep the space clean and ventilated.",
}


class VastuImageAnalysisError(Exception):
    """Raised when the vision provider cannot return a valid assessment."""


class VastuImageAnalyzer:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.GEMINI_API_KEY.strip())

    def unavailable_result(
        self,
        room_type: str,
        camera_direction: str,
        room_location: str | None = None,
    ) -> dict[str, Any]:
        return {
            "status": "not_configured",
            "score": None,
            "confidence": None,
            "summary": "Image-based Vastu analysis is not configured.",
            "findings": [],
            "limitations": [IMAGE_VASTU_LIMITATION],
            "error_message": "Set GEMINI_API_KEY in the backend environment to analyze generated images.",
            "room_type": room_type,
            "camera_direction": camera_direction,
            "room_location": room_location,
            "model": self.settings.VASTU_VISION_MODEL,
        }

    def failed_result(
        self,
        room_type: str,
        camera_direction: str,
        message: str,
        room_location: str | None = None,
    ) -> dict[str, Any]:
        return {
            "status": "failed",
            "score": None,
            "confidence": None,
            "summary": "Image-based Vastu analysis could not be completed.",
            "findings": [],
            "limitations": [IMAGE_VASTU_LIMITATION],
            "error_message": message,
            "room_type": room_type,
            "camera_direction": camera_direction,
            "room_location": room_location,
            "model": self.settings.VASTU_VISION_MODEL,
        }

    async def analyze_image(
        self,
        image_bytes: bytes,
        content_type: str,
        room_type: str,
        camera_direction: str,
        room_location: str | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured:
            return self.unavailable_result(
                room_type,
                camera_direction,
                room_location,
            )
        if content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise VastuImageAnalysisError(
                f"Unsupported generated image content type: {content_type or 'unknown'}."
            )
        if not image_bytes:
            raise VastuImageAnalysisError("The generated image is empty.")

        prompt = self._build_prompt(room_type, camera_direction, room_location)
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": content_type,
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0,
            },
        }
        endpoint = (
            f"{GEMINI_API_BASE_URL}/"
            f"{self.settings.VASTU_VISION_MODEL}:generateContent"
        )

        try:
            async with httpx.AsyncClient(
                timeout=self.settings.VASTU_VISION_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    endpoint,
                    headers={"x-goog-api-key": self.settings.GEMINI_API_KEY},
                    json=payload,
                )
        except httpx.HTTPError as error:
            raise VastuImageAnalysisError(
                "Could not reach the configured vision-analysis provider."
            ) from error

        if response.status_code != 200:
            logger.warning(
                "Gemini image analysis returned HTTP %s",
                response.status_code,
            )
            raise VastuImageAnalysisError(
                f"The vision-analysis provider returned HTTP {response.status_code}."
            )

        try:
            response_body = response.json()
            response_parts = response_body["candidates"][0]["content"]["parts"]
            response_text = "".join(
                part["text"]
                for part in response_parts
                if isinstance(part, dict)
                and isinstance(part.get("text"), str)
                and not part.get("thought", False)
            )
            assessment = json.loads(response_text)
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise VastuImageAnalysisError(
                "The vision-analysis provider returned an unreadable assessment."
            ) from error

        return self._validate_assessment(
            assessment,
            room_type,
            camera_direction,
            room_location,
            self.settings.VASTU_VISION_MODEL,
        )

    @staticmethod
    def _build_prompt(
        room_type: str,
        camera_direction: str,
        room_location: str | None = None,
    ) -> str:
        room_key = room_type.lower().strip()
        guideline = ROOM_GUIDELINES.get(room_key, ROOM_GUIDELINES["living"])
        location_context = (
            f"The user reports this room is in the {room_location} sector of "
            "the home. Treat that only as user-provided context, not as a "
            "visual observation. Assess whether the reported sector matches "
            "the room-type guideline and say so explicitly. "
            if room_location
            else "The room's sector within the home was not provided; mark "
            "room-location findings unknown. "
        )
        return (
            "Analyze the attached generated interior image itself for visible "
            "Vastu-related evidence. Do not reuse any prior score or assume the "
            "image is compliant because it was AI-generated. "
            f"Selected room type: {room_key}. Room-type guideline: {guideline} "
            f"The camera faces {camera_direction}. This is the viewing "
            "direction, not the room's location within the home. "
            f"{location_context}"
            "Assess visible furniture/layout directions only when the camera "
            "bearing and image make them clear; otherwise mark them unknown. "
            "Clearly distinguish user-provided room location from visual "
            "evidence. Cite image evidence for visual findings. Do not infer hidden "
            "walls, windows, fixtures, or room layout. Return JSON with exactly "
            "these fields: score (number 0-100 or null when evidence is "
            "insufficient), confidence (number 0-1), summary (string), findings "
            "(array of objects with guideline, assessment [aligned, concern, "
            "unknown], evidence, confidence), and limitations (array of strings). "
            "Only score the visible, room-type-specific Vastu evidence; unknown "
            "or unseen requirements must not count as compliant or as violations. "
            "If fewer than two findings have visible evidence, set score to null."
        )

    @staticmethod
    def _validate_assessment(
        assessment: Any,
        room_type: str,
        camera_direction: str,
        room_location: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        if not isinstance(assessment, dict):
            raise VastuImageAnalysisError(
                "The vision-analysis provider returned an invalid assessment."
            )

        score = assessment.get("score")
        if score is not None and (
            isinstance(score, bool)
            or not isinstance(score, (int, float))
            or not 0 <= score <= 100
        ):
            raise VastuImageAnalysisError(
                "The vision-analysis provider returned a score outside 0-100."
            )

        confidence = assessment.get("confidence")
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0 <= confidence <= 1
        ):
            raise VastuImageAnalysisError(
                "The vision-analysis provider returned invalid confidence."
            )

        summary = assessment.get("summary")
        findings = assessment.get("findings")
        limitations = assessment.get("limitations", [])
        if (
            not isinstance(summary, str)
            or not summary.strip()
            or not isinstance(findings, list)
            or not isinstance(limitations, list)
        ):
            raise VastuImageAnalysisError(
                "The vision-analysis provider returned incomplete assessment details."
            )

        validated_findings = []
        for finding in findings[:10]:
            if not isinstance(finding, dict):
                raise VastuImageAnalysisError(
                    "The vision-analysis provider returned an invalid finding."
                )
            finding_confidence = finding.get("confidence")
            if (
                isinstance(finding_confidence, bool)
                or not isinstance(finding_confidence, (int, float))
                or not 0 <= finding_confidence <= 1
            ):
                raise VastuImageAnalysisError(
                    "The vision-analysis provider returned invalid finding confidence."
                )
            if finding.get("assessment") not in {"aligned", "concern", "unknown"}:
                raise VastuImageAnalysisError(
                    "The vision-analysis provider returned an invalid finding assessment."
                )
            if not all(
                isinstance(finding.get(field), str)
                for field in ("guideline", "evidence")
            ):
                raise VastuImageAnalysisError(
                    "The vision-analysis provider returned incomplete finding evidence."
                )
            validated_findings.append(
                {
                    "guideline": finding["guideline"][:240],
                    "assessment": finding["assessment"],
                    "evidence": finding["evidence"][:500],
                    "confidence": float(finding_confidence),
                }
            )

        evidence_count = sum(
            finding["assessment"] != "unknown"
            and bool(finding["evidence"].strip())
            and finding["confidence"] >= 0.35
            for finding in validated_findings
        )
        if evidence_count < 2:
            score = None

        return {
            "status": "analyzed" if score is not None else "insufficient_evidence",
            "score": float(score) if score is not None else None,
            "confidence": float(confidence),
            "summary": summary.strip()[:1000],
            "findings": validated_findings,
            "limitations": [
                *[item[:300] for item in limitations if isinstance(item, str)][:10],
                IMAGE_VASTU_LIMITATION,
            ],
            "error_message": None,
            "room_type": room_type,
            "camera_direction": camera_direction,
            "room_location": room_location,
            "model": model,
        }


_analyzer: VastuImageAnalyzer | None = None


def get_vastu_image_analyzer() -> VastuImageAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = VastuImageAnalyzer()
    return _analyzer
