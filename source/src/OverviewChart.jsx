import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { animate, stagger } from 'animejs';
import { ECCHARTS_CAPE_10, activityColor } from './ActivityChart.jsx';

const fixed = n => Math.round(n * 100) / 100;

function barPath(x, width, height, base) {
  if (!(height > 0.01) || !(width > 0)) return '';
  const r = Math.min(2.5, width / 2, height);
  const top = base - height;
  return `M${fixed(x)} ${base}V${fixed(top + r)}A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x + r)} ${fixed(top)}H${fixed(x + width - r)}A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x + width)} ${fixed(top + r)}V${base}Z`;
}

function gripPath(x, side, isPopup = false) {
  const k = side === 'left' ? 1 : -1;
  const c = fixed(x + k * 0.45);
  const inner = fixed(x + k);
  const yTop = isPopup ? 6 : 4;
  const yBot = isPopup ? 16 : 11;
  return `M${fixed(x)} ${yTop + 1}C${fixed(x)} ${yTop + 0.45} ${c} ${yTop} ${inner} ${yTop}V${yBot}C${c} ${yBot} ${fixed(x)} ${yBot - 0.45} ${fixed(x)} ${yBot - 1}V${yTop + 1}Z`;
}

function markerPath(x, isPopup = false) {
  const l = fixed(x - 0.5), r = fixed(x + 0.5);
  const wl = fixed(x - 2.2), wr = fixed(x + 2.2);
  const h = isPopup ? 21 : 14;
  return `M${l} 3H${r}V${h - 3}H${l}Z M${r} 3.5L${wr} 0H${wl}L${l} 3.5Z M${l} ${h - 3.5}L${wl} ${h}H${wr}L${r} ${h - 3.5}Z`;
}

