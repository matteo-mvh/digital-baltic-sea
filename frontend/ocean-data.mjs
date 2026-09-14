// Presentation rules for existing static data. No updater or remote service calls.
export function formatTimestamp(value, locale = 'en-GB') {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
  }).format(date) + ' UTC';
}

export function readableUnit(unit) {
  return ({degC: '°C', degree_Celsius: '°C', 'mmol/m^3': 'mmol m⁻³', 'mmol m-3': 'mmol m⁻³', 'm s-1': 'm/s'})[unit] || unit || '';
}

export function nonnegativeQuantity(condition = {}) {
  // Components remain signed even when they belong to the currents layer.
  if (['uo', 'vo', 'eastward', 'northward'].includes(condition.variable)) return false;
  return ['currents', 'salinity', 'oxygen', 'waves'].includes(condition.id);
}

export function displayRangeForMetadata(metadata, condition = metadata?.condition) {
  const range = metadata?.value_range_celsius ?? metadata?.value_range ?? {};
  let min = range.min, max = range.max;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = range.display_min; max = range.display_max;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {min: 0, max: 1};
  // A scale boundary is not a source-data correction. Invalid cells are excluded separately.
  if (nonnegativeQuantity(condition)) { min = Math.max(0, min); max = Math.max(0, max); }
  const step = 10 ** Math.floor(Math.log10(Math.max(max - min, Math.abs(max) * 0.01, 0.01))) / 5;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  if (min === max) max = min + step;
  return {min: Number(min.toPrecision(12)), max: Number(max.toPrecision(12))};
}

export function cleanFrame(payload, gridKey, condition) {
  if (!Array.isArray(payload?.[gridKey]) || !payload[gridKey].length) throw new Error('Frame has no primary grid');
  let invalidCount = 0, min = Infinity, max = -Infinity;
  const grid = payload[gridKey].map(row => row.map(value => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegativeQuantity(condition) && value < 0)) {
      invalidCount++; return null;
    }
    min = Math.min(min, value); max = Math.max(max, value); return value;
  }));
  return {...payload, [gridKey]: grid, quality: {invalidCount, min: min === Infinity ? null : min, max: max === -Infinity ? null : max}};
}

export function nearestFrameIndexForTimestamp(metadata, timestamp) {
  const frames = metadata?.frames || [];
  const target = Date.parse(timestamp);
  if (!Number.isFinite(target)) return Math.max(0, Math.min(metadata?.initial_frame_index || 0, frames.length - 1));
  let best = 0, distance = Infinity;
  frames.forEach((frame, index) => {
    const delta = Math.abs(Date.parse(frame.time_utc) - target);
    if (delta < distance) {best = index; distance = delta;}
  });
  return best;
}

export function forecastArchived(metadata, now = Date.now()) {
  const times = (metadata?.frames || []).map(f => Date.parse(f.time_utc)).filter(Number.isFinite);
  return /forecast/i.test(metadata?.provenance?.type || metadata?.condition?.dataset_type || '') && times.length > 0 && Math.max(...times) < now;
}

export function intervalLabel(metadata) {
  const times = (metadata?.frames || []).map(f => Date.parse(f.time_utc));
  const intervals = times.slice(1).map((t,i) => (t - times[i]) / 60000).filter(n => n > 0);
  if (!intervals.length) return 'One published time step';
  const values = [...new Set(intervals)];
  const text = n => n >= 60 && n % 60 === 0 ? `${n / 60} h` : `${n} min`;
  return values.length === 1 ? `${text(values[0])} between published frames` : `${text(Math.min(...values))}–${text(Math.max(...values))} between published frames (irregular)`;
}
