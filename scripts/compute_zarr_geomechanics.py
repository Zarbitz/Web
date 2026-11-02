#!/usr/bin/env python3
"""
Compute Geomechanics Datasets (Strain Rate, Stress Field, and Principal Direction)
and save them directly into the Zarr v3 store.

Datasets generated:
1. strain_rate: Maximum shear strain rate gamma_max (microstrain / year)
2. stress: Von Mises equivalent stress sigma_vM (MPa)
3. principal_angle: Orientation angle theta_p (degrees from East)
"""
import os
import sys
import numpy as np
import zarr
from zarr.codecs import BytesCodec, ZstdCodec
from scipy.ndimage import gaussian_filter

STORE_PATH = '/Volumes/2TB/personal work/dam dashobard/data/MH09HH1544/sbas/sbas_displacement_timeseries_all_dates.zarr'

def main():
    print(f"Opening Zarr store at: {STORE_PATH}")
    root = zarr.open_group(STORE_PATH, mode='a')
    
    vel = root['velocity'][:]
    coh = root['temporal_coherence'][:]
    
    print(f"Velocity shape: {vel.shape}, dtype: {vel.dtype}")
    
    # Grid spacing
    dx = 10.0  # meters
    dy = 10.0  # meters
    
    # Valid mask based on coherence and finite values
    valid_mask = np.isfinite(vel) & np.isfinite(coh) & (coh >= 0.15)
    print(f"Valid pixels: {np.sum(valid_mask)} / {vel.size} ({np.sum(valid_mask)/vel.size*100:.1f}%)")
    
    # Prepare filtered velocity for spatial differentiation
    # Replace NaNs with local mean for smooth gradient calculation
    vel_filled = np.where(valid_mask, vel, np.nan)
    
    # 2D inpainting / gaussian smoothing for stable gradients (1.0 pixel sigma = 10m spatial scale)
    # Normalized convolution with mask
    W = valid_mask.astype(np.float64)
    V = np.where(valid_mask, vel, 0.0)
    
    sigma = 1.0  # 1 pixel = 10m
    W_smooth = gaussian_filter(W, sigma=sigma, mode='nearest')
    V_smooth = gaussian_filter(V, sigma=sigma, mode='nearest')
    
    vel_smoothed = np.where(W_smooth > 0.1, V_smooth / np.maximum(W_smooth, 1e-6), np.nan)
    
    # Finite differences for spatial derivatives
    # X increases with column (East) -> d/dx
    # Y decreases with row (North) -> d/dy = d / (-d_row * 10)
    dvdX = np.full_like(vel, np.nan, dtype=np.float32)
    dvdY = np.full_like(vel, np.nan, dtype=np.float32)
    
    # Central difference for interior
    dvdX[:, 1:-1] = (vel_smoothed[:, 2:] - vel_smoothed[:, :-2]) / (2.0 * dx)
    # Boundary one-sided difference
    dvdX[:, 0] = (vel_smoothed[:, 1] - vel_smoothed[:, 0]) / dx
    dvdX[:, -1] = (vel_smoothed[:, -1] - vel_smoothed[:, -2]) / dx
    
    # Row gradient: Y decreases as row increases
    dvdY[1:-1, :] = (vel_smoothed[:-2, :] - vel_smoothed[2:, :]) / (2.0 * dy)
    dvdY[0, :] = (vel_smoothed[0, :] - vel_smoothed[1, :]) / dy
    dvdY[-1, :] = (vel_smoothed[-2, :] - vel_smoothed[-1, :]) / dy
    
    # Convert velocity gradient from (mm/yr)/m to microstrain/year:
    # 1 mm / (m * yr) = 1e-3 / yr = 1000 microstrain / yr (10^-6 / yr)
    exx = dvdX * 1000.0  # microstrain / yr
    eyy = dvdY * 1000.0  # microstrain / yr
    exy = 0.5 * (dvdX + dvdY) * 1000.0  # microstrain / yr
    
    # Maximum shear strain rate (microstrain / yr)
    gamma_max = np.sqrt(((exx - eyy) / 2.0)**2 + exy**2).astype(np.float32)
    
    # Principal strain direction angle (degrees from East in [-90, +90])
    theta_rad = 0.5 * np.arctan2(2.0 * exy, exx - eyy)
    principal_angle = np.degrees(theta_rad).astype(np.float32)
    
    # Principal strain rates
    eps_mean = (exx + eyy) / 2.0
    eps1 = eps_mean + gamma_max  # major principal strain rate
    eps2 = eps_mean - gamma_max  # minor principal strain rate
    
    # Linear Elasticity for Stress Field
    # Dam concrete / basalt bedrock parameters:
    # E = 25 GPa = 25,000 MPa, Poisson's ratio nu = 0.20
    E = 25000.0  # MPa
    nu = 0.20
    factor = E / (1.0 - nu**2) * 1e-6  # convert microstrain (10^-6) to MPa
    
    sigma1 = factor * (eps1 + nu * eps2)  # major principal stress (MPa)
    sigma2 = factor * (eps2 + nu * eps1)  # minor principal stress (MPa)
    
    # Von Mises Equivalent Stress (MPa)
    # sigma_vM = sqrt(sigma1^2 - sigma1*sigma2 + sigma2^2)
    stress_vm = np.sqrt(np.maximum(0.0, sigma1**2 - sigma1 * sigma2 + sigma2**2)).astype(np.float32)
    
    # Apply valid mask
    gamma_max = np.where(valid_mask, gamma_max, np.nan).astype(np.float32)
    stress_vm = np.where(valid_mask, stress_vm, np.nan).astype(np.float32)
    principal_angle = np.where(valid_mask, principal_angle, np.nan).astype(np.float32)
    
    valid_g = gamma_max[np.isfinite(gamma_max)]
    valid_s = stress_vm[np.isfinite(stress_vm)]
    valid_a = principal_angle[np.isfinite(principal_angle)]
    
    print("\n--- Summary Statistics ---")
    print(f"Strain Rate (microstrain/yr): min={valid_g.min():.1f}, p50={np.median(valid_g):.1f}, p90={np.percentile(valid_g, 90):.1f}, p99={np.percentile(valid_g, 99):.1f}, max={valid_g.max():.1f}")
    print(f"Von Mises Stress (MPa): min={valid_s.min():.2f}, p50={np.median(valid_s):.2f}, p90={np.percentile(valid_s, 90):.2f}, p99={np.percentile(valid_s, 99):.2f}, max={valid_s.max():.2f}")
    print(f"Principal Angle (deg): min={valid_a.min():.1f}, p50={np.median(valid_a):.1f}, max={valid_a.max():.1f}")
    
    # Write to Zarr v3 store
    arrays_to_write = [
        {
            'name': 'strain_rate',
            'data': gamma_max,
            'attributes': {
                'long_name': 'Maximum Shear Strain Rate',
                'units': 'microstrain/year',
                'description': 'Maximum 2D engineering shear strain rate derived from InSAR velocity field',
                'standard_name': 'shear_strain_rate'
            }
        },
        {
            'name': 'stress',
            'data': stress_vm,
            'attributes': {
                'long_name': 'Von Mises Equivalent Stress',
                'units': 'MPa',
                'description': 'Von Mises equivalent elastic stress field calculated with E=25GPa, nu=0.20',
                'standard_name': 'von_mises_stress'
            }
        },
        {
            'name': 'principal_angle',
            'data': principal_angle,
            'attributes': {
                'long_name': 'Principal Strain/Stress Orientation Angle',
                'units': 'degrees',
                'description': 'Orientation of maximum principal strain/stress axis measured counter-clockwise from East [-90, +90]',
                'standard_name': 'principal_stress_orientation'
            }
        }
    ]
    
    for arr_info in arrays_to_write:
        name = arr_info['name']
        print(f"\nWriting array: {name}...")
        
        # If array already exists in root, delete it first to ensure clean state
        arr_path = os.path.join(STORE_PATH, name)
        if os.path.exists(arr_path):
            import shutil
            shutil.rmtree(arr_path)
            print(f"Removed existing array at {arr_path}")
            
        zarr_arr = root.create_array(
            name=name,
            shape=(600, 600),
            chunks=(150, 150),
            dtype='float32',
            serializer=BytesCodec(endian='little'),
            compressors=[ZstdCodec(level=0, checksum=False)],
            attributes=arr_info['attributes'],
            dimension_names=['y', 'x'],
            fill_value=np.nan,
            overwrite=True
        )
        zarr_arr[:] = arr_info['data']
        print(f"Successfully wrote {name}: shape={zarr_arr.shape}, chunks={zarr_arr.chunks}")
        
    print("\nAll geomechanics datasets successfully computed and saved in Zarr v3 store!")

if __name__ == '__main__':
    main()