export default function OverviewChart({
  profile = null,
  dates = [],
  date = null,
  series = [],
  velocity = null,
  acceleration = null,
  selected = null,
  onSelect = null,
  isPopup = false,
  onClose = null
}) {
  // Always default to spatial transect mode for Card B (Spatial Strain Profiles)
  const [viewMode, setViewMode] = useState('spatial');
  const [metric, setMetric] = useState('disp'); // 'disp' | 'strain' or 'acc'
  const [sector, setSector] = useState('all'); // for spatial: 'all' | 'left' | 'mid' | 'right'
  const [period, setPeriod] = useState('all'); // for temporal: 'all' | 'recent' | 'mid' | 'early'
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [range, setRange] = useState(null); // [startIdx, endIdx]

  const containerRef = useRef(null);
  const plotRef = useRef(null);
  const summaryRef = useRef(null);
  const tipRef = useRef(null);
  const totalRef = useRef(null);
  const rawId = useId ? useId().replace(/[^a-zA-Z0-9]/g, '') : Math.random().toString(36).substr(2, 6);
  const ids = `ovChart_${rawId}`;

  const [plotDims, setPlotDims] = useState({ w: isPopup ? 888 : 800, h: isPopup ? 260 : 76 });
  const plotWidth = plotDims.w;
  const plotHeight = plotDims.h;

  // Responsive dimensions
  const base = plotHeight - 1;
  const maxBar = Math.max(24, Math.round(plotHeight * 0.78));
  const BAR_GAP = 1.2;
  const BRUSH_GAP = 2;
  const SUMMARY_INSET = 4;
  const LABEL_EDGE = isPopup ? 16 : 12;

  // ResizeObserver for fluid width & height
  useLayoutEffect(() => {
    if (!plotRef.current) return;
    const update = () => {
      const rect = plotRef.current.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 28) {
        setPlotDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(plotRef.current);
    return () => ro.disconnect();
  }, []);

  // Spatial data: points along the transect
  const spatialItems = useMemo(() => {
    if (!profile?.values || !profile.values.length) return [];
    const len = profile.values.length;
    return profile.values.map((p, i) => {
      const d = p.x || 0;
      const val = Number.isFinite(p.y) ? p.y : 0;
      return {
        id: `sp_${i}`,
        label: `${Math.round(d)} m`,
        shortLabel: d >= 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}m`,
        value: val,
        raw: p.y,
        distance: d,
        idx: i
      };
    });
  }, [profile]);

  // Temporal data: 281 acquisitions across 2015-2026
  const temporalItems = useMemo(() => {
    if (!dates || !dates.length) return [];
    return dates.map((d, i) => {
      let val = 0;
      if (metric === 'disp') {
        val = Number.isFinite(series?.[i]) ? series[i] : 0;
      } else {
        val = Number.isFinite(acceleration?.[i]) ? acceleration[i] : 0;
      }
      return {
        id: `tp_${i}`,
        date: d,
        label: d,
        value: val,
        raw: series?.[i],
        idx: i
      };
    });
  }, [dates, series, acceleration, metric]);

  // Current active items based on viewMode & filtering
  const items = useMemo(() => {
    if (viewMode === 'spatial') {
      if (!spatialItems.length) return [];
      const totalLen = profile?.length || 6000;
      const third = totalLen / 3;
      if (sector === 'left') return spatialItems.filter(p => p.distance < third);
      if (sector === 'mid') return spatialItems.filter(p => p.distance >= third && p.distance < third * 2);
      if (sector === 'right') return spatialItems.filter(p => p.distance >= third * 2);
      return spatialItems;
    } else {
      if (!temporalItems.length) return [];
      if (period === 'recent') return temporalItems.filter(d => d.date >= '2023-01-01');
      if (period === 'mid') return temporalItems.filter(d => d.date >= '2019-01-01' && d.date < '2023-01-01');
      if (period === 'early') return temporalItems.filter(d => d.date < '2019-01-01');
      return temporalItems;
    }
  }, [viewMode, spatialItems, temporalItems, sector, period, profile]);

  // Reset selection window when data or mode changes
  useEffect(() => {
    if (!items.length) return;
    const count = items.length;
    const end = count - 1;
    const span = Math.max(6, Math.min(38, Math.round(count * 0.28)));
    const start = Math.max(0, end - span);
    setRange([start, end]);
  }, [viewMode, sector, period, items.length]);

  // Calculate layout coordinates
  const layout = useMemo(() => {
    const n = items.length;
    if (!n) return { n: 0, pitch: 0, barWidth: 0, heights: [], xs: [], maxVal: 1, minVal: 0, dividers: [] };
    const pitch = (plotWidth + BAR_GAP) / n;
    const barWidth = Math.max(1.8, pitch - BAR_GAP);
    const absVals = items.map(d => Math.abs(d.value));
    const maxVal = Math.max(1, ...absVals);
    const minVal = Math.min(0, ...items.map(d => d.value));
    const heights = items.map(d => (Math.abs(d.value) / maxVal) * maxBar);
    const xs = items.map((_, i) => i * pitch);

    const dividers = [];
    if (viewMode === 'spatial') {
      const step = Math.max(1, Math.floor(n / 6));
      for (let i = step; i < n; i += step) dividers.push(i);
    } else {
      for (let i = 1; i < n; i++) {
        if (items[i].date?.slice(0, 7) !== items[i - 1].date?.slice(0, 7)) {
          dividers.push(i);
        }
      }
    }
    return { n, pitch, barWidth, heights, xs, maxVal, minVal, dividers };
  }, [items, plotWidth, maxBar, BAR_GAP, viewMode]);

  const { n, pitch, barWidth, heights, xs, maxVal, dividers } = layout;

  // Active selection range
  const selection = useMemo(() => {
    if (!range || !n) return null;
    let [a, b] = range[0] <= range[1] ? range : [range[1], range[0]];
    a = Math.max(0, Math.min(n - 1, a));
    b = Math.max(0, Math.min(n - 1, b));
    return { a, b };
  }, [range, n]);

  // Hero metric calculation
  const heroData = useMemo(() => {
    if (viewMode === 'spatial') {
      const strainVal = profile?.strain || 0;
      const peakDisp = items.length ? Math.max(...items.map(d => Math.abs(d.value))) : 0;
      return {
        title: 'Spatial LOS Gradient & Transect Strain',
        valueText: `${strainVal.toFixed(0)} μϵ`,
        subText: `Peak ${peakDisp.toFixed(1)} mm · Length ${Math.round(profile?.length || 0)} m`,
        isWarning: strainVal >= 10
      };
    } else {
      const valid = items.map(d => d.value).filter(Number.isFinite);
      const total = valid.length ? valid[valid.length - 1] : 0;
      return {
        title: metric === 'disp' ? 'Cumulative LOS Displacement' : 'Rolling Acceleration',
        valueText: `${total >= 0 ? '+' : ''}${total.toFixed(1)} mm`,
        subText: `${(velocity || 0) >= 0 ? '▲ +' : '▼ '}${Math.abs(velocity || 0).toFixed(1)} mm/yr rate`,
        isWarning: (velocity || 0) >= 50
      };
    }
  }, [viewMode, profile, items, metric, velocity]);

  // Selection statistics for summary card
  const selectionStats = useMemo(() => {
    if (!selection || !items.length) return null;
    const slice = items.slice(selection.a, selection.b + 1);
    const vals = slice.map(d => d.value);
    const first = vals[0] || 0;
    const last = vals[vals.length - 1] || 0;
    const delta = last - first;
    const len = slice.length;
    const prevSlice = selection.a >= len ? items.slice(selection.a - len, selection.a) : null;
    const prevDelta = prevSlice ? (prevSlice[prevSlice.length - 1].value - prevSlice[0].value) : 0;
    const pct = prevDelta !== 0 ? Math.round((delta / Math.abs(prevDelta)) * 100) : null;

    if (viewMode === 'spatial') {
      return {
        heading: 'Transect Segment',
        rangeText: `${slice[0]?.label} – ${slice[slice.length - 1]?.label}`,
        delta,
        pct,
        count: len
      };
    } else {
      const startD = new Date(slice[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const endD = new Date(slice[slice.length - 1]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return {
        heading: metric === 'disp' ? 'LOS Displacement' : 'Acceleration',
        rangeText: `${startD} – ${endD}`,
        delta,
        pct,
        count: len
      };
    }
  }, [selection, items, viewMode, metric]);

  // Brush segments and dividers
  const brush = useMemo(() => {
    if (!n) return null;
    const trackLeft = 0;
    const trackRight = xs[n - 1] + barWidth;
    if (!selection) {
      return { tracks: [[trackLeft, trackRight]], segments: [], dividers: [], markers: [], left: 0, right: 0 };
    }
    const left = xs[selection.a];
    const right = xs[selection.b] + barWidth;
    const markers = dividers.filter(i => i > selection.a && i <= selection.b).map(i => xs[i] - BAR_GAP / 2);
    const edges = [left, ...markers.flatMap(x => [x - BRUSH_GAP, x + BRUSH_GAP]), right];
    const segments = [];
    for (let i = 0; i < edges.length; i += 2) {
      if (edges[i + 1] - edges[i] > 0.5) segments.push([edges[i], edges[i + 1]]);
    }
    const tracks = [
      [trackLeft, left - 3 - BRUSH_GAP],
      [right + 3 + BRUSH_GAP, trackRight]
    ].filter(([from, to]) => to - from > 0.5);

    return { tracks, segments, dividers: [left - 3, right + 2], markers, left, right };
  }, [selection, n, xs, barWidth, dividers, BAR_GAP]);

  // Pointer interactions
  const dragRef = useRef(null);
  const getIndexAt = useCallback(e => {
    if (!plotRef.current || !n) return 0;
    const rect = plotRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(n - 1, Math.floor(x / pitch)));
  }, [n, pitch]);

  const onPointerDown = e => {
    const idx = getIndexAt(e);
    dragRef.current = { start: idx, current: idx, kind: 'new' };
    setDragging('new');
    setRange([idx, idx]);
    if (viewMode === 'temporal' && onSelect && items[idx]) onSelect(items[idx].idx);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = e => {
    const idx = getIndexAt(e);
    setHovered(idx);
    if (!dragRef.current) return;
    const state = dragRef.current;
    if (state.kind === 'new') {
      setRange([state.start, idx]);
    } else if (state.kind === 'body' && selection) {
      const span = selection.b - selection.a;
      const newA = Math.max(0, Math.min(n - 1 - span, idx - state.offset));
      setRange([newA, newA + span]);
    } else if (state.kind === 'start' && selection) {
      setRange([Math.min(idx, selection.b), selection.b]);
    } else if (state.kind === 'end' && selection) {
      setRange([selection.a, Math.max(idx, selection.a)]);
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(null);
  };

  // Anime entrance animation
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      animate(containerRef.current.querySelectorAll('.overview-bar'), {
        scaleY: [0, 1],
        duration: 600,
        delay: stagger(2),
        ease: 'outExpo'
      });
    } catch (e) {}
  }, [viewMode, sector, period, metric]);

  // Axis labels without overlapping
  const axisLabels = useMemo(() => {
    if (!items.length || !xs.length) return [];
    const minSpacing = isPopup ? 54 : 44;
    const labels = [];
    let lastX = -minSpacing;

    if (viewMode === 'spatial') {
      // Show distance marks: e.g. 0 m, 1 km, 2 km, 3 km, 4 km, 5 km, 6 km
      for (let i = 0; i < n; i++) {
        const p = items[i];
        const x = xs[i];
        const isRound = p.distance === 0 || Math.round(p.distance) % 1000 === 0 || i === n - 1;
        if (isRound && x - lastX >= minSpacing && x >= LABEL_EDGE && x <= plotWidth - LABEL_EDGE) {
          labels.push({ idx: i, label: p.label, isMajor: p.distance === 0 || i === n - 1 });
          lastX = x;
        }
      }
    } else {
      // Show year marks
      const spanYears = items.length > 0 ? (new Date(items[items.length - 1].date).getFullYear() - new Date(items[0].date).getFullYear()) : 0;
      for (let i = 0; i < n; i++) {
        const d = items[i];
        const isYearStart = (i === 0 || d.date?.slice(0, 4) !== items[i - 1]?.date?.slice(0, 4));
        const isMonthStart = (i === 0 || d.date?.slice(0, 7) !== items[i - 1]?.date?.slice(0, 7));
        const x = xs[i];

        if (spanYears >= 3) {
          if (isYearStart && x - lastX >= minSpacing && x >= LABEL_EDGE && x <= plotWidth - LABEL_EDGE) {
            labels.push({ idx: i, label: d.date.slice(0, 4), isMajor: true });
            lastX = x;
          }
        } else {
          if (isMonthStart && x - lastX >= minSpacing && x >= LABEL_EDGE && x <= plotWidth - LABEL_EDGE) {
            const isJan = d.date.slice(5, 7) === '01';
            const mStr = new Date(d.date).toLocaleString('default', { month: 'short' });
            labels.push({ idx: i, label: isJan ? d.date.slice(0, 4) : mStr, isMajor: isJan });
            lastX = x;
          }
        }
      }
    }
    return labels;
  }, [items, xs, n, plotWidth, isPopup, viewMode, LABEL_EDGE]);

  // Summary box positioning
  const summaryLeft = brush && selection ? Math.max(6, Math.min(plotWidth - (isPopup ? 220 : 170), brush.left + SUMMARY_INSET)) : 0;

  return (
    <div
      ref={containerRef}
      className={`overview-chart-card ${isPopup ? 'is-popup-view' : ''}`}
      style={{
        background: isPopup ? '#ffffff' : '#ffffff',
        borderRadius: isPopup ? '16px' : '8px',
        border: isPopup ? '1px solid #e2e8f0' : '1px solid #e4e4e7',
        padding: isPopup ? '20px 24px' : '4px 10px',
        boxShadow: isPopup ? '0 10px 30px rgba(0, 0, 0, 0.12)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flex: isPopup ? undefined : '1 1 0%',
        minHeight: 0,
        gap: isPopup ? '12px' : '4px',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Top Header Row with Hero Metric and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: isPopup ? '13px' : '10.5px', fontWeight: '500', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
              {heroData.title}
            </span>
            <span style={{ fontSize: '10.5px', color: '#94a3b8', cursor: 'help' }} title="High-resolution crest transect observation">ⓘ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h2 ref={totalRef} style={{ fontSize: isPopup ? '26px' : '16px', fontWeight: '700', color: '#0f172a', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              {heroData.valueText}
            </h2>
            <span style={{ fontSize: isPopup ? '12px' : '10px', fontWeight: '600', color: heroData.isWarning ? '#fa4c00' : '#16a34a', fontFamily: "'JetBrains Mono', monospace" }}>
              {heroData.subText}
            </span>
          </div>
        </div>

        {/* Controls: Mode Toggle & Period / Sector Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Spatial Transect vs Temporal Timeline Toggle */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('spatial')}
              style={{
                background: viewMode === 'spatial' ? '#ffffff' : 'transparent',
                border: 0,
                borderRadius: '5px',
                padding: isPopup ? '5px 10px' : '3px 7px',
                fontSize: isPopup ? '11.5px' : '10px',
                fontWeight: viewMode === 'spatial' ? '600' : '500',
                color: viewMode === 'spatial' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: viewMode === 'spatial' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
              title="Spatial transect along dam crest"
            >
              📏 Transect
            </button>
            <button
              onClick={() => setViewMode('temporal')}
              style={{
                background: viewMode === 'temporal' ? '#ffffff' : 'transparent',
                border: 0,
                borderRadius: '5px',
                padding: isPopup ? '5px 10px' : '3px 7px',
                fontSize: isPopup ? '11.5px' : '10px',
                fontWeight: viewMode === 'temporal' ? '600' : '500',
                color: viewMode === 'temporal' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: viewMode === 'temporal' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
              title="11.6-year temporal history"
            >
              ⏱ Timeline
            </button>
          </div>

          {/* Sub-Filters: Sector (Spatial) or Period (Temporal) */}
          {viewMode === 'spatial' ? (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px' }}>
              {[
                { id: 'all', label: isPopup ? 'All (6km)' : 'All' },
                { id: 'left', label: '0–2km' },
                { id: 'mid', label: '2–4km' },
                { id: 'right', label: '4–6km' }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSector(s.id)}
                  style={{
                    background: sector === s.id ? '#ffffff' : 'transparent',
                    border: 0,
                    borderRadius: '5px',
                    padding: isPopup ? '5px 9px' : '3px 6px',
                    fontSize: isPopup ? '11.5px' : '10px',
                    fontWeight: sector === s.id ? '600' : '500',
                    color: sector === s.id ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: sector === s.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px' }}>
              {[
                { id: 'all', label: isPopup ? 'All 11.6y' : 'All' },
                { id: 'recent', label: '23–26' },
                { id: 'mid', label: '19–22' },
                { id: 'early', label: '15–18' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  style={{
                    background: period === p.id ? '#ffffff' : 'transparent',
                    border: 0,
                    borderRadius: '5px',
                    padding: isPopup ? '5px 9px' : '3px 6px',
                    fontSize: isPopup ? '11.5px' : '10px',
                    fontWeight: period === p.id ? '600' : '500',
                    color: period === p.id ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: period === p.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 0,
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Plot Container */}
      <div
        ref={plotRef}
        style={{
          position: 'relative',
          flex: isPopup ? undefined : '1 1 0%',
          minHeight: isPopup ? '220px' : '48px',
          height: isPopup ? `${plotHeight}px` : '100%',
          width: '100%',
          userSelect: 'none'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none'
          }}
        >
          <defs>
            {/* Cape-10 Radar Gradient 1: Amber-Orange tone */}
            <linearGradient id={`${ids}-cape-light`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fa4c00" />
              <stop offset="35%" stopColor="#f59e0b" />
              <stop offset="70%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
            </linearGradient>

            {/* Cape-10 Radar Gradient 2: Deep Crimson tone */}
            <linearGradient id={`${ids}-cape-dark`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8c0033" />
              <stop offset="35%" stopColor="#e61a00" />
              <stop offset="70%" stopColor="#fa4c00" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.25" />
            </linearGradient>

            {/* Orange Brush Glow Filter */}
            <filter id={`${ids}-brush-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#fa4c00" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Baseline axis line */}
          <line x1={0} y1={base + 0.5} x2={plotWidth} y2={base + 0.5} stroke="#e2e8f0" strokeWidth="1" />

          {/* Observation Bars */}
          {items.map((d, i) => {
            const isSelected = selection && i >= selection.a && i <= selection.b;
            const isHot = hovered === i;
            const isAlt = viewMode === 'spatial' ? Math.floor(i / 15) % 2 === 1 : (new Date(d.date).getMonth()) % 2 === 1;
            const dPath = barPath(xs[i], barWidth, heights[i], base);

            return (
              <g key={d.id || i} className="overview-bar" style={{ transformOrigin: 'bottom' }}>
                {!isSelected && (
                  <path
                    d={dPath}
                    fill={isHot ? '#94a3b8' : '#e2e8f0'}
                    style={{ transition: 'fill 0.15s ease' }}
                  />
                )}
                {isSelected && (
                  <path
                    d={dPath}
                    fill={isAlt ? `url(#${ids}-cape-dark)` : `url(#${ids}-cape-light)`}
                    style={{
                      filter: isHot ? 'brightness(1.2)' : 'none',
                      transition: 'filter 0.15s ease'
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Selection Summary Card */}
        {selectionStats && (
          <div
            ref={summaryRef}
            style={{
              position: 'absolute',
              left: `${summaryLeft}px`,
              bottom: isPopup ? '14px' : '6px',
              zIndex: 20,
              background: '#ffffff',
              borderRadius: '7px',
              padding: isPopup ? '8px 12px' : '4px 8px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12), 0 0 0 1px #f1f5f9',
              minWidth: isPopup ? '180px' : '136px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: isPopup ? '10.5px' : '8.5px', fontWeight: '600', color: '#0f172a', fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectionStats.heading}
                </div>
                <div style={{ fontSize: isPopup ? '9.5px' : '8px', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectionStats.rangeText}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setRange(null); }}
                style={{
                  background: 'transparent',
                  border: 0,
                  fontSize: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '1px'
                }}
                title="Clear selection"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: isPopup ? '15px' : '11.5px', fontWeight: '700', color: '#0f172a', fontFamily: "'JetBrains Mono', monospace" }}>
                {selectionStats.delta >= 0 ? '+' : ''}{selectionStats.delta.toFixed(1)} mm
              </span>
              {selectionStats.pct !== null && (
                <span style={{ fontSize: isPopup ? '10px' : '8.5px', fontWeight: '600', color: selectionStats.delta >= 0 ? '#fa4c00' : '#16a34a' }}>
                  {selectionStats.delta >= 0 ? '▲' : '▼'} {Math.abs(selectionStats.pct)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Floating Tooltip on hover */}
        {hovered !== null && items[hovered] && (
          <div
            ref={tipRef}
            style={{
              position: 'absolute',
              left: `${Math.max(8, Math.min(plotWidth - 110, xs[hovered] - 40))}px`,
              top: `${Math.max(2, base - heights[hovered] - 26)}px`,
              zIndex: 30,
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: '5px',
              padding: '3px 7px',
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              display: 'flex',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <strong>{items[hovered].label}</strong>
            <span>{items[hovered].value >= 0 ? '+' : ''}{items[hovered].value.toFixed(1)} mm</span>
          </div>
        )}
      </div>

      {/* Interactive Brush Scrubber */}
      <div
        style={{
          position: 'relative',
          height: isPopup ? '22px' : '15px',
          flexShrink: 0,
          width: '100%',
          cursor: 'pointer'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          {/* Grey background tracks */}
          {brush?.tracks.map(([from, to], i) => (
            <rect key={i} x={from} y={isPopup ? 3 : 1} width={Math.max(0, to - from)} height={isPopup ? 16 : 13} rx={2} fill="#e2e8f0" />
          ))}

          {/* Vertical dividers */}
          {brush?.dividers.map((x, i) => (
            <rect key={i} x={x} y={0} width={1.5} height={isPopup ? 22 : 15} rx={0.75} fill="#cbd5e1" />
          ))}

          {/* Active orange glowing brush selection with grip tabs */}
          {brush && brush.segments.length > 0 && (
            <g filter={`url(#${ids}-brush-glow)`}>
              {brush.segments.map(([from, to], i) => (
                <React.Fragment key={i}>
                  <rect x={from} y={isPopup ? 3 : 1} width={Math.max(0, to - from)} height={isPopup ? 16 : 13} rx={2} fill="#fa4c00" />
                  <rect x={from + 0.5} y={isPopup ? 3.5 : 1.5} width={Math.max(0, to - from - 1)} height={isPopup ? 15 : 12} rx={1.5} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.5} />
                </React.Fragment>
              ))}
              {/* White grip handles */}
              <path d={gripPath(brush.segments[0][0] + 2, 'left', isPopup)} fill="#ffffff" />
              <path d={gripPath(brush.segments[brush.segments.length - 1][1] - 2, 'right', isPopup)} fill="#ffffff" />
            </g>
          )}

          {/* Month / Section markers */}
          {brush?.markers.map(x => (
            <path key={x} d={markerPath(x, isPopup)} fill="#475569" />
          ))}
        </svg>
      </div>

      {/* Axis Labels without collision */}
      <div style={{ position: 'relative', height: '13px', flexShrink: 0, width: '100%', marginTop: '0px' }}>
        {axisLabels.map(({ idx, label, isMajor }) => (
          <span
            key={items[idx]?.id || idx}
            style={{
              position: 'absolute',
              left: `${xs[idx]}px`,
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: isMajor ? (isPopup ? '10px' : '8.5px') : (isPopup ? '9px' : '8px'),
              fontWeight: isMajor ? '700' : '500',
              color: isMajor ? '#0f172a' : '#64748b',
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
