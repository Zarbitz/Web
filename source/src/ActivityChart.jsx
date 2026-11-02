import React, { useState, useRef, useLayoutEffect, useId } from 'react';

export const ECCHARTS_CAPE_10 = [
  '#FFFFFF', // 0: < 250 mm (Stable)
  '#FFFACC', // 1: 250 - 500 mm
  '#FFEB80', // 2: 500 - 750 mm
  '#FFD133', // 3: 750 - 1000 mm
  '#FFAD00', // 4: 1000 - 1250 mm
  '#FF8000', // 5: 1250 - 1500 mm
  '#FA4C00', // 6: 1500 - 1750 mm
  '#E61A00', // 7: 1750 - 2000 mm
  '#BF001A', // 8: 2000 - 2500 mm
  '#8C0033'  // 9: > 2500 mm (Extreme)
];

export function activityColor(value) {
  if (!Number.isFinite(value)) return '#d4d4d8';
  const mag = Math.abs(value);
  const cat = mag >= 2500 ? 9 :
              mag >= 2000 ? 8 :
              mag >= 1750 ? 7 :
              mag >= 1500 ? 6 :
              mag >= 1250 ? 5 :
              mag >= 1000 ? 4 :
              mag >= 750  ? 3 :
              mag >= 500  ? 2 :
              mag >= 250  ? 1 : 0;
  return ECCHARTS_CAPE_10[cat];
}

