import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File, Form

from app.dependencies import get_current_user
from app.services.room_service import (
    VASTU_DIRECTIONS,
    direction_from_heading,
    room_upload_service,
)
from app.services.storage import resolve_local_upload_url

router = APIRouter(prefix="/room", tags=["room"])


@router.post("/upload-single")
async def upload_single_room_photo(
    request: Request,
    image: UploadFile = File(..., description="Single room photo"),
    direction: str = Form(..., description="Direction the camera faces"),
    heading_degrees: Optional[float] = Form(None),
    compass_confirmed: bool = Form(False),
    current_user: dict = Depends(get_current_user),
):
    """Upload one room photo with its manually selected or captured direction."""
    user_id = current_user.get("uid") or current_user.get("localId") or current_user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token",
        )

    direction = direction.strip().lower()
    if direction not in VASTU_DIRECTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select a valid Vastu direction.",
        )
    if heading_degrees is not None:
        if not compass_confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Confirm the compass direction before uploading.",
            )
        if not math.isfinite(heading_degrees) or not 0 <= heading_degrees < 360:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Compass heading must be between 0 and 360 degrees.",
            )
        if direction_from_heading(heading_degrees) != direction:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Direction does not match the confirmed compass heading.",
            )

    result = await room_upload_service.upload_single_room_photo(
        user_id=user_id,
        image=image,
        direction=direction,
        heading_degrees=heading_degrees,
    )
    result["image_url"] = resolve_local_upload_url(
        result["image_url"], str(request.base_url)
    )
    result["images"] = {
        direction: resolve_local_upload_url(image_url, str(request.base_url))
        for direction, image_url in result.get("images", {}).items()
    }
    return result


@router.post("/upload")
async def upload_room_images(
    request: Request,
    north: UploadFile = File(..., description="North facing image"),
    south: UploadFile = File(..., description="South facing image"),
    east: UploadFile = File(..., description="East facing image"),
    west: UploadFile = File(..., description="West facing image"),
    heading_degrees: Optional[float] = Form(None),
    compass_confirmed: bool = Form(False),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload 4 directional room images (North, South, East, West).
    
    - **north**: North facing image (JPEG/PNG/WebP, max 10MB)
    - **south**: South facing image (JPEG/PNG/WebP, max 10MB)
    - **east**: East facing image (JPEG/PNG/WebP, max 10MB)
    - **west**: West facing image (JPEG/PNG/WebP, max 10MB)
    - **heading_degrees**: Phone compass heading captured for the room (0-360)
    - **compass_confirmed**: Whether the user confirmed the captured heading
    
    Returns room_id and image URLs.
    """
    try:
        user_id = current_user.get('localId') or current_user.get('user_id')
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found in token"
            )

        if heading_degrees is not None:
            if not compass_confirmed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Confirm the room compass direction before uploading."
                )
            if not math.isfinite(heading_degrees) or not 0 <= heading_degrees < 360:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Compass heading must be between 0 and 360 degrees."
                )

        result = await room_upload_service.upload_room_images(
            user_id=user_id,
            north=north,
            south=south,
            east=east,
            west=west,
            heading_degrees=heading_degrees
        )
        result["images"] = {
            direction: resolve_local_upload_url(image_url, str(request.base_url))
            for direction, image_url in result.get("images", {}).items()
        }
        if result.get("image_url"):
            result["image_url"] = resolve_local_upload_url(
                result["image_url"], str(request.base_url)
            )
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


@router.get("/{room_id}")
async def get_room(
    room_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Get room details by ID
    """
    user_id = current_user.get('localId') or current_user.get('user_id')
    room = await room_upload_service.get_room(room_id, user_id)
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    if room:
        room["images"] = {
            direction: resolve_local_upload_url(image_url, str(request.base_url))
            for direction, image_url in room.get("images", {}).items()
        }
        if room.get("image_url"):
            room["image_url"] = resolve_local_upload_url(
                room["image_url"], str(request.base_url)
            )
    return room


@router.get("/user/rooms")
async def get_user_rooms(current_user: dict = Depends(get_current_user)):
    """Get all rooms for the current user."""
    user_id = current_user.get('localId') or current_user.get('user_id')
    rooms = await room_upload_service.get_user_rooms(user_id)
    return {"rooms": rooms, "total": len(rooms)}
