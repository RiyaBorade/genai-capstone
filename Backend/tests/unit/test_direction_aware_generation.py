from types import SimpleNamespace
from datetime import datetime
import json
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.routes.design import (
    _average_image_vastu_score,
    _resolve_room_image_url,
    get_design,
    generate_design,
)
from app.routes.room import upload_single_room_photo
from app.schemas.design import DesignGenerateRequest
from app.services.ai_engine import GenerationRequest, GenerationResult
from app.services.ai_engine.intent_prompt_builder import IntentBasedPromptBuilder
from app.services.demo_design_service import DemoDesignService
from app.services.ai_engine.stability_img2img_engine import StabilityImageEngine
from app.services.room_service import room_upload_service
from app.models import Room, RoomOrientation
from app.services.vastu_image_analyzer import VastuImageAnalyzer


def test_intent_prompt_uses_camera_direction_without_claiming_a_room_score():
    request = GenerationRequest(
        primary_image=b"room",
        room_images={"north": b"room"},
        room_type="living",
        furniture_style="modern",
        wall_color="white",
        flooring_material="hardwood",
        room_direction="south",
        room_location="north",
        custom_prompt="Add a three-seat sofa on the west wall",
        vastu_score=50,
        vastu_suggestions=["Keep heavy furniture in the south"],
        vastu_warnings=["Avoid water elements in the south"],
    )

    prompt = IntentBasedPromptBuilder().build_intent_prompt(request)

    assert "camera is facing south" in prompt
    assert "not the room's location within a floor plan" in prompt
    assert "user reports this room is located in the north sector" in prompt
    assert "exact room dimensions" in prompt
    assert "Do not add, remove, resize, or move any architectural feature" in prompt
    assert "Make the redesign visibly different from the source" in prompt
    assert "remove people and temporary clutter" in prompt
    assert "HARD CONSTRAINT: match the source photo's exact framing" in prompt
    assert "Current Vastu analysis score" not in prompt
    assert "ideally placed in north" not in prompt
    assert "Vastu furniture guidance" in prompt
    assert "Customer request: Add a three-seat sofa on the west wall" in prompt
    assert len(prompt) <= 2000


def test_local_upload_urls_use_the_current_backend_port():
    old_url = "http://127.0.0.1:8000/uploads/users/test/room/north.jpg"

    resolved_url = _resolve_room_image_url(old_url, "https://192.168.1.49:8001/")

    assert resolved_url == "https://192.168.1.49:8001/uploads/users/test/room/north.jpg"


def test_external_image_urls_are_not_rewritten():
    image_url = "https://images.example.test/room.jpg"

    assert _resolve_room_image_url(image_url, "https://192.168.1.49:8001/") == image_url


