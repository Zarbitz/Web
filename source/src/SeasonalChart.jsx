import React from 'react';

function getSplinePath(pts) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    let p0 = pts[Math.max(0, i - 1)];
    let p1 = pts[i];
    let p2 = pts[i + 1];
    let p3 = pts[Math.min(pts.length - 1, i + 2)];
    let cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    let cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    let cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    let cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function SeasonalChart({data = [], amplitude = 0, height = 86, fillHeight = false, isPopup = false}) {
  const containerRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 420, h: typeof height === 'number' ? height : 86 });
  const [hover, setHover] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 24) {
        setDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const W = dims.w;
  const H = dims.h;
  const x0 = isPopup ? 64 : 42;
  const x1 = W - (isPopup ? 24 : 14);
  const plotW = Math.max(20, x1 - x0);
  const y0 = isPopup ? 36 : 22;
  const y1 = H - (isPopup ? 28 : 18);
  const plotH = Math.max(16, y1 - y0);
  const yZero = (y0 + y1) / 2;

  const valid = data && data.length > 0 && Number.isFinite(amplitude) && amplitude > 0;
  const A = valid ? amplitude / 2 : 1;

  let pts = [];
  let maxIdx = 0, minIdx = 0;
  let maxVal = -Infinity, minVal = Infinity;

  if (valid) {
    data.forEach((v, i) => {
      let f = i / Math.max(1, data.length - 1);
      let px = x0 + f * plotW;
      let py = yZero - (v / A) * (plotH / 2);
      py = Math.max(y0, Math.min(y1, py));
      pts.push([px, py]);
      if (v > maxVal) { maxVal = v; maxIdx = i; }
      if (v < minVal) { minVal = v; minIdx = i; }
    });
  }

  const lineD = getSplinePath(pts);
  const areaD = lineD ? `${lineD} L ${x1} ${y1} L ${x0} ${y1} Z` : '';

  // Peak callout badge
  const peakPt = pts[maxIdx] || [x0 + plotW * 0.4, y0];
  const peakBoxW = 62, peakBoxH = 17;
  const peakBoxX = Math.max(x0, Math.min(x1 - peakBoxW, peakPt[0] - peakBoxW / 2));
  const peakBoxY = Math.max(2, peakPt[1] - 20);

  // Trough callout badge
  const troughPt = pts[minIdx] || [x0 + plotW * 0.9, y1];
  const troughBoxW = 62, troughBoxH = 17;
  const troughBoxX = Math.max(x0, Math.min(x1 - troughBoxW, troughPt[0] - troughBoxW / 2));
  const troughBoxY = Math.min(y1 - troughBoxH - 1, troughPt[1] + 4);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const hoverActive = hover !== null && valid && pts[hover];
  const hoverPt = hoverActive ? pts[hover] : null;
  const hoverFrac = hoverActive ? hover / Math.max(1, data.length - 1) : 0;
  const hoverMonth = hoverActive ? MONTHS[Math.min(11, Math.floor(hoverFrac * 12))] : '';
  const hoverVal = hoverActive ? data[hover] : 0;

  const monthTicks = [
    { label: 'Jan', frac: 0 },
    { label: 'Apr', frac: 0.25 },
    { label: 'Jul', frac: 0.5 },
    { label: 'Oct', frac: 0.75 },
    { label: 'Dec', frac: 1 }
  ];

  return (
    <div
      ref={containerRef}
      className="chart seasonal-chart-container activity-chart"
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
        style={{width: '100%', height: '100%', display: 'block', cursor: 'crosshair', overflow: 'visible'}}
        onMouseMove={e => {
          if (!valid || !data.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const f = Math.max(0, Math.min(1, (mouseX - x0) / plotW));
          const idx = Math.round(f * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id="seasonalAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fa4338" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fa4338" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal reference lines */}
        <line x1={x0} y1={yZero} x2={x1} y2={yZero} stroke="#e4e4e7" strokeDasharray="3 3" />
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#f4f4f5" strokeWidth="1" />
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="#cbd5e1" strokeWidth="1" />

        {/* Y-axis line & tick marks */}
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={x0 - 4} y1={y0} x2={x0} y2={y0} stroke="#cbd5e1" />
        <text x={x0 - 6} y={y0 + 3.5} textAnchor="end" fill="#64748b" fontSize={isPopup ? '10.5' : '9'} fontFamily="'JetBrains Mono', monospace">
          +{valid ? A.toFixed(0) : '—'}
        </text>
        <line x1={x0 - 4} y1={yZero} x2={x0} y2={yZero} stroke="#cbd5e1" />
        <text x={x0 - 6} y={yZero + 3.5} textAnchor="end" fill="#64748b" fontSize={isPopup ? '10.5' : '9'} fontFamily="'JetBrains Mono', monospace">
          0
        </text>
        <line x1={x0 - 4} y1={y1} x2={x0} y2={y1} stroke="#cbd5e1" />
        <text x={x0 - 6} y={y1 + 3.5} textAnchor="end" fill="#64748b" fontSize={isPopup ? '10.5' : '9'} fontFamily="'JetBrains Mono', monospace">
          -{valid ? A.toFixed(0) : '—'}
        </text>

        {/* X-axis month ticks inside SVG */}
        {monthTicks.map((m, i) => {
          const mx = x0 + m.frac * plotW;
          const anchor = i === 0 ? 'start' : i === monthTicks.length - 1 ? 'end' : 'middle';
          return (
            <g key={m.label}>
              <line x1={mx} y1={y1} x2={mx} y2={y1 + 4} stroke="#94a3b8" strokeWidth="1" />
              <text x={mx} y={y1 + 14} textAnchor={anchor} fill="#64748b" fontSize={isPopup ? '10.5' : '9.5'} fontFamily="'JetBrains Mono', monospace">
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Shaded Area underneath the curve */}
        {valid && areaD && <path d={areaD} fill="url(#seasonalAreaGrad)" />}

        {/* Smooth Seasonal Curve (coral/red line) */}
        {valid && lineD && (
          <path
            d={lineD}
            fill="none"
            stroke="#fa4338"
            strokeWidth={isPopup ? '3.0' : '2.4'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Peak Callout Badge */}
        {valid && hover === null && (
          <g className="peak-callout">
            <rect x={peakBoxX} y={peakBoxY} width={peakBoxW} height={peakBoxH} rx="4" ry="4" fill="#0f172a" />
            <polygon
              points={`${peakPt[0] - 3},${peakBoxY + peakBoxH} ${peakPt[0] + 3},${peakBoxY + peakBoxH} ${peakPt[0]},${peakBoxY + peakBoxH + 3.5}`}
              fill="#0f172a"
            />
            <text
              x={peakBoxX + peakBoxW / 2}
              y={peakBoxY + 11.5}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8.5"
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
            >
              +{A.toFixed(1)} mm
            </text>
            <circle cx={peakPt[0]} cy={peakPt[1]} r="2.8" fill="#fa4338" stroke="#ffffff" strokeWidth="1.6" />
          </g>
        )}

        {/* Trough Callout Badge */}
        {valid && hover === null && plotH >= 48 && (
          <g className="trough-callout">
            <rect x={troughBoxX} y={troughBoxY} width={troughBoxW} height={troughBoxH} rx="4" ry="4" fill="#0f172a" />
            <polygon
              points={`${troughPt[0] - 3},${troughBoxY} ${troughPt[0] + 3},${troughBoxY} ${troughPt[0]},${troughBoxY - 3.5}`}
              fill="#0f172a"
            />
            <text
              x={troughBoxX + troughBoxW / 2}
              y={troughBoxY + 11.5}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8.5"
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
            >
              -{A.toFixed(1)} mm
            </text>
            <circle cx={troughPt[0]} cy={troughPt[1]} r="2.8" fill="#fa4338" stroke="#ffffff" strokeWidth="1.6" />
          </g>
        )}

        {/* Hover Guideline and Marker */}
        {hoverActive && hoverPt && (
          <g>
            <line x1={hoverPt[0]} y1={y0} x2={hoverPt[0]} y2={y1} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hoverPt[0]} cy={hoverPt[1]} r="3.5" fill="#fa4338" stroke="#ffffff" strokeWidth="1.8" />
          </g>
        )}
      </svg>
      {hoverActive && (
        <div
          className="activity-tooltip"
          style={{
            left: `${Math.max(8, Math.min(92, (hoverPt[0] / W) * 100))}%`
          }}
        >
          <div className="tooltip-row-meta">
            <span className="tooltip-label">SEASON</span>
            <span className="tooltip-date">{hoverMonth.toUpperCase()}</span>
          </div>
          <div className="tooltip-row-val">
            <span className="tooltip-value">
              {hoverVal >= 0 ? '+' : ''}{hoverVal.toFixed(2)} mm
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

