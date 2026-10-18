"""Stability AI image-to-image generation engine."""

import logging
import time
from typing import Any, Dict

import httpx

from app.services.storage import get_storage_service

from .base_engine import BaseEngine, EngineType, GenerationRequest, GenerationResult
from .intent_prompt_builder import IntentBasedPromptBuilder

logger = logging.getLogger(__name__)


def _uploaded_image_metadata(image: bytes) -> tuple[str, str]:
    if image.startswith(b"\x89PNG\r\n\x1a\n"):
        return "room.png", "image/png"
    if image.startswith(b"\xff\xd8\xff"):
        return "room.jpg", "image/jpeg"
    if image.startswith(b"RIFF") and image[8:12] == b"WEBP":
        return "room.webp", "image/webp"
    return "room.png", "image/png"


class StabilityImageEngine(BaseEngine):
    """Generate room redesigns using Stability AI's SD3 image-to-image API."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.api_key = str(config.get("stability_api_key") or "").strip()
        self.endpoint_url = str(
            config.get(
                "stability_api_url",
                "https://api.stability.ai/v2beta/stable-image/generate/sd3",
            )
        ).strip()
        self.timeout_seconds = float(
            config.get("stability_timeout_seconds", config.get("timeout_seconds", 120))
        )
        self.prompt_builder = IntentBasedPromptBuilder()

    def _get_engine_type(self) -> EngineType:
        return EngineType.STABILITY

    async def health_check(self) -> bool:
        return bool(self.api_key and self.endpoint_url)

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": "Stable Diffusion 3",
            "type": "image-to-image",
            "provider": "Stability AI",
        }

    async def generate_img2img(self, request: GenerationRequest) -> GenerationResult:
        start_time = time.time()
        if not self.api_key:
            return GenerationResult(
                success=False,
                generated_images=[],
                error_message="Stability API key is not configured.",
                engine_used="stability",
            )

        is_valid, validation_error = self.validate_request(request)
        if not is_valid:
            return GenerationResult(
                success=False,
                generated_images=[],
                error_message=validation_error,
                engine_used="stability",
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "image/*",
        }
        generated_images = []
        image_filename, image_content_type = _uploaded_image_metadata(request.primary_image)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                for variation in range(1, 4):
                    prompt = self.prompt_builder.build_intent_prompt(request, variation)
                    data = {
                        "prompt": prompt,
                        "negative_prompt": (
                            f"{self.prompt_builder.build_negative_prompt(request)}, "
                            "changed room dimensions, changed floor plan, moved walls, "
                            "new or removed doors, new or removed windows, changed "
                            "ceiling, changed camera angle, changed perspective, "
                            "different room, outdoor or ocean view, unchanged furnishings, "
                            "unchanged bedding, people, human figures, laundry, "
                            "scattered personal items, temporary clutter"
                        ),
                        "mode": "image-to-image",
                        "strength": str(request.image_strength),
                        "output_format": "png",
                    }
                    files = {
                        "image": (
                            image_filename,
                            request.primary_image,
                            image_content_type,
                        ),
                    }
                    response = await client.post(
                        self.endpoint_url,
                        headers=headers,
                        data=data,
                        files=files,
                    )
                    if response.status_code != 200:
                        error_detail = response.text[:500]
                        logger.error(
                            "Stability AI request failed with HTTP %s: %s",
                            response.status_code,
                            error_detail,
                        )
                        return GenerationResult(
                            success=False,
                            generated_images=[],
                            error_message=(
                                f"Stability AI returned HTTP {response.status_code}: "
                                f"{error_detail}"
                            ),
                            engine_used="stability",
                        )

                    content_type = response.headers.get("content-type", "").split(";")[0]
                    if not content_type.startswith("image/"):
                        return GenerationResult(
                            success=False,
                            generated_images=[],
                            error_message="Stability AI returned a non-image response.",
                            engine_used="stability",
                        )

                    image_url = get_storage_service().upload_image(
                        response.content,
                        content_type,
                        folder="generated",
                    )
                    generated_images.append(image_url)
        except httpx.HTTPError as error:
            logger.exception("Stability AI request could not be completed")
            return GenerationResult(
                success=False,
                generated_images=[],
                error_message=f"Stability AI request failed: {error}",
                engine_used="stability",
            )
        except Exception as error:
            logger.exception("Could not save Stability AI generated image")
            return GenerationResult(
                success=False,
                generated_images=[],
                error_message=f"Could not save generated image: {error}",
                engine_used="stability",
            )

        return GenerationResult(
            success=True,
            generated_images=generated_images,
            engine_used="stability",
            model_version="Stable Diffusion 3",
            inference_time_seconds=time.time() - start_time,
        )


__all__ = ["StabilityImageEngine"]
