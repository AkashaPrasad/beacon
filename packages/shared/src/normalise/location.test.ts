import { describe, expect, it } from 'vitest';

import {
  inferRemote,
  KNOWN_CITIES,
  normaliseCountry,
  normaliseLocation,
  normaliseLocations,
} from './location';

describe('inferRemote', () => {
  it.each([
    ['Remote', 'remote'],
    ['Work from home', 'remote'],
    ['WFH (India)', 'remote'],
    ['Anywhere in India', 'remote'],
    ['Online', 'remote'],
    ['Fully remote, async', 'remote'],
    ['Hybrid - Pune', 'hybrid'],
    ['Flexible working, Bengaluru', 'hybrid'],
    ['Remote / Hybrid', 'remote'],
    ['Hybrid or remote', 'remote'],
    ['Hybrid (2 days remote)', 'hybrid'],
    ['On-site, Bangalore', 'onsite'],
    ['In-office only', 'onsite'],
    ['Work from office', 'onsite'],
    ['No remote, Mumbai', 'onsite'],
    ['Non-remote role', 'onsite'],
    ['Remote not available', 'onsite'],
    ['Bengaluru', 'unknown'],
    ['', 'unknown'],
  ])('%j → %s', (text, expected) => {
    expect(inferRemote(text)).toBe(expected);
  });
});

describe('normaliseCountry', () => {
  it.each([
    ['India', 'IN'],
    ['indian', 'IN'],
    ['IND', 'IN'],
    ['in', 'IN'],
    ['U.S.A.', 'US'],
    ['United States of America', 'US'],
    ['American', 'US'],
    ['UK', 'GB'],
    ['British', 'GB'],
    ['Deutschland', 'DE'],
    ['Türkiye', 'TR'],
    ['UAE', 'AE'],
    ['Atlantis', null],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseCountry(input)).toBe(expected);
  });
});

describe('normaliseLocation', () => {
  it.each([
    ['Bangalore', { city: 'Bengaluru', region: 'Karnataka', country: 'IN', remote: 'onsite' }],
    ['Bengaluru, Karnataka, India', { city: 'Bengaluru', country: 'IN', remote: 'onsite' }],
    ['BLR / Remote', { city: 'Bengaluru', remote: 'remote' }],
    ['Gurgaon, Haryana', { city: 'Gurugram', region: 'Haryana', country: 'IN' }],
    ['New Delhi', { city: 'Delhi', country: 'IN' }],
    ['Navi Mumbai', { city: 'Navi Mumbai' }],
    ['Bombay', { city: 'Mumbai' }],
    ['Hybrid - Pune', { city: 'Pune', remote: 'hybrid' }],
    ['Trivandrum, Kerala', { city: 'Thiruvananthapuram', region: 'Kerala' }],
    ['München, Germany', { city: 'Munich', country: 'DE' }],
    ['San Francisco, CA', { city: 'San Francisco', region: 'California', country: 'US' }],
    ['NYC', { city: 'New York', country: 'US' }],
    ['Austin, TX', { city: 'Austin', region: 'Texas', country: 'US' }],
    ['Boulder, CO', { city: null, region: 'Colorado', country: 'US', remote: 'onsite' }],
    ['Karnataka', { city: null, region: 'Karnataka', country: 'IN', remote: 'onsite' }],
    ['Remote - India', { city: null, country: 'IN', remote: 'remote' }],
    ['Remote (US only)', { country: 'US', remote: 'remote' }],
    ['Remote, UK', { country: 'GB', remote: 'remote' }],
    ['Berlin, DE', { city: 'Berlin', country: 'DE' }],
    ['Singapore', { city: 'Singapore', country: 'SG' }],
    ['India', { city: null, country: 'IN', remote: 'unknown' }],
    ['Remote', { city: null, country: null, remote: 'remote' }],
    ['Mars Base One', { city: null, region: null, country: null, remote: 'unknown' }],
    ['', { city: null, country: null, remote: 'unknown' }],
  ])('%j', (raw, expected) => {
    const result = normaliseLocation(raw);
    expect(result.raw).toBe(raw);
    expect(result).toMatchObject(expected);
  });

  it('normalises a list', () => {
    expect(normaliseLocations(['Pune', 'Remote']).map((l) => l.city)).toEqual(['Pune', null]);
  });

  it('has unique city names and valid country codes', () => {
    const names = KNOWN_CITIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const city of KNOWN_CITIES) expect(city.country).toMatch(/^[A-Z]{2}$/);
    expect(KNOWN_CITIES.filter((c) => c.country === 'IN').length).toBeGreaterThanOrEqual(50);
  });
});
