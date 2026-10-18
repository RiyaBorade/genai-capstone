"""
Design API Routes for AntarAalay.ai

Endpoints for:
- Generating AI designs with Stability AI
- Regenerating with customizations
- Fetching design history
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import asyncio
import json
import os
from sqlalchemy.orm import Session
import httpx

from app.dependencies import get_current_user, get_db
from app.models import Design, DesignImageVastuAnalysis, Room, RoomOrientation
from app.config import get_settings
from app.schemas.design import (
    DesignGenerateRequest,
    DesignGenerateResponse,
    DesignResponse,
    DesignListResponse,
    DesignCustomizationRequest,
)
from app.services.ai_engine import EngineFactory, EngineType, GenerationRequest, GenerationResult
from app.database import get_db_manager
from app.services.firebase_client import get_firestore, get_firebase_storage
from app.services.room_service import room_upload_service
from app.services.vastu_image_analyzer import (
    VastuImageAnalysisError,
    get_vastu_image_analyzer,
)
from app.services.storage import resolve_local_upload_url
import logging

logger = logging.getLogger(__name__)

# Simple in-memory rate limiting
user_requests = {}
VALID_CAMERA_DIRECTIONS = {
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
}


def _resolve_room_image_url(image_url: str, backend_base_url: str) -> str:
    """Point locally stored upload URLs at the backend handling this request."""
    return resolve_local_upload_url(image_url, backend_base_url)


def _decode_json_field(value):
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _decode_string_list(value) -> List[str]:
    decoded = _decode_json_field(value)
    if isinstance(decoded, list):
        return [item for item in decoded if isinstance(item, str)]
    if isinstance(decoded, str) and decoded and decoded != "None":
        return [decoded]
    return []


def _average_image_vastu_score(analyses: List[dict]) -> Optional[float]:
    scores = [
        analysis["score"]
        for analysis in analyses
        if isinstance(analysis, dict)
        and analysis.get("status") == "analyzed"
        and isinstance(analysis.get("score"), (int, float))
        and not isinstance(analysis.get("score"), bool)
    ]
    return sum(scores) / len(scores) if scores else None


def check_rate_limit(user_id: str, limit: int = 5, window_minutes: int = 1) -> bool:
    """Simple rate limiting check."""
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=window_minutes)
    
    # Clean old requests
    if user_id in user_requests:
        user_requests[user_id] = [req_time for req_time in user_requests[user_id] if req_time > window_start]
    else:
        user_requests[user_id] = []
    
    # Check if under limit
    if len(user_requests[user_id]) >= limit:
        return False
    
    # Add current request
    user_requests[user_id].append(now)
    return True


async def _analyze_generated_images(
    image_urls: List[str],
    room_type: str,
    camera_direction: str,
    backend_base_url: str,
    room_location: Optional[str] = None,
) -> List[dict]:
    analyzer = get_vastu_image_analyzer()
    if not analyzer.is_configured:
        return [
            {
                **analyzer.unavailable_result(room_type, camera_direction),
                "image_index": index,
                "room_location": room_location,
            }
            for index, _ in enumerate(image_urls, start=1)
        ]

    async def analyze_one(index: int, image_url: str) -> dict:
        resolved_url = _resolve_room_image_url(image_url, backend_base_url)
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                response = await client.get(resolved_url)
            if response.status_code != 200:
                raise VastuImageAnalysisError(
                    f"Could not load generated image {index} for Vastu analysis "
                    f"(HTTP {response.status_code})."
                )
            if len(response.content) > get_settings().MAX_UPLOAD_SIZE:
                raise VastuImageAnalysisError(
                    f"Generated image {index} is too large to analyze."
                )
            content_type = response.headers.get("content-type", "").split(";")[0].strip()
            assessment = await analyzer.analyze_image(
                response.content,
                content_type,
                room_type,
                camera_direction,
                room_location,
            )
        except httpx.HTTPError as error:
            logger.warning("Could not load generated image %s for Vastu analysis: %s", index, error)
            assessment = analyzer.failed_result(
                room_type,
                camera_direction,
                f"Could not load generated image {index} for Vastu analysis.",
                room_location,
            )
        except VastuImageAnalysisError as error:
            logger.warning("Vastu analysis failed for generated image %s: %s", index, error)
            assessment = analyzer.failed_result(
                room_type,
                camera_direction,
                str(error),
                room_location,
            )
        return {**assessment, "image_index": index}

    return await asyncio.gather(
        *(analyze_one(index, image_url) for index, image_url in enumerate(image_urls, start=1))
    )


async def _save_generated_design(
    db: Session,
    user_id: str,
    request: DesignGenerateRequest,
    result: GenerationResult,
    backend_base_url: str,
    camera_direction: str,
) -> str:
    image_urls = result.generated_images[:3]
    assessments = await _analyze_generated_images(
        image_urls,
        request.room_type or "living",
        camera_direction,
        backend_base_url,
        request.room_location,
    )
    design_id = str(uuid.uuid4())
    design = Design(
        id=design_id,
        user_id=user_id,
        room_id=request.room_id,
        style=request.style,
        wall_color=request.wall_color,
        flooring_material=request.flooring_material,
        image_1_url=image_urls[0] if len(image_urls) > 0 else None,
        image_2_url=image_urls[1] if len(image_urls) > 1 else None,
        image_3_url=image_urls[2] if len(image_urls) > 2 else None,
        estimated_cost=50000,
        budget_match_percentage=85.0,
        furniture_breakdown=json.dumps({
            "sofa": {"adjusted_price": 15000, "base_price": 12000, "quantity": 1},
            "table": {"adjusted_price": 8000, "base_price": 6000, "quantity": 1},
            "chairs": {"adjusted_price": 5000, "base_price": 4000, "quantity": 2}
        }),
        vastu_score=_average_image_vastu_score(assessments),
        vastu_suggestions=None,
        vastu_warnings=None,
        status="completed",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(design)
    for analysis in assessments:
        db.add(
            DesignImageVastuAnalysis(
                id=str(uuid.uuid4()),
                design_id=design_id,
                image_index=analysis["image_index"],
                assessment=analysis,
            )
        )
    db.commit()
    return design_id


router = APIRouter(prefix="/design", tags=["design"])


@router.post("/generate", response_model=DesignGenerateResponse)
async def generate_design(
    request: DesignGenerateRequest,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate AI interior designs using Models Lab API.
    
    - Uses professional Models Lab AI for high-quality interior design
    - Generates 3 professional interior variations
    - Applies rate limiting (5 per minute per user)
    - Saves designs to local database
    - Returns professional AI-generated images
    """
    try:
        user_id = current_user.get('uid') or current_user.get('localId') or current_user.get('user_id')
        
        print(f"=== DESIGN GENERATION STARTED ===")
        print(f"User ID: {user_id}")
        print(f"Request: room_id={request.room_id}, style={request.style}")
        
        # Check rate limiting
        if not check_rate_limit(user_id, limit=5, window_minutes=1):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: Maximum 5 design generations per minute"
            )
        
        logger.info(f"Starting professional design generation for user {user_id}")
        logger.info(f"Room ID: {request.room_id}, Style: {request.style}, Wall: {request.wall_color}, Flooring: {request.flooring_material}")
        
        # Use Stability when configured; retain the existing provider path otherwise.
        from app.services.ai_engine import EngineFactory, EngineType
        from app.services.ai_engine.base_engine import GenerationRequest
        from app.config import get_settings
        
        settings = get_settings()
        use_stability = bool(settings.STABLE_DIFFUSION_API_KEY.strip())

        # Create Flux Working engine with proper configuration
        engine_config = {
            'hf_token': settings.HF_TOKEN,
            'device': settings.DEVICE,
            'max_generations_per_hour': settings.FLUX_MAX_GENERATIONS_PER_HOUR,
            'max_generations_per_day': settings.FLUX_MAX_GENERATIONS_PER_DAY,
            'cooldown_seconds': settings.FLUX_COOLDOWN_SECONDS,
            'stability_api_key': settings.STABLE_DIFFUSION_API_KEY,
            'stability_api_url': settings.STABLE_DIFFUSION_API_URL,
            'stability_timeout_seconds': settings.STABLE_DIFFUSION_TIMEOUT,
        }
        engine_type = EngineType.STABILITY if use_stability else EngineType.FLUX_WORKING
        print(f"Creating {engine_type.value} engine")
        engine = EngineFactory.create_engine(engine_type, engine_config)
        print(f"{engine_type.value} engine created successfully")
        
        room_base_id = request.room_id.split('_')[0]
        single_room = db.query(Room).filter_by(id=request.room_id, user_id=user_id).first()
        rooms = [single_room] if single_room else []
        if not rooms:
            for direction in ['north', 'south', 'east', 'west']:
                room_id = f"{room_base_id}_{direction}"
                room = db.query(Room).filter_by(id=room_id, user_id=user_id).first()
                if room:
                    rooms.append(room)
        
        print(f"Found {len(rooms)} room images")
        
        if not rooms:
            print(f"ERROR: No rooms found for {room_base_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room images not found"
            )

        orientation = db.query(RoomOrientation).filter_by(
            room_id=room_base_id,
            user_id=user_id
        ).first()
        room_direction = orientation.direction if orientation else rooms[0].direction
        if not room_direction or room_direction not in VALID_CAMERA_DIRECTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid saved room compass direction is required. Re-upload the room with a confirmed direction."
            )
        
        print(f"Getting the uploaded room photo...")
        # Prefer the photo tagged with the saved camera direction; otherwise use
        # the first available view for older multi-photo room records.
        primary_room = next(
            (room for room in rooms if room.direction == room_direction),
            rooms[0],
        )
        primary_image_url = _resolve_room_image_url(
            primary_room.image_url,
            str(http_request.base_url),
        )
        print(f"Primary room image URL: {primary_image_url}")
        
        print(f"Downloading primary image...")
        # Download the primary image
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(primary_image_url)
            print(f"Download response status: {response.status_code}")
            if response.status_code != 200:
                print(f"ERROR: Failed to download image: {response.status_code}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to download room image"
                )
            primary_image = response.content
            print(f"Downloaded {len(primary_image)} bytes")
        
        print(f"Downloading all room images...")
        # Create room images dict
        room_images = {}
        for room in rooms:
            image_url = _resolve_room_image_url(
                room.image_url,
                str(http_request.base_url),
            )
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url)
                if response.status_code == 200:
                    room_images[room.direction] = response.content
        
        print(f"Downloaded {len(room_images)} room images")
        print(f"Creating GenerationRequest...")
        # Create generation request for Models Lab
        gen_request = GenerationRequest(
            primary_image=primary_image,
            room_images=room_images,
            room_type=request.room_type or "living",
            furniture_style=request.style.lower(),
            wall_color=request.wall_color.lower(),
            flooring_material=request.flooring_material.lower(),
            room_direction=room_direction,
            room_location=request.room_location,
            custom_prompt=request.custom_prompt,
            vastu_score=None,
            vastu_suggestions=None,
            vastu_warnings=None,
            image_strength=0.55 if use_stability else 0.4,
        )
        print(f"GenerationRequest created successfully")
        
        # Use the Flux Working engine we already created
        print(f"Using {engine_type.value} engine for generation...")
        
        result = GenerationResult(success=False, generated_images=[], error_message="Not initialized")
        
        try:
            result = await engine.generate_img2img(gen_request)
            print(f"AI generation result: success={result.success}, images={len(result.generated_images)}")
            
            if result.success:
                print("AI generation successful!")
                design_id = await _save_generated_design(
                    db,
                    user_id,
                    request,
                    result,
                    str(http_request.base_url),
                    room_direction,
                )
                logger.info(f"Generated {len(result.generated_images)} professional designs with {type(engine).__name__} in {result.inference_time_seconds:.2f}s")
                logger.info(f"Designs saved to database: {design_id}")
                
                return DesignGenerateResponse(
                    design_id=design_id,
                    status='success',
                    message=f'Generated {len(result.generated_images)} professional designs using {type(engine).__name__} AI'
                )
            else:
                print(f"AI generation failed: {result.error_message}")
        except Exception as e:
            print(f"AI engine error: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")

        if use_stability and not result.success:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Stability AI generation failed: {result.error_message}",
            )

        # If primary engine failed, try fallback
        if not result.success:
            print("Primary engine failed, trying fallback...")
            
            try:
                from app.services.ai_engine import EngineFactory, EngineType
                
                engine_config = {
                    'device': 'cpu'
                }
                print(f"Creating Models Lab engine...")
                engine = EngineFactory.create_engine(EngineType.LOCAL_SDXL, engine_config)
                print(f"Models Lab engine created successfully")
                
                # Find all room images
                room_images = {}
                for direction in ['north', 'south', 'east', 'west']:
                    image_key = f'{direction}_image'
                    if hasattr(request, image_key):
                        room_images[direction] = getattr(request, image_key)
                
                # Generate designs
                result = await engine.generate_img2img(gen_request)
                print(f"Models Lab API result: success={result.success}, images={len(result.generated_images)}")
                print(f"Error message: {result.error_message}")
                
                if result.success:
                    print("Models Lab generation successful!")
                    design_id = await _save_generated_design(
                        db,
                        user_id,
                        request,
                        result,
                        str(http_request.base_url),
                        room_direction,
                    )
                    logger.info(f"Generated {len(result.generated_images)} professional designs with Models Lab in {result.inference_time_seconds:.2f}s")
                    logger.info(f"Designs saved to database: {design_id}")
                    
                    return DesignGenerateResponse(
                        design_id=design_id,
                        status='success',
                        message=f'Generated {len(result.generated_images)} professional designs using Models Lab AI'
                    )
                else:
                    print(f"Models Lab failed: {result.error_message}")
            except Exception as e:
                print(f"Models Lab error: {e}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
        
        # If all AI engines failed, fall back to demo mode
        if not result.success:
            from app.services.demo_design_service import demo_service
            
            demo_result = demo_service.generate_demo_designs(
                room_id=request.room_id,
                style=request.style,
                wall_color=request.wall_color,
                flooring=request.flooring_material,
                user_id=user_id
            )
            
            # Save demo designs to database
            for design_data in demo_result["designs"]:
                design_data_clean = {k: v for k, v in design_data.items() if k != 'is_demo'}
                design = Design(**design_data_clean)
                db.add(design)
            
            db.commit()
            
            print(f"Demo designs saved to database: {demo_result['design_id']}")
            
            return DesignGenerateResponse(
                design_id=demo_result["design_id"],
                status='success',
                message='Demo designs generated (AI generation temporarily unavailable)'
            )
        
        if not result.success:
            print(f"ERROR: Models Lab generation failed: {result.error_message}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Design generation failed: {result.error_message}"
            )
        
        print(f"Saving designs to database...")
        design_id = await _save_generated_design(
            db,
            user_id,
            request,
            result,
            str(http_request.base_url),
            room_direction,
        )
        
        logger.info(f"Generated {len(result.generated_images)} professional designs with Models Lab in {result.inference_time_seconds:.2f}s")
        logger.info(f"Designs saved to database: {design_id}")
        
        return DesignGenerateResponse(
            design_id=design_id,
            status='success',
            message=f'Generated {len(result.generated_images)} professional designs using Models Lab AI'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Design generation failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {str(e)}"
        )


@router.post("/{design_id}/regenerate", response_model=DesignResponse)
async def regenerate_design(
    design_id: str,
    request: DesignCustomizationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Regenerate design with new customization options.
    
    - Uses layout-preserving image-to-image transformation
    - Applies new styling parameters
    - Creates new design version
    - Maintains original room geometry
    """
    try:
        user_id = current_user.get('uid') or current_user.get('localId')
        
        # Get AI design service
        from app.services.ai_design_service import get_ai_design_service
        ai_service = await get_ai_design_service()
        
        # Prepare updates
        updates = {}
        if request.style:
            updates['furniture_style'] = request.style
        if request.wall_color:
            updates['wall_color'] = request.wall_color
        if request.flooring_material:
            updates['flooring_material'] = request.flooring_material
        
        # Regenerate design
        result = await ai_service.regenerate_design(
            user_id=user_id,
            user_data=current_user,
            design_id=design_id,
            updates=updates
        )
        
        if result['status'] == 'rate_limited':
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error_code": result['error_code'],
                    "message": result['message']
                }
            )
        
        if result['status'] == 'failed':
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result['message']
            )
        
        logger.info(f"Design regenerated: {result['design_id']} from original {design_id}")
        
        # Return the new design
        return DesignResponse(
            design_id=result['design_id'],
            room_id=result.get('room_id', ''),
            user_id=user_id,
            style=request.style,
            customization=updates,
            generated_images=result.get('generated_images', []),
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Design regeneration failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regeneration failed: {str(e)}"
        )


@router.get("/room/{room_id}", response_model=DesignListResponse)
async def get_room_designs(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all designs for a room.
    """
    try:
        user_id = current_user.get('uid') or current_user.get('localId')
        
        # Verify room ownership
        room = await room_upload_service.get_room(room_id, user_id)
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room not found"
            )
        
        # Get designs
        firestore = get_firestore()
        designs = await firestore.get_room_designs(room_id, user_id)
        
        return DesignListResponse(
            designs=[DesignResponse(**d) for d in designs],
            total=len(designs)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch designs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch designs: {str(e)}"
        )


@router.get("/room/{room_id}/with-details")
async def get_room_designs_with_details(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get room designs along with room preview and budget summary.

    This endpoint is consumed by the frontend Designs page.
    """
    try:
        user_id = current_user.get('uid') or current_user.get('localId')

        room = await room_upload_service.get_room(room_id, user_id)
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room not found"
            )

        # Get designs from local database instead of Firestore
        from app.database import get_db_manager
        from app.models.design import Design
        
        db_manager = get_db_manager()
        with db_manager.session_scope() as session:
            designs = session.query(Design).filter(
                Design.room_id == room_id,
                Design.user_id == user_id
            ).order_by(Design.created_at.desc()).all()
            
            # Convert to list of dicts - match DesignResponse schema
            designs_list = []
            for design in designs:
                image_analyses = [
                    _decode_json_field(analysis.assessment)
                    for analysis in session.query(DesignImageVastuAnalysis)
                    .filter_by(design_id=design.id)
                    .order_by(DesignImageVastuAnalysis.image_index)
                    .all()
                ]
                # Parse furniture_breakdown from JSON string if needed
                furniture_data = design.furniture_breakdown
                if isinstance(furniture_data, str):
                    try:
                        furniture_data = json.loads(furniture_data)
                    except:
                        furniture_data = {}
                
                # Ensure furniture_data has the correct structure with adjusted_price
                if furniture_data and isinstance(furniture_data, dict):
                    formatted_furniture = {}
                    for item, details in furniture_data.items():
                        if isinstance(details, dict) and 'adjusted_price' in details:
                            formatted_furniture[item] = details
                        else:
                            # Convert simple number to proper structure
                            formatted_furniture[item] = {
                                'adjusted_price': details if isinstance(details, (int, float)) else 0,
                                'base_price': details if isinstance(details, (int, float)) else 0,
                                'quantity': 1
                            }
                    furniture_data = formatted_furniture
                
                designs_list.append({
                    'id': design.id,
                    'room_id': design.room_id,
                    'user_id': design.user_id,
                    'style': design.style,
                    'budget': design.budget or 0,
                    'image_1_url': design.image_1_url,
                    'image_2_url': design.image_2_url,
                    'image_3_url': design.image_3_url,
                    'estimated_cost': design.estimated_cost or 50000,
                    'budget_match_percentage': design.budget_match_percentage or 85,
                    'furniture_breakdown': furniture_data or {},
                    'vastu_score': _average_image_vastu_score(image_analyses),
                    'vastu_suggestions': [],
                    'vastu_warnings': [],
                    'image_vastu_analyses': image_analyses,
                    'status': design.status,
                    'created_at': design.created_at if design.created_at else datetime.utcnow()
                })

        room_image_url = (room.get("images") or {}).get("north")
        room_payload = {
            "id": room.get("room_id") or room_id,
            "image_url": room_image_url,
            "room_type": room.get("room_type"),
            "direction": room.get("direction"),
        }

        designs_payload = []
        for d in designs_list:
            design_obj = DesignResponse(**d)
            design_dump = design_obj.model_dump()
            logger.info(f"DesignResponse dump: {design_dump}")
            designs_payload.append(
                {
                    "design": design_dump,
                    "room_image_url": room_image_url,
                    "budget_summary": None,
                }
            )

        response_data = {
            "designs": designs_payload,
            "total": len(designs_payload),
            "room": room_payload,
        }
        logger.info(f"Full API response: {response_data}")
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch designs with details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch designs with details: {str(e)}"
        )


@router.get("/{design_id}", response_model=DesignResponse)
async def get_design(
    design_id: str,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific design by ID.
    """
    try:
        user_id = current_user.get('uid') or current_user.get('localId')
        
        # Query PostgreSQL instead of Firestore
        design = db.query(Design).filter(
            Design.id == design_id,
            Design.user_id == user_id
        ).first()
        
        if not design:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Design not found"
            )

        image_analyses = (
            db.query(DesignImageVastuAnalysis)
            .filter_by(design_id=design.id)
            .order_by(DesignImageVastuAnalysis.image_index)
            .all()
        )
        image_analysis_payloads = [
            _decode_json_field(analysis.assessment)
            for analysis in image_analyses
        ]
        
        # Convert to response format
        design_dict = {
            "id": design.id,
            "room_id": design.room_id,
            "user_id": design.user_id,
            "style": design.style,
            "budget": design.budget,
            "wall_color": design.wall_color,
            "flooring_material": design.flooring_material,
            "image_1_url": _resolve_room_image_url(
                design.image_1_url, str(http_request.base_url)
            ) if design.image_1_url else None,
            "image_2_url": _resolve_room_image_url(
                design.image_2_url, str(http_request.base_url)
            ) if design.image_2_url else None,
            "image_3_url": _resolve_room_image_url(
                design.image_3_url, str(http_request.base_url)
            ) if design.image_3_url else None,
            "estimated_cost": design.estimated_cost,
            "budget_match_percentage": design.budget_match_percentage,
            "furniture_breakdown": _decode_json_field(design.furniture_breakdown),
            "vastu_score": _average_image_vastu_score(image_analysis_payloads),
            "vastu_suggestions": _decode_string_list(design.vastu_suggestions),
            "vastu_warnings": _decode_string_list(design.vastu_warnings),
            "image_vastu_analyses": image_analysis_payloads,
            "status": design.status,
            "created_at": design.created_at.isoformat() if design.created_at else None,
            "updated_at": design.updated_at.isoformat() if design.updated_at else None,
        }
        
        return DesignResponse(**design_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch design: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch design: {str(e)}"
        )
