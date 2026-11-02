# Dam Stability Observatory

Open http://localhost:8767/ while the local server is running.

## Views
- **Dam Map**: Idukki is the only registered dam. OpenStreetMap provides the geographic basemap; online connectivity is required for map tiles.
- **Zarr Overlay**: the supplied store identifies Temghar, Maharashtra. Its points use the Zarr latitude and longitude grids directly and remain aligned with the basemap during pan and zoom. Pixel selection uses the matching EPSG:32643 x/y grid. Idukki has no linked Zarr dataset yet. Time, coherence, selected-pixel statistics, polygon AOIs and transects use the supplied observations. Dot density adapts to zoom to prevent an opaque raster appearance; zoom in for individual 10 m cells.
- **3D View**: placeholder awaiting the user's model. No new model was generated for this view.

The deformation history and spatial profile use short vertical marks, as in the supplied chart reference. Their colour follows absolute LOS displacement: green below 1,000 mm, yellow near 1,000–2,000 mm, and red above 2,000 mm. Hover a mark for its value and sample or transect distance. These are display bands, not structural safety thresholds.

## Restart
Run from this folder:

```sh
python3 server.py --open
```

The default source is the copied store at `../data/MH09HH1544/sbas/sbas_displacement_timeseries_all_dates.zarr`. Override with `--zarr /path/to/store.zarr`. The drive must be mounted. Python 3.9+ is required; there are no Python package dependencies. The server binds only to localhost and exposes read-only file access and HTTP byte ranges. Zarr data is not copied or uploaded.

## Data interpretation
The store covers 2015-03-01 through 2026-10-24, not 2014. Values are LOS observations. Seasonal drift, acceleration and spatial-gradient metrics are proxies rather than calibrated dam-safety or joint-strain measurements. Full formulas and limitations are available under **Methods & provenance**.