@pytest.mark.asyncio
async def test_design_response_rewrites_local_image_urls_for_request_host():
    design = SimpleNamespace(
        id="test-design",
        room_id="test-room",
        user_id="test-user",
        style="modern",
        budget=None,
        wall_color="white",
        flooring_material="hardwood",
        image_1_url="http://127.0.0.1:8001/uploads/generated/design.png",
        image_2_url=None,
        image_3_url=None,
        estimated_cost=50000,
        budget_match_percentage=85,
        furniture_breakdown=None,
        vastu_suggestions=None,
        vastu_warnings=None,
        status="completed",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    design_query = Mock()
    design_query.filter.return_value.first.return_value = design
    analysis_query = Mock()
    analysis_query.filter_by.return_value.order_by.return_value.all.return_value = []
    db = Mock()
    db.query.side_effect = [design_query, analysis_query]

    response = await get_design(
        design_id="test-design",
        http_request=SimpleNamespace(base_url="https://192.168.1.49:8001/"),
        current_user={"uid": "test-user"},
        db=db,
    )

    assert response.image_1_url == (
        "https://192.168.1.49:8001/uploads/generated/design.png"
    )


def test_image_vastu_average_ignores_unassessed_and_invalid_scores():
    assert _average_image_vastu_score(
        [
            {"status": "analyzed", "score": 70},
            {"status": "insufficient_evidence", "score": 99},
            {"status": "failed", "score": 81},
            {"status": "analyzed", "score": True},
        ]
    ) == 70
    assert _average_image_vastu_score(
        [{"status": "not_configured", "score": None}]
    ) is None


def test_demo_design_response_id_matches_a_saved_design_id():
    demo_result = DemoDesignService.generate_demo_designs(
        room_id="test-room",
        style="modern",
        wall_color="white",
        flooring="hardwood",
        user_id="test-user",
    )

    assert demo_result["design_id"] == demo_result["designs"][0]["id"]


@pytest.mark.asyncio
async def test_stability_engine_posts_room_image_and_vastu_prompt():
    image_bytes = b"generated-image"
    calls = []

    class MockResponse:
        status_code = 200
        content = image_bytes
        headers = {"content-type": "image/png"}
        text = ""

    class MockAsyncClient:
        def __init__(self, timeout):
            assert timeout == 45

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, headers, data, files):
            calls.append((url, headers, data, files))
            return MockResponse()

    request = GenerationRequest(
        primary_image=b"uploaded-room",
        room_images={"southwest": b"uploaded-room"},
        room_type="bedroom",
        furniture_style="traditional",
        wall_color="cream",
        flooring_material="hardwood",
        room_direction="southwest",
        vastu_score=100,
        vastu_suggestions=["Keep heavy furniture in the southwest"],
        image_strength=0.75,
    )
    storage = Mock()
    storage.upload_image.return_value = "http://localhost:8001/uploads/generated/design.png"
    engine = StabilityImageEngine(
        {
            "stability_api_key": "test-key",
            "stability_api_url": "https://stability.example/sd3",
            "stability_timeout_seconds": 45,
        }
    )

    with (
        patch("httpx.AsyncClient", MockAsyncClient),
        patch(
            "app.services.ai_engine.stability_img2img_engine.get_storage_service",
            return_value=storage,
        ),
    ):
        result = await engine.generate_img2img(request)

    assert result.success
    assert len(result.generated_images) == 3
    assert len(calls) == 3
    assert calls[0][1]["Authorization"] == "Bearer test-key"
    assert calls[0][2]["mode"] == "image-to-image"
    assert calls[0][2]["strength"] == "0.75"
    assert "changed room dimensions" in calls[0][2]["negative_prompt"]
    assert "new or removed windows" in calls[0][2]["negative_prompt"]
    assert "unchanged furnishings" in calls[0][2]["negative_prompt"]
    assert "temporary clutter" in calls[0][2]["negative_prompt"]
    assert calls[0][3]["image"][1] == b"uploaded-room"
    assert "southwest" in calls[0][2]["prompt"]
    assert result.generated_images[0].endswith("design.png")


