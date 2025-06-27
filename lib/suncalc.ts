// biome-ignore-all lint/suspicious/noImplicitAnyLet: vendored
/*
 (c) 2011-2015, Vladimir Agafonkin
 SunCalc is a JavaScript library for calculating sun/moon position and light phases.
 https://github.com/mourner/suncalc
*/

// shortcuts for easier to read formulas
const PI = Math.PI,
  sin = Math.sin,
  cos = Math.cos,
  tan = Math.tan,
  asin = Math.asin,
  atan = Math.atan2,
  acos = Math.acos,
  rad = PI / 180

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas

// date/time constants and conversions
const dayMs = 1000 * 60 * 60 * 24,
  J1970 = 2_440_588,
  J2000 = 2_451_545

function toJulian(date: Date): number {
  return date.valueOf() / dayMs - 0.5 + J1970
}
function fromJulian(index: number): Date {
  return new Date((index + 0.5 - J1970) * dayMs)
}
function toDays(date: Date): number {
  return toJulian(date) - J2000
}

// general calculations for position
const e = rad * 23.4397 // obliquity of the Earth

function rightAscension(l: number, b: number): number {
  return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l))
}
function declination(l: number, b: number): number {
  return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l))
}

function azimuth(H: number, phi: number, dec: number) {
  return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi))
}
function altitude(H: number, phi: number, dec: number): number {
  return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H))
}

function siderealTime(d: number, lw: number): number {
  return rad * (280.16 + 360.985_623_5 * d) - lw
}

function astroRefraction(h: number): number {
  if (h < 0) {
    // the following formula works for positive altitudes only.
    h = 0 // if h = -0.08901179 a div/0 would occur.
  }

  // formula 16.4 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
  // 1.02 / tan(h + 10.26 / (h + 5.10)) h in degrees, result in arc minutes -> converted to rad:
  return 0.000_296_7 / Math.tan(h + 0.003_125_36 / (h + 0.089_011_79))
}

// general sun calculations
function solarMeanAnomaly(d: number): number {
  return rad * (357.5291 + 0.985_600_28 * d)
}

function eclipticLongitude(M: number): number {
  const C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
    P = rad * 102.9372 // perihelion of the Earth

  return M + C + P + PI
}

function sunCoords(d: number): { dec: number; ra: number } {
  const M = solarMeanAnomaly(d),
    L = eclipticLongitude(M)

  return {
    dec: declination(L, 0),
    ra: rightAscension(L, 0),
  }
}

export interface PositionData {
  azimuth: number;
  altitude: number;
}

// calculates sun position for a given date and latitude/longitude
export function getPosition(date: Date, lat: number, lng: number): PositionData {
  const lw = rad * -lng,
    phi = rad * lat,
    d = toDays(date),
    c = sunCoords(d),
    H = siderealTime(d, lw) - c.ra

  return {
    azimuth: azimuth(H, phi, c.dec),
    altitude: altitude(H, phi, c.dec),
  }
}

// sun times configuration (angle, morning name, evening name)
const times: [number, string, string][] = [
  [-0.833, "sunrise", "sunset"] as [number, string, string],
  [-0.3, "sunriseEnd", "sunsetStart"] as [number, string, string],
  [-6, "dawn", "dusk"] as [number, string, string],
  [-12, "nauticalDawn", "nauticalDusk"] as [number, string, string],
  [-18, "nightEnd", "night"] as [number, string, string],
  [6, "goldenHourEnd", "goldenHour"] as [number, string, string],
]

// adds a custom time to the times config
export function addTime(angle: number, riseName: string, setName: string): void {
  times.push([angle, riseName, setName])
}

// calculations for sun times
const J0 = 0.0009

function julianCycle(d: number, lw: number): number {
  return Math.round(d - J0 - lw / (2 * PI))
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return J0 + (Ht + lw) / (2 * PI) + n
}
function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L)
}

function hourAngle(h: number, phi: number, d: number) {
  return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)))
}

// returns set time for the given sun altitude
function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec),
    a = approxTransit(w, lw, n)
  return solarTransitJ(a, M, L)
}

export type TimesData = {
  solarNoon: Date;
  nadir: Date;
  sunrise: Date;
  sunset: Date;
  sunriseEnd: Date;
  sunsetStart: Date;
  dawn: Date;
  dusk: Date;
  nauticalDawn: Date;
  nauticalDusk: Date;
  nightEnd: Date;
  night: Date;
  goldenHourEnd: Date;
  goldenHour: Date;
} & Record<string, Date>;

// calculates sun times for a given date and latitude/longitude
export function getTimes(date: Date, lat: number, lng: number): TimesData {
  const lw = rad * -lng,
    phi = rad * lat,
    d = toDays(date),
    n = julianCycle(d, lw),
    ds = approxTransit(0, lw, n),
    M = solarMeanAnomaly(ds),
    L = eclipticLongitude(M),
    dec = declination(L, 0),
    Jnoon = solarTransitJ(ds, M, L)
  let index, length_, time, Jset, Jrise

  const result = {
    solarNoon: fromJulian(Jnoon),
    nadir: fromJulian(Jnoon + 0.5),
  } as TimesData

  for (index = 0, length_ = times.length; index < length_; index += 1) {
    time = times[index]

    Jset = getSetJ(time[0] * rad, lw, phi, dec, n, M, L)
    Jrise = Jnoon - (Jset - Jnoon)

    result[time[1]] = fromJulian(Jrise)
    result[time[2]] = fromJulian(Jset)
  }

  return result
}

