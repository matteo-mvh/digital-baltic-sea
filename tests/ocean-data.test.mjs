import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTimestamp, readableUnit, cleanFrame, displayRangeForMetadata, nearestFrameIndexForTimestamp, forecastArchived, intervalLabel} from '../frontend/ocean-data.mjs';
import {readFileSync} from 'node:fs';

test('nonnegative scales remove historical generic padding without mutating data', () => {
  for (const id of ['currents', 'salinity', 'oxygen', 'waves']) {
    const metadata = {condition: {id}, value_range: {min: 0, max: 0.983, display_min: -0.5, display_max: 1.5}};
    const before = structuredClone(metadata);
    assert.deepEqual(displayRangeForMetadata(metadata), {min: 0, max: 1});
    assert.deepEqual(metadata, before);
  }
});
test('signed quantities retain negative scales and values', () => {
  for (const condition of [{id:'temperature'}, {id:'seaLevel'}, {id:'currents',variable:'uo'}, {id:'currents',variable:'vo'}]) {
    assert.ok(displayRangeForMetadata({condition, value_range:{min:-2,max:3}}).min < 0);
    assert.equal(cleanFrame({values:[[-2,3]]},'values',condition).values[0][0], -2);
  }
});
test('invalid concentrations are excluded rather than clamped, zero remains valid', () => {
  const payload = {values:[[-2, null, 0, 4, Infinity, '3']]};
  const cleaned = cleanFrame(payload,'values',{id:'oxygen'});
  assert.deepEqual(cleaned.values, [[null, null, 0, 4, null, null]]);
  assert.deepEqual(cleaned.quality, {invalidCount:3,min:0,max:4});
  assert.equal(payload.values[0][0],-2);
});
test('constant fields, missing ranges and invalid timestamps remain usable', () => {
  const range = displayRangeForMetadata({value_range:{min:0,max:0}});
  assert.ok(range.max > range.min);
  assert.deepEqual(displayRangeForMetadata(null),{min:0,max:1});
  assert.equal(formatTimestamp('invalid'),'Timestamp unavailable');
  assert.equal(formatTimestamp('2026-08-20T06:00:00+02:00'),'20 Aug 2026, 04:00 UTC');
  assert.equal(readableUnit('mmol/m^3'),'mmol m⁻³');
});
const metadata = {provenance:{type:'Modelled analysis and forecast'},frames:[{time_utc:'2026-08-20T00:00:00Z'},{time_utc:'2026-08-21T00:00:00Z'}]};
test('nearest native time and expiry use actual frames, not retrieval time', () => {
  assert.equal(nearestFrameIndexForTimestamp(metadata,'2026-08-20T23:00:00Z'),1);
  assert.equal(nearestFrameIndexForTimestamp(metadata,'2026-08-20T12:00:00Z'),0);
  assert.equal(forecastArchived(metadata,Date.parse('2026-09-14')),true);
  assert.equal(forecastArchived(metadata,Date.parse('2026-08-20')),false);
  assert.equal(intervalLabel(metadata),'24 h between published frames');
});
test('manual update boundary remains in place', () => {
  const workflow = readFileSync(new URL('../.github/workflows/update-ocean-data.yml',import.meta.url),'utf8').split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/schedule:|cron:|workflow_run:|repository_dispatch:|^\s+push:/m);
  const browser = readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(browser,/api\.github\.com|workflow_dispatch|update_copernicus|setInterval\s*\(/);
});

test('all enabled languages cover the complete interface and retain message parameters', () => {
  const readLocale = code => JSON.parse(readFileSync(new URL(`../frontend/locales/${code}.json`,import.meta.url),'utf8'));
  const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'object' ? flatten(item, `${prefix}${key}.`) : [[`${prefix}${key}`, item]]);
  const english = Object.fromEntries(flatten(readLocale('en')));
  for (const locale of ['de','da']) {
    const translated = Object.fromEntries(flatten(readLocale(locale)));
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    for (const [key, value] of Object.entries(translated)) {
      assert.ok(typeof value === 'string' && value.trim(), `${locale}: ${key}`);
      assert.deepEqual(value.match(/\{\w+\}/g)?.sort() || [], english[key].match(/\{\w+\}/g)?.sort() || [], `${locale}: ${key}`);
    }
  }
});