@pytest.mark.asyncio
async def test_generate_design_passes_saved_orientation_and_analysis_to_engine():
    room_id = "test-room"
    user_id = "test-user"
    room = SimpleNamespace(
        id=room_id,
        direction="south",
        image_url="https://example.test/room.jpg",
    )
    single_room_query = Mock()
    single_room_query.filter_by.return_value.first.return_value = room

    orientation_query = Mock()
    orientation_query.filter_by.return_value.first.return_value = None
    db = Mock()
    db.query.side_effect = [single_room_query, orientation_query]

    engine = Mock()
    engine.generate_img2img = AsyncMock(
        return_value=GenerationResult(
            success=True,
            generated_images=[
                "https://example.test/design-1.jpg",
                "https://example.test/design-2.jpg",
            ],
            inference_time_seconds=1.0,
        )
    )
    vision_analyzer = SimpleNamespace(
        is_configured=True,
        analyze_image=AsyncMock(
            side_effect=[
                {
                    "status": "analyzed",
                    "score": 61.0,
                    "confidence": 0.8,
                    "summary": "Visible cues are mixed.",
                    "findings": [],
                    "limitations": [],
                    "error_message": None,
                    "room_type": "living",
                    "camera_direction": "south",
                    "room_location": "north",
                    "model": "test-vision",
                },
                {
                    "status": "analyzed",
                    "score": 88.0,
                    "confidence": 0.9,
                    "summary": "Visible cues are mostly aligned.",
                    "findings": [],
                    "limitations": [],
                    "error_message": None,
                    "room_type": "living",
                    "camera_direction": "south",
                    "model": "test-vision",
                },
            ]
        ),
    )

    class MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url):
            return SimpleNamespace(
                status_code=200,
                content=b"room image",
                headers={"content-type": "image/jpeg"},
            )

    settings = SimpleNamespace(
        HF_TOKEN="test-token",
        DEVICE="cpu",
        FLUX_MAX_GENERATIONS_PER_HOUR=10,
        FLUX_MAX_GENERATIONS_PER_DAY=50,
        FLUX_COOLDOWN_SECONDS=0,
        STABLE_DIFFUSION_API_KEY="test-stability-token",
        STABLE_DIFFUSION_API_URL="https://api.stability.ai/v2beta/stable-image/generate/sd3",
        STABLE_DIFFUSION_TIMEOUT=120,
        MAX_UPLOAD_SIZE=10 * 1024 * 1024,
    )
    request = DesignGenerateRequest(
        room_id=room_id,
        style="modern",
        room_type="living",
        room_location="north",
        wall_color="white",
        flooring_material="hardwood",
        custom_prompt="Add a three-seat sofa on the west wall",
    )

    with (
        patch("app.config.get_settings", return_value=settings),
        patch(
            "app.services.ai_engine.EngineFactory.create_engine",
            return_value=engine,
        ) as create_engine,
        patch("app.routes.design.check_rate_limit", return_value=True),
        patch("httpx.AsyncClient", MockAsyncClient),
        patch("app.routes.design.get_vastu_image_analyzer", return_value=vision_analyzer),
    ):
        await generate_design(
            request,
            http_request=SimpleNamespace(base_url="http://127.0.0.1:8001/"),
            current_user={"uid": user_id},
            db=db,
        )

    assert create_engine.call_args.args[0].value == "stability"
    generation_request = engine.generate_img2img.await_args.args[0]
    assert generation_request.room_direction == "south"
    assert generation_request.room_location == "north"
    assert generation_request.image_strength == 0.55
    assert generation_request.vastu_score is None
    assert generation_request.vastu_suggestions is None
    assert generation_request.vastu_warnings is None
    assert generation_request.custom_prompt == "Add a three-seat sofa on the west wall"

    saved_design = db.add.call_args_list[0].args[0]
    saved_analyses = [call.args[0] for call in db.add.call_args_list[1:]]
    assert saved_design.vastu_score == 74.5
    assert [analysis.image_index for analysis in saved_analyses] == [1, 2]
    assert [analysis.assessment["score"] for analysis in saved_analyses] == [61, 88]
    assert vision_analyzer.analyze_image.await_count == 2


@pytest.mark.asyncio
async def test_vastu_image_analyzer_sends_image_and_parses_evidence_based_score():
    findings = [
        {
            "guideline": "Keep center circulation open",
            "assessment": "aligned",
            "evidence": "The center floor area is visibly clear.",
            "confidence": 0.8,
        },
        {
            "guideline": "Kitchen cooking area in southeast",
            "assessment": "concern",
            "evidence": "The stove appears on the left, but cardinal zone is uncertain.",
            "confidence": 0.6,
        },
    ]
    response_body = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "score": 54,
                                    "confidence": 0.72,
                                    "summary": "Two visible findings were assessed.",
                                    "findings": findings,
                                    "limitations": ["The room footprint is not visible."],
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    requests = []

    class MockResponse:
        status_code = 200

        def json(self):
            return response_body

    class MockAsyncClient:
        def __init__(self, timeout):
            assert timeout == 60

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, headers, json):
            requests.append((url, headers, json))
            return MockResponse()

    analyzer = VastuImageAnalyzer(
        SimpleNamespace(
            GEMINI_API_KEY="test-key",
            VASTU_VISION_MODEL="gemini-test",
            VASTU_VISION_TIMEOUT_SECONDS=60,
        )
    )
    with patch("httpx.AsyncClient", MockAsyncClient):
        report = await analyzer.analyze_image(
            b"generated room bytes",
            "image/jpeg",
            "kitchen",
            "south",
            "north",
        )

    assert report["status"] == "analyzed"
    assert report["score"] == 54.0
    assert report["findings"] == findings
    assert report["camera_direction"] == "south"
    assert report["room_location"] == "north"
    assert report["model"] == "gemini-test"
    assert "not the room's location within the home" in requests[0][2]["contents"][0]["parts"][0]["text"]
    assert "user reports this room is in the north sector" in requests[0][2]["contents"][0]["parts"][0]["text"]
    assert requests[0][2]["contents"][0]["parts"][1]["inline_data"]["data"]
    assert requests[0][1]["x-goog-api-key"] == "test-key"


