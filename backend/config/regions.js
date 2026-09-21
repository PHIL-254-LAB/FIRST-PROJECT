const REGION_VANS = {
  Kakamega: ['VAN D', 'VAN G1', 'VAN G2', 'VAN F1', 'VAN F2', 'VAN H1', 'VAN H2', 'J001', 'W001 KKMG'],
  Webuye: ['WEB 1', 'WEB 2', 'WEB 3', 'WEB 4', 'WEB 5'],
  Busia: ['A001', 'A002', 'C001', 'E001', 'W001 BUSIA'],
  Luanda: ['B001']
};

const allowedRegions = Object.keys(REGION_VANS);

function vansForRegion(region) {
  return REGION_VANS[region] || [];
}

function isValidVan(region, van) {
  return vansForRegion(region).includes(van);
}

module.exports = { REGION_VANS, allowedRegions, vansForRegion, isValidVan };