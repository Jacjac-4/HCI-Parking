"""Non-blocking API calls that preserve response data and report failures."""
import requests
from nicegui import run

API_BASE = "http://localhost:8003"


class ApiError(Exception):
    def __init__(self, message: str, *, uncertain: bool = False):
        super().__init__(message)
        self.uncertain = uncertain


async def request(method: str, path: str, payload: dict | None = None):
    try:
        response = await run.io_bound(
            requests.request, method, f"{API_BASE}{path}", json=payload, timeout=5,
        )
    except requests.RequestException as error:
        raise ApiError("Could not reach the parking service. Please try again.", uncertain=method == "POST") from error
    if not response.ok:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = None
        message = detail if isinstance(detail, str) else "The request could not be completed. Check your details and try again."
        raise ApiError(message, uncertain=method == "POST" and response.status_code >= 500)
    try:
        return response.json()
    except ValueError as error:
        raise ApiError("The parking service returned an unreadable response.", uncertain=method == "POST") from error