@pytest.mark.asyncio
async def test_vastu_image_analyzer_does_not_score_without_vision_key():
    analyzer = VastuImageAnalyzer(
        SimpleNamespace(
            GEMINI_API_KEY="",
            VASTU_VISION_MODEL="gemini-test",
            VASTU_VISION_TIMEOUT_SECONDS=60,
        )
    )

    report = await analyzer.analyze_image(b"image", "image/jpeg", "living", "north")

    assert report["status"] == "not_configured"
    assert report["score"] is None
    assert "GEMINI_API_KEY" in report["error_message"]


def test_vastu_image_analyzer_withholds_score_when_visual_evidence_is_insufficient():
    report = VastuImageAnalyzer._validate_assessment(
        {
            "score": 95,
            "confidence": 0.9,
            "summary": "Only one detail is visible.",
            "findings": [
                {
                    "guideline": "Keep the center open",
                    "assessment": "aligned",
                    "evidence": "An open floor patch is visible.",
                    "confidence": 0.8,
                }
            ],
            "limitations": [],
        },
        "living",
        "north",
    )

    assert report["status"] == "insufficient_evidence"
    assert report["score"] is None


@pytest.mark.asyncio
async def test_single_photo_upload_route_passes_direction_and_confirmed_heading():
    image = Mock()
    expected = {
        "room_id": "test-room",
        "image_url": "http://127.0.0.1:8001/uploads/room.png",
        "images": {"northeast": "http://127.0.0.1:8001/uploads/room.png"},
        "direction": "northeast",
    }

    with patch(
        "app.routes.room.room_upload_service.upload_single_room_photo",
        new=AsyncMock(return_value=expected),
    ) as upload:
        result = await upload_single_room_photo(
            request=SimpleNamespace(base_url="https://192.168.1.49:8001/"),
            image=image,
            direction="northeast",
            heading_degrees=45,
            compass_confirmed=True,
            current_user={"uid": "test-user"},
        )

    assert result["image_url"] == "https://192.168.1.49:8001/uploads/room.png"
    assert result["images"] == {
        "northeast": "https://192.168.1.49:8001/uploads/room.png"
    }
    upload.assert_awaited_once_with(
        user_id="test-user",
        image=image,
        direction="northeast",
        heading_degrees=45,
    )


@pytest.mark.asyncio
async def test_single_photo_upload_rejects_heading_that_disagrees_with_direction():
    with pytest.raises(HTTPException) as error:
        await upload_single_room_photo(
            request=SimpleNamespace(base_url="https://192.168.1.49:8001/"),
            image=Mock(),
            direction="south",
            heading_degrees=45,
            compass_confirmed=True,
            current_user={"uid": "test-user"},
        )
    assert "does not match" in error.value.detail


@pytest.mark.asyncio
async def test_single_photo_upload_saves_photo_with_its_vastu_direction():
    image = Mock()
    image.content_type = "image/jpeg"
    image.read = AsyncMock(return_value=b"room-photo")
    image.seek = AsyncMock()
    session = Mock()
    db_manager = Mock()
    db_manager.session_scope.return_value = MagicMock()
    db_manager.session_scope.return_value.__enter__.return_value = session

    with (
        patch.object(
            room_upload_service.storage_service,
            "upload_image",
            return_value="https://example.test/room.jpg",
        ) as save_image,
        patch("app.database.get_db_manager", return_value=db_manager),
    ):
        result = await room_upload_service.upload_single_room_photo(
            user_id="test-user",
            image=image,
            direction="east",
            heading_degrees=90,
        )

    saved_room, saved_orientation = [
        call.args[0] for call in session.add.call_args_list
    ]
    assert isinstance(saved_room, Room)
    assert saved_room.id == result["room_id"]
    assert saved_room.direction == "east"
    assert isinstance(saved_orientation, RoomOrientation)
    assert saved_orientation.direction == "east"
    assert saved_orientation.heading_degrees == 90
    save_image.assert_called_once_with(
        b"room-photo",
        "image/jpeg",
        f"users/test-user/rooms/{result['room_id']}",
    )
    session.commit.assert_called_once()
