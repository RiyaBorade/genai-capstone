import pytest

from app.services.room_service import direction_from_heading


@pytest.mark.parametrize(
    ("heading", "expected"),
    [
        (0, "north"),
        (30, "northeast"),
        (90, "east"),
        (150, "southeast"),
        (180, "south"),
        (225, "southwest"),
        (270, "west"),
        (315, "northwest"),
        (359, "north"),
        (-90, "west"),
    ],
)
def test_direction_from_heading(heading: float, expected: str) -> None:
    assert direction_from_heading(heading) == expected
