"""Geofence lookups: which neighborhood/district/zones a point is in, and the map layers."""
from __future__ import annotations

from fastapi import APIRouter, Response

from contracts.models import GeoInfo
from backend.engine import geofence

router = APIRouter()


@router.get("/geofence", response_model=GeoInfo)
async def get_geofence(lat: float, lng: float):
    return geofence.geofence(lat, lng)


@router.get("/geofence/layers")
async def get_layers(response: Response):
    response.headers["Cache-Control"] = "public, max-age=3600"
    return geofence.layers()