// moon calculations, based on http://aa.quae.nl/en/reken/hemelpositie.html formulas
function moonCoords(d: number): {
  ra: number;
  dec: number;
  dist: number;
} {
  // geocentric ecliptic coordinates of the moon
  const L = rad * (218.316 + 13.176_396 * d), // ecliptic longitude
    M = rad * (134.963 + 13.064_993 * d), // mean anomaly
    F = rad * (93.272 + 13.229_35 * d), // mean distance
    l = L + rad * 6.289 * sin(M), // longitude
    b = rad * 5.128 * sin(F), // latitude
    dt = 385_001 - 20_905 * cos(M) // distance to the moon in km

  return {
    ra: rightAscension(l, b),
    dec: declination(l, b),
    dist: dt,
  }
}

export interface MoonPositionData {
  azimuth: number;
  altitude: number;
  distance: number;
  parallacticAngle: number;
}

export function getMoonPosition(date: Date, lat: number, lng: number): MoonPositionData {
  const lw = rad * -lng,
    phi = rad * lat,
    d = toDays(date),
    c = moonCoords(d),
    H = siderealTime(d, lw) - c.ra
  let h = altitude(H, phi, c.dec)
  // formula 14.1 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
  const pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H))

  h = h + astroRefraction(h) // altitude correction for refraction

  return {
    azimuth: azimuth(H, phi, c.dec),
    altitude: h,
    distance: c.dist,
    parallacticAngle: pa,
  }
}

export interface MoonIlluminationData { fraction: number; phase: number; angle: number }

// calculations for illumination parameters of the moon,
// based on http://idlastro.gsfc.nasa.gov/ftp/pro/astro/mphase.pro formulas and
// Chapter 48 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
export function getMoonIllumination(date: Date): MoonIlluminationData {
  const d = toDays(date || new Date()),
    s = sunCoords(d),
    m = moonCoords(d),
    sdist = 149_598_000, // distance from Earth to Sun in km
    phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)),
    inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)),
    angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra))

  return {
    fraction: (1 + cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    angle,
  }
}

function hoursLater(date: Date, h: number): Date {
  return new Date(date.valueOf() + (h * dayMs) / 24)
}

export interface MoonTimesData {
  rise?: Date;
  set?: Date;
  alwaysUp?: boolean;
  alwaysDown?: boolean;
}

// calculations for moon rise/set times are based on http://www.stargazing.net/kepler/moonrise.html article
export function getMoonTimes(date: Date, lat: number, lng: number, inUTC: boolean): MoonTimesData {
  const t = new Date(date)
  if (inUTC) {
    t.setUTCHours(0, 0, 0, 0)
  } else {
    t.setHours(0, 0, 0, 0)
  }

  const hc = 0.133 * rad
  let h0 = getMoonPosition(t, lat, lng).altitude - hc,
    h1,
    h2,
    rise,
    set,
    a,
    b,
    xe,
    ye!: number,
    d,
    roots,
    x1!: number,
    x2!: number,
    dx

  // go in 2-hour chunks, each time seeing if a 3-point quadratic curve crosses zero (which means rise or set)
  for (let index = 1; index <= 24; index += 2) {
    h1 = getMoonPosition(hoursLater(t, index), lat, lng).altitude - hc
    h2 = getMoonPosition(hoursLater(t, index + 1), lat, lng).altitude - hc

    a = (h0 + h2) / 2 - h1
    b = (h2 - h0) / 2
    xe = -b / (2 * a)
    ye = (a * xe + b) * xe + h1
    d = b * b - 4 * a * h1
    roots = 0

    if (d >= 0) {
      dx = Math.sqrt(d) / (Math.abs(a) * 2)
      x1 = xe - dx
      x2 = xe + dx
      if (Math.abs(x1) <= 1) {
        roots++
      }
      if (Math.abs(x2) <= 1) {
        roots++
      }
      if (x1 < -1) {
        x1 = x2
      }
    }

    if (roots === 1) {
      if (h0 < 0) {
        rise = index + x1
      } else {
        set = index + x1
      }
    } else if (roots === 2) {
      rise = index + (ye < 0 ? x2 : x1)
      set = index + (ye < 0 ? x1 : x2)
    }

    if (rise && set) {
      break
    }

    h0 = h2
  }

  const result = {} as MoonTimesData

  if (rise) {
    result.rise = hoursLater(t, rise)
  }
  if (set) {
    result.set = hoursLater(t, set)
  }

  if (!rise && !set) {
    result[ye > 0 ? "alwaysUp" : "alwaysDown"] = true
  }

  return result
}