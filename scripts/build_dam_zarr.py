#!/usr/bin/env python3
"""
Convert any dam's SBAS GeoTIFF stack into a Zarr v3 store with full geomechanics layers
(displacement, velocity, temporal_coherence, strain_rate, stress, principal_angle)
using pure wheel packages (tifffile, zarr, numpy, scipy).
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import tifffile
from scipy.ndimage import gaussian_filter
import zarr
from zarr.codecs import BytesCodec, ZstdCodec


def build_zarr_for_dam(sbas_dir: Path, dam_meta: dict = None) -> Path:
    sbas_dir = Path(sbas_dir)
    tif_file = sbas_dir / "sbas_displacement_timeseries_all_dates.tif"
    zarr_dir = sbas_dir / "sbas_displacement_timeseries_all_dates.zarr"

    if not tif_file.exists():
        raise FileNotFoundError(f"Missing SBAS GeoTIFF: {tif_file}")

    # Check if already built with geomechanics
    if (
        (zarr_dir / "zarr.json").exists()
        and (zarr_dir / "displacement" / "zarr.json").exists()
        and (zarr_dir / "strain_rate" / "zarr.json").exists()
        and (zarr_dir / "stress" / "zarr.json").exists()
        and (zarr_dir / "principal_angle" / "zarr.json").exists()
    ):
        return zarr_dir

    t0 = time.time()
    pic = (dam_meta or {}).get("PIC") or sbas_dir.parent.name
    dam_name = (dam_meta or {}).get("name") or pic
    state = (dam_meta or {}).get("state") or ""

    print(f"🔄 Building Zarr v3 + Geomechanics for {pic} ({dam_name})...")

    with tifffile.TiffFile(str(tif_file)) as tif:
        gm = tif.geotiff_metadata or {}
        tiepoint = gm.get("ModelTiepoint", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        scale = gm.get("ModelPixelScale", [10.0, 10.0, 0.0])
        gt = [
            float(tiepoint[3]),
            float(scale[0]),
            0.0,
            float(tiepoint[4]),
            0.0,
            -float(scale[1]),
        ]
        epsg_val = gm.get("ProjectedCSTypeGeoKey", 32643)
        epsg = int(getattr(epsg_val, "value", epsg_val) or 32643)
        raw_arr = tif.asarray()

    # Handle (H, W, N) vs (N, H, W)
    if raw_arr.ndim == 3 and raw_arr.shape[0] == 600 and raw_arr.shape[1] == 600 and raw_arr.shape[2] != 600:
        disp_arr = np.transpose(raw_arr, (2, 0, 1)).astype(np.float32)
    elif raw_arr.ndim == 3:
        disp_arr = raw_arr.astype(np.float32)
    else:
        disp_arr = raw_arr[np.newaxis, :, :].astype(np.float32)

    N, H, W = disp_arr.shape

    dates_file = sbas_dir / "dates.json"
    if dates_file.exists():
        with open(dates_file) as f:
            raw_dates = json.load(f)
        date_strs = [
            f"{str(d)[:4]}-{str(d)[4:6]}-{str(d)[6:8]}" if len(str(d)) == 8 else str(d)
            for d in raw_dates
        ]
    else:
        date_strs = [f"epoch_{i+1:03d}" for i in range(N)]

    if len(date_strs) > N:
        date_strs = date_strs[:N]
    elif len(date_strs) < N:
        for i in range(len(date_strs) + 1, N + 1):
            date_strs.append(f"epoch_{i:03d}")

    x_coords = gt[0] + (np.arange(W) + 0.5) * gt[1]
    y_coords = gt[3] + (np.arange(H) + 0.5) * gt[5]

    disp_arr = np.where(disp_arr == -9999.0, np.nan, disp_arr).astype(np.float32)

    vel_file = sbas_dir / "sbas_velocity_map.tif"
    coh_file = sbas_dir / "sbas_temporal_coherence.tif"

    if vel_file.exists():
        with tifffile.TiffFile(str(vel_file)) as tif_vel:
            vel_arr = tif_vel.asarray().astype(np.float32)
            if vel_arr.ndim == 3:
                vel_arr = vel_arr[0] if vel_arr.shape[0] == 1 else vel_arr[:, :, 0]
            vel_arr = np.where(vel_arr == -9999.0, np.nan, vel_arr)
    else:
        vel_arr = np.zeros((H, W), dtype=np.float32)

    if coh_file.exists():
        with tifffile.TiffFile(str(coh_file)) as tif_coh:
            coh_arr = tif_coh.asarray().astype(np.float32)
            if coh_arr.ndim == 3:
                coh_arr = coh_arr[0] if coh_arr.shape[0] == 1 else coh_arr[:, :, 0]
            coh_arr = np.where(coh_arr == -9999.0, np.nan, coh_arr)
    else:
        coh_arr = np.ones((H, W), dtype=np.float32)

    if zarr_dir.exists():
        shutil.rmtree(zarr_dir)

    root = zarr.open_group(str(zarr_dir), mode="w", zarr_format=3)
    root.attrs.update(
        {
            "title": "SBAS InSAR Displacement Time Series (Zarr v3)",
            "source_geotiff": str(tif_file.name),
            "dam_pic": pic,
            "dam_name": dam_name,
            "state": state,
            "crs_epsg": epsg,
            "spatial_resolution_meters": float(abs(gt[1])),
            "geotransform": [float(v) for v in gt],
            "utm_bounds": [
                float(x_coords[0]),
                float(y_coords[-1]),
                float(x_coords[-1]),
                float(y_coords[0]),
            ],
            "first_acquisition": date_strs[0],
            "latest_acquisition": date_strs[-1],
            "total_acquisition_dates": N,
            "zarr_specification": "v3.0",
            "convention": "CF-1.8",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        }
    )

    time_arr = root.create_array(
        name="time",
        shape=(N,),
        chunks=(N,),
        dtype="str",
        dimension_names=["time"],
        attributes={"standard_name": "time", "long_name": "Acquisition date in YYYY-MM-DD"},
    )
    time_arr[:] = date_strs

    x_arr = root.create_array(
        name="x",
        shape=(W,),
        chunks=(W,),
        dtype="float64",
        dimension_names=["x"],
        attributes={"standard_name": "projection_x_coordinate", "units": "m"},
    )
    x_arr[:] = x_coords

    y_arr = root.create_array(
        name="y",
        shape=(H,),
        chunks=(H,),
        dtype="float64",
        dimension_names=["y"],
        attributes={"standard_name": "projection_y_coordinate", "units": "m"},
    )
    y_arr[:] = y_coords

    chunk_t = min(35, N)
    chunk_y = 150
    chunk_x = 150

    disp_ds = root.create_array(
        name="displacement",
        shape=(N, H, W),
        chunks=(chunk_t, chunk_y, chunk_x),
        dtype="float32",
        fill_value=float("nan"),
        serializer=BytesCodec(endian="little"),
        compressors=[ZstdCodec(level=0, checksum=False)],
        dimension_names=["time", "y", "x"],
        attributes={"units": "mm", "reference_date": date_strs[0]},
    )
    disp_ds[:] = disp_arr

    vel_ds = root.create_array(
        name="velocity",
        shape=(H, W),
        chunks=(chunk_y, chunk_x),
        dtype="float32",
        fill_value=float("nan"),
        serializer=BytesCodec(endian="little"),
        compressors=[ZstdCodec(level=0, checksum=False)],
        dimension_names=["y", "x"],
        attributes={"units": "mm/year"},
    )
    vel_ds[:] = vel_arr

    coh_ds = root.create_array(
        name="temporal_coherence",
        shape=(H, W),
        chunks=(chunk_y, chunk_x),
        dtype="float32",
        fill_value=float("nan"),
        serializer=BytesCodec(endian="little"),
        compressors=[ZstdCodec(level=0, checksum=False)],
        dimension_names=["y", "x"],
        attributes={"units": "unitless"},
    )
    coh_ds[:] = coh_arr

    # Compute Geomechanics Layers (Strain Rate, Stress, Principal Angle)
    dx = float(abs(gt[1])) or 10.0
    dy = float(abs(gt[5])) or 10.0
    valid_mask = np.isfinite(vel_arr) & np.isfinite(coh_arr) & (coh_arr >= 0.15)

    W_mask = valid_mask.astype(np.float64)
    V_masked = np.where(valid_mask, vel_arr, 0.0)
    W_smooth = gaussian_filter(W_mask, sigma=1.0, mode="nearest")
    V_smooth = gaussian_filter(V_masked, sigma=1.0, mode="nearest")
    vel_smoothed = np.where(W_smooth > 0.1, V_smooth / np.maximum(W_smooth, 1e-6), np.nan)

    dvdX = np.full_like(vel_arr, np.nan, dtype=np.float32)
    dvdY = np.full_like(vel_arr, np.nan, dtype=np.float32)

    dvdX[:, 1:-1] = (vel_smoothed[:, 2:] - vel_smoothed[:, :-2]) / (2.0 * dx)
    dvdX[:, 0] = (vel_smoothed[:, 1] - vel_smoothed[:, 0]) / dx
    dvdX[:, -1] = (vel_smoothed[:, -1] - vel_smoothed[:, -2]) / dx

    dvdY[1:-1, :] = (vel_smoothed[:-2, :] - vel_smoothed[2:, :]) / (2.0 * dy)
    dvdY[0, :] = (vel_smoothed[0, :] - vel_smoothed[1, :]) / dy
    dvdY[-1, :] = (vel_smoothed[-2, :] - vel_smoothed[-1, :]) / dy

    exx = dvdX * 1000.0
    eyy = dvdY * 1000.0
    exy = 0.5 * (dvdX + dvdY) * 1000.0

    gamma_max = np.sqrt(((exx - eyy) / 2.0) ** 2 + exy**2).astype(np.float32)
    theta_rad = 0.5 * np.arctan2(2.0 * exy, exx - eyy)
    principal_angle = np.degrees(theta_rad).astype(np.float32)

    eps_mean = (exx + eyy) / 2.0
    eps1 = eps_mean + gamma_max
    eps2 = eps_mean - gamma_max

    E = 25000.0
    nu = 0.20
    factor = E / (1.0 - nu**2) * 1e-6
    sigma1 = factor * (eps1 + nu * eps2)
    sigma2 = factor * (eps2 + nu * eps1)
    stress_vm = np.sqrt(np.maximum(0.0, sigma1**2 - sigma1 * sigma2 + sigma2**2)).astype(np.float32)

    gamma_max = np.where(valid_mask, gamma_max, np.nan).astype(np.float32)
    stress_vm = np.where(valid_mask, stress_vm, np.nan).astype(np.float32)
    principal_angle = np.where(valid_mask, principal_angle, np.nan).astype(np.float32)

    for name, arr, units in [
        ("strain_rate", gamma_max, "microstrain/year"),
        ("stress", stress_vm, "MPa"),
        ("principal_angle", principal_angle, "degrees"),
    ]:
        z_arr = root.create_array(
            name=name,
            shape=(H, W),
            chunks=(chunk_y, chunk_x),
            dtype="float32",
            fill_value=float("nan"),
            serializer=BytesCodec(endian="little"),
            compressors=[ZstdCodec(level=0, checksum=False)],
            dimension_names=["y", "x"],
            attributes={"units": units},
        )
        z_arr[:] = arr

    print(f"✅ Built {zarr_dir} in {time.time() - t0:.2f}s (N={N}, H={H}, W={W})")
    return zarr_dir


if __name__ == "__main__":
    target_dir = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "/Volumes/2TB/personal work/dam dashobard/data/KL29VH0027/sbas"
    )
    build_zarr_for_dam(target_dir, {"PIC": target_dir.parent.name})