function getSplinePath(pts) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 5;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 5;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 5;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 5;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function ActivityChart({
  data = [],
  height = 90,
  unit = 'LOS displacement · mm',
  valueUnit = 'mm',
  xlabels,
  selected,
  dates = [],
  date = null,
  fillHeight = false,
  isPopup = false
}) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 750, h: typeof height === 'number' ? height : 150 });
  const [hover, setHover] = useState(null);

  const rawId = useId ? useId().replace(/[^a-zA-Z0-9]/g, '') : Math.random().toString(36).substr(2, 6);
  const gradId = `capeGrad_${rawId}`;
  const areaGradId = `capeAreaGrad_${rawId}`;

  // Dynamically attach to container dimensions so there is ZERO aspect-ratio stretching
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 30) {
        setDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const rawValues = Array.isArray(data) ? data : [];
  const finite = rawValues.filter(Number.isFinite);

  // Robust percentile scale to prevent isolated unwrap noise (e.g. +2600mm) from squashing graph
  let lo = -20, hi = 20;
  if (finite.length > 0) {
    const sorted = [...finite].sort((a, b) => a - b);
    const p02 = sorted[Math.floor(sorted.length * 0.02)];
    const p98 = sorted[Math.floor(sorted.length * 0.98)];
    const iqr = Math.max(8, p98 - p02);
    const margin = Math.max(6, iqr * 0.18);
    lo = p02 - margin;
    hi = p98 + margin;
  }
  if (hi <= lo) { lo -= 1; hi += 1; }

  // Canvas bounds in true pixel coordinates
  const W = dims.w;
  const H = dims.h;
  const x0 = isPopup ? 64 : 48;
  const x1 = W - (isPopup ? 24 : 14);
  const y0 = isPopup ? 38 : 22;
  const y1 = H - (isPopup ? 28 : 18);
  const plotW = Math.max(10, x1 - x0);
  const plotH = Math.max(10, y1 - y0);

  const y = v => y0 + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotH;
  const x = i => x0 + (i / Math.max(1, rawValues.length - 1)) * plotW;

  // Continuous curve construction with gap interpolation and gentle smoothing
  const densePts = [];
  let validInterpValues = [];
  if (rawValues.length > 0 && finite.length > 0) {
    // 1. Linearly interpolate gaps across non-finite samples
    const interpolated = new Float64Array(rawValues.length);
    let lastValidIdx = -1;
    for (let i = 0; i < rawValues.length; i++) {
      if (Number.isFinite(rawValues[i])) {
        if (lastValidIdx !== -1 && i - lastValidIdx > 1) {
          const v0 = rawValues[lastValidIdx];
          const v1 = rawValues[i];
          for (let k = lastValidIdx + 1; k < i; k++) {
            const frac = (k - lastValidIdx) / (i - lastValidIdx);
            interpolated[k] = v0 + frac * (v1 - v0);
          }
        }
        interpolated[i] = rawValues[i];
        lastValidIdx = i;
      }
    }
    // Fill edges if ends are empty
    if (lastValidIdx !== -1) {
      for (let i = lastValidIdx + 1; i < rawValues.length; i++) interpolated[i] = rawValues[lastValidIdx];
    }
    const firstValidIdx = rawValues.findIndex(Number.isFinite);
    if (firstValidIdx > 0) {
      for (let i = 0; i < firstValidIdx; i++) interpolated[i] = rawValues[firstValidIdx];
    }

    // 2. Gentle 3-point smoothing filter for organic mountain elevation curve
    const smoothed = new Float64Array(rawValues.length);
    for (let i = 0; i < rawValues.length; i++) {
      const p = interpolated[Math.max(0, i - 1)];
      const c = interpolated[i];
      const n = interpolated[Math.min(rawValues.length - 1, i + 1)];
      smoothed[i] = 0.22 * p + 0.56 * c + 0.22 * n;
    }
    validInterpValues = smoothed;

    // 3. Build dense points
    const step = rawValues.length > 300 ? Math.ceil(rawValues.length / 200) : 1;
    for (let i = 0; i < rawValues.length; i += step) {
      densePts.push([x(i), y(smoothed[i])]);
    }
    if ((rawValues.length - 1) % step !== 0) {
      densePts.push([x(rawValues.length - 1), y(smoothed[rawValues.length - 1])]);
    }
  }

  const lineD = getSplinePath(densePts);
  const zeroVal = Math.max(lo, Math.min(hi, 0));
  const zeroY = y(zeroVal);
  const areaD = lineD ? `${lineD} L ${x1.toFixed(1)},${y1.toFixed(1)} L ${x0.toFixed(1)},${y1.toFixed(1)} Z` : '';

  // Generate clear Y-axis ticks adapted to plotH so labels never overlap
  const numYTicks = isPopup ? 5 : (plotH < 58 ? 3 : 4);
  const yTicks = [];
  for (let t = 0; t < numYTicks; t++) {
    const frac = t / (numYTicks - 1);
    const tickVal = lo + frac * (hi - lo);
    yTicks.push({ val: tickVal, y: y(tickVal) });
  }

  // Generate X-axis ticks (Start, Mid, End)
  const x0Label = xlabels?.[0] || (dates.length ? dates[0].slice(0, 4) : '0 m');
  const x1Label = xlabels?.[1] || (dates.length ? dates[dates.length - 1].slice(0, 4) : 'End');
  let midLabel = '';
  if (xlabels?.[1] && xlabels[1].includes('m')) {
    const totalDist = parseFloat(xlabels[1].replace(/,/g, ''));
    if (Number.isFinite(totalDist)) midLabel = `${Math.round(totalDist / 2).toLocaleString()} m`;
  } else if (dates.length > 2) {
    midLabel = (dates[Math.floor(dates.length / 2)] || '').slice(0, 4);
  }

  // Prominent peak callout
  let peaks = [];
  if (validInterpValues.length > 0) {
    let maxIdx = 0, maxVal = -Infinity;
    for (let i = 0; i < validInterpValues.length; i++) {
      if (validInterpValues[i] > maxVal) { maxVal = validInterpValues[i]; maxIdx = i; }
    }
    if (Number.isFinite(maxVal)) {
      peaks.push({ idx: maxIdx, val: maxVal, pt: [x(maxIdx), y(maxVal)] });

      if (isPopup) {
        let secIdx = -1, secVal = -Infinity;
        for (let i = 0; i < validInterpValues.length; i++) {
          if (Math.abs(i - maxIdx) > validInterpValues.length * 0.25) {
            if (validInterpValues[i] > secVal) { secVal = validInterpValues[i]; secIdx = i; }
          }
        }
        if (secIdx !== -1 && Number.isFinite(secVal) && (maxVal - secVal) < (hi - lo) * 0.4) {
          peaks.push({ idx: secIdx, val: secVal, pt: [x(secIdx), y(secVal)] });
        }
      }
    }
  }

  // Hover & selection resolution
  const current = hover ?? selected;
  const hasCurrent = Number.isInteger(current) && current >= 0 && current < rawValues.length;
  const activeVal = hasCurrent && Number.isFinite(validInterpValues[current]) ? validInterpValues[current] : null;
  const curX = hasCurrent ? x(current) : 0;
  const curY = activeVal !== null ? y(activeVal) : 0;

  const isTimeSeries = dates && Array.isArray(dates) && dates.length === rawValues.length;
  const hoverDate = isTimeSeries && hasCurrent && dates[current] ? dates[current] : (date || null);
  const hoverDist = xlabels && xlabels[1] && xlabels[1].includes('m') && hasCurrent ?
    Math.round((current / Math.max(1, rawValues.length - 1)) * parseFloat(xlabels[1].replace(/,/g, ''))).toLocaleString() : null;

  const hoverText = activeVal !== null ?
    `${hoverDate ? hoverDate + ' · ' : ''}${activeVal >= 0 ? '+' : ''}${activeVal.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${valueUnit}${hoverDist ? ' · ' + hoverDist + ' m' : ''}` : '';
  const hoverBoxW = Math.max(72, hoverText.length * 6.6 + 18);
  const hoverBoxH = 20;
  const hoverBoxX = Math.max(x0, Math.min(x1 - hoverBoxW, curX - hoverBoxW / 2));
  const hoverBoxY = Math.max(2, curY - 25);

  return (
    <div
      ref={containerRef}
      className={`chart elevation-profile-chart ${isPopup ? 'is-popup' : ''}`}
      style={{
        width: '100%',
        flex: fillHeight || isPopup ? '1 1 0%' : undefined,
        minHeight: fillHeight ? 0 : (typeof height === 'number' ? height : 86),
        height: fillHeight || isPopup ? '100%' : (typeof height === 'number' ? height : 86),
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'crosshair',
          overflow: 'visible'
        }}
        role="img"
        aria-label={unit}
        onMouseMove={e => {
          if (!rawValues.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const frac = Math.max(0, Math.min(1, (mouseX - x0) / plotW));
          const idx = Math.round(frac * (rawValues.length - 1));
          setHover(Math.max(0, Math.min(rawValues.length - 1, idx)));
        }}
      >
        <defs>
          {/* Hexagon Cape-10 colormap gradient mapping directly to map colours */}
          <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />     {/* Blue (Stable / baseline) */}
            <stop offset="22%" stopColor="#fde047" />    {/* Pale Yellow (250-500mm) */}
            <stop offset="42%" stopColor="#facc15" />    {/* Golden Yellow (500-750mm) */}
            <stop offset="60%" stopColor="#f59e0b" />    {/* Amber Gold (750-1250mm) */}
            <stop offset="78%" stopColor="#fa4c00" />    {/* Orange-Red (1250-1750mm) */}
            <stop offset="90%" stopColor="#e61a00" />    {/* Bright Red (1750-2000mm) */}
            <stop offset="100%" stopColor="#8c0033" />   {/* Deep Crimson (2500mm+) */}
          </linearGradient>

          {/* Soft Area fill gradient under the elevation curve */}
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fa4c00" stopOpacity="0.20" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero reference line */}
        {lo < 0 && hi > 0 && (
          <line x1={x0} y1={zeroY} x2={x1} y2={zeroY} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
        )}

        {/* Left Y-Axis line and tick marks (Reference Image Style) */}
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#cbd5e1" strokeWidth="1" />
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line x1={x0 - 4} y1={t.y} x2={x0} y2={t.y} stroke="#94a3b8" strokeWidth="1" />
            <text
              x={x0 - 6}
              y={t.y + 3.5}
              textAnchor="end"
              fill="#64748b"
              fontSize={isPopup ? '11' : '9.5'}
              fontFamily="'JetBrains Mono', monospace"
            >
              {t.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}

        {/* Bottom X-Axis line and tick marks */}
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={x0} y1={y1} x2={x0} y2={y1 + 4} stroke="#94a3b8" strokeWidth="1" />
        <text x={x0} y={y1 + 14} textAnchor="start" fill="#64748b" fontSize={isPopup ? '11' : '9.5'} fontFamily="'JetBrains Mono', monospace">
          {x0Label}
        </text>

        {midLabel && (
          <>
            <line x1={x0 + plotW / 2} y1={y1} x2={x0 + plotW / 2} y2={y1 + 4} stroke="#94a3b8" strokeWidth="1" />
            <text x={x0 + plotW / 2} y={y1 + 14} textAnchor="middle" fill="#64748b" fontSize={isPopup ? '11' : '9.5'} fontFamily="'JetBrains Mono', monospace">
              {midLabel}
            </text>
          </>
        )}

        <line x1={x1} y1={y1} x2={x1} y2={y1 + 4} stroke="#94a3b8" strokeWidth="1" />
        <text x={x1} y={y1 + 14} textAnchor="end" fill="#64748b" fontSize={isPopup ? '11' : '9.5'} fontFamily="'JetBrains Mono', monospace">
          {x1Label}
        </text>

        {/* Soft Area fill under curve */}
        {areaD && <path d={areaD} fill={`url(#${areaGradId})`} />}

        {/* Thick, continuous, smooth mountain curve with map-matched color gradient */}
        {lineD && (
          <path
            d={lineD}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={isPopup ? '3.6' : '3.0'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Peak Callout Badges with downward Carets (Reference Image Style) */}
        {hover === null && peaks.map((p, idx) => {
          const peakText = `${p.val >= 0 ? '+' : ''}${p.val.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${valueUnit}`;
          const peakBoxW = Math.max(56, peakText.length * 6.6 + 12);
          const peakBoxH = 18;
          const peakBoxX = Math.max(x0, Math.min(x1 - peakBoxW, p.pt[0] - peakBoxW / 2));
          const peakBoxY = Math.max(2, p.pt[1] - 22);

          return (
            <g key={idx} className="elevation-peak-callout">
              <rect x={peakBoxX} y={peakBoxY} width={peakBoxW} height={peakBoxH} rx="4" fill="#0f172a" />
              <polygon
                points={`${p.pt[0] - 3.5},${peakBoxY + peakBoxH} ${p.pt[0] + 3.5},${peakBoxY + peakBoxH} ${p.pt[0]},${peakBoxY + peakBoxH + 4}`}
                fill="#0f172a"
              />
              <text
                x={peakBoxX + peakBoxW / 2}
                y={peakBoxY + 12}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={isPopup ? '10' : '8.5'}
                fontWeight="600"
                fontFamily="'JetBrains Mono', monospace"
              >
                {peakText}
              </text>
              <circle cx={p.pt[0]} cy={p.pt[1]} r={isPopup ? 4 : 3} fill="#fa4c00" stroke="#ffffff" strokeWidth="1.8" />
            </g>
          );
        })}

        {/* Interactive Hover Crosshair & Callout with Caret */}
        {hover !== null && activeVal !== null && (
          <g>
            <line x1={curX} y1={y0} x2={curX} y2={y1} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
            <rect
              x={hoverBoxX}
              y={hoverBoxY}
              width={hoverBoxW}
              height={hoverBoxH}
              rx="4"
              fill="#0f172a"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="0.8"
            />
            <polygon
              points={`${curX - 4},${hoverBoxY + hoverBoxH} ${curX + 4},${hoverBoxY + hoverBoxH} ${curX},${hoverBoxY + hoverBoxH + 4.5}`}
              fill="#0f172a"
            />
            <text
              x={hoverBoxX + hoverBoxW / 2}
              y={hoverBoxY + 13.5}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={isPopup ? '10.5' : '9'}
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
            >
              {hoverText}
            </text>
            <circle cx={curX} cy={curY} r={isPopup ? 4.5 : 3.5} fill="#fa4c00" stroke="#ffffff" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}
