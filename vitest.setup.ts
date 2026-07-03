// The environment schema requires station coordinates; provide test values
// before any module calls getEnvironment().
Object.assign(process.env, {
  LOCATION_LATITUDE: "37.7749",
  LOCATION_LONGITUDE: "-122.4194",
})
