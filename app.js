// === CONFIGURAZIONE GENERALE ===
const DISTANCE_THRESHOLD_METERS = 30;

// Mappa alias → chiave città (garantisce ricerca corretta)
const CITY_ALIASES = {
  rome: ["roma", "rome", "rom"],
  paris: ["parigi", "paris"],
  london: ["londra", "london", "londres"],
  amsterdam: ["amsterdam", "amsterdam"],
  barcelona: ["barcellona", "barcelona", "barna"],
  berlin: ["berlino", "berlin"],
  madrid: ["madrid", "madrid"],
  lisbon: ["lisbona", "lisboa", "lisbon"],
  prague: ["praga", "prague", "praha"],
  brussels: ["bruxelles", "brussels", "brussel", "bruxelles"],
  antwerp: ["anversa", "antwerp", "antwerpen", "anvers"],
  leuven: ["leuven", "lovanio", "louvain"],
  mechelen: ["mechelen", "malines", "mechelen"],
  ottignies: ["ottignies", "louvain-la-neuve", "lln", "ottignies-louvain-la-neuve"],
  vienna: ["vienna", "wien", "vienna"],
  milan: ["milano", "milan", "milano"],
  florence: ["firenze", "florence", "florence"],
  venice: ["venezia", "venice", "venise"],
  dublin: ["dublino", "dublin"],
  edinburgh: ["edimburgo", "edinburgh"],
  lyon: ["lione", "lyon", "lyon"],
  nice: ["nizza", "nice"],
  ghent: ["gand", "ghent", "gent"],
  bruges: ["bruges", "brugge", "brugges"],
  liege: ["liegi", "liege", "luik"],
  namur: ["namur", "namur", "namen"],
  munich: ["monaco", "munich", "munchen", "münchen"],
  zurich: ["zurigo", "zurich", "zürich"]
};

// Fallback placeholder
function getPhotoUrl(poiName, cityName = "") {
  const seed = `${poiName}-${cityName}`.replace(/\s+/g, "-").toLowerCase();
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/500`;
}

// Cache per foto reali Wikipedia
const photoCache = new Map();

// Mapping POI → titolo Wikipedia inglese (per foto veritiere ai monumenti)
const POI_WIKI_TITLES = {
  "Colosseo|Roma": "Colosseum",
  "Fontana di Trevi|Roma": "Trevi Fountain",
  "Pantheon|Roma": "Pantheon, Rome",
  "Foro Romano|Roma": "Roman Forum",
  "Piazza Navona|Roma": "Piazza Navona",
  "Tour Eiffel|Paris": "Eiffel Tower",
  "Louvre|Paris": "Louvre",
  "Notre Dame|Paris": "Notre-Dame de Paris",
  "Big Ben|London": "Big Ben",
  "Tower Bridge|London": "Tower Bridge",
  "Westminster Abbey|London": "Westminster Abbey",
  "Sagrada Família|Barcelona": "Sagrada Família",
  "Park Güell|Barcelona": "Park Güell",
  "Brandenburg Gate|Berlin": "Brandenburg Gate",
  "Manneken Pis|Brussels": "Manneken Pis",
  "Grand Place|Brussels": "Grand-Place",
  "Charles Bridge|Prague": "Charles Bridge",
  "Duomo di Milano|Milano": "Milan Cathedral",
  "Duomo di Firenze|Firenze": "Florence Cathedral",
  "Piazza San Marco|Venezia": "Piazza San Marco",
  "Ponte Vecchio|Firenze": "Ponte Vecchio"
};

// Recupera foto reali tramite Wikipedia API (immagini dei luoghi effettivi)
async function getRealPhotoUrl(poiName, cityName = "", wikiTitleOverride) {
  const cacheKey = `${poiName}|${cityName}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey);

  const wikiTitle = wikiTitleOverride || POI_WIKI_TITLES[cacheKey] || (cityName ? `${poiName} ${cityName}` : poiName);
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=800&format=json&origin=*`;

  try {
    let res = await fetch(url);
    let data = await res.json();
    let pages = data.query?.pages;
    let thumb = null;
    if (pages) {
      const page = Object.values(pages)[0];
      thumb = page?.thumbnail?.source;
    }
    if (!thumb && !wikiTitleOverride) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(wikiTitle)}&gsrlimit=1&prop=pageimages&pithumbsize=800&format=json&origin=*`;
      res = await fetch(searchUrl);
      data = await res.json();
      pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        thumb = page?.thumbnail?.source;
      }
    }
    if (thumb) {
      photoCache.set(cacheKey, thumb);
      return thumb;
    }
  } catch (e) { console.warn("Wikipedia photo fetch:", e); }
  const fallback = getPhotoUrl(poiName, cityName);
  photoCache.set(cacheKey, fallback);
  return fallback;
}

// Ordina i POI partendo dalla posizione utente (nearest-neighbor)
function optimizeRouteFromPosition(pois, userLat, userLng) {
  if (!pois.length || typeof google === "undefined" || !google.maps?.geometry?.spherical) return pois;

  const remaining = [...pois];
  const ordered = [];
  let current = { lat: userLat, lng: userLng };

  while (remaining.length) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(current.lat, current.lng),
        new google.maps.LatLng(remaining[i].lat, remaining[i].lng)
      );
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }
    ordered.push(remaining[nearestIdx]);
    current = remaining[nearestIdx];
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

// Funzione per risolvere il nome inserito alla chiave corretta
function resolveCityKey(input) {
  const normalized = input.toLowerCase().trim().replace(/[\s-]+/g, "-");
  for (const [key, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

// Database Itinerari potenziato con più città europee
const CITY_TEMPLATES = {
  rome: {
    displayName: "Roma",
    pois: [
      { name: "Colosseo", lat: 41.8902, lng: 12.4922 },
      { name: "Foro Romano", lat: 41.8925, lng: 12.4853 },
      { name: "Palatino", lat: 41.8884, lng: 12.4868 },
      { name: "Altare della Patria", lat: 41.8946, lng: 12.4828 },
      { name: "Pantheon", lat: 41.8986, lng: 12.4769 },
      { name: "Piazza Navona", lat: 41.8992, lng: 12.4731 },
      { name: "Castel Sant'Angelo", lat: 41.9031, lng: 12.4663 },
      { name: "Piazza San Pietro", lat: 41.9022, lng: 12.4572 },
      { name: "Musei Vaticani", lat: 41.9065, lng: 12.4536 },
      { name: "Fontana di Trevi", lat: 41.9009, lng: 12.4833 },
      { name: "Piazza di Spagna", lat: 41.9057, lng: 12.4823 },
      { name: "Villa Borghese", lat: 41.9128, lng: 12.4852 }
    ]
  },
  paris: {
    displayName: "Paris",
    pois: [
      { name: "Tour Eiffel", lat: 48.8584, lng: 2.2945 },
      { name: "Champ de Mars", lat: 48.8556, lng: 2.2986 },
      { name: "Arco di Trionfo", lat: 48.8738, lng: 2.2950 },
      { name: "Champs-Élysées", lat: 48.8698, lng: 2.3075 },
      { name: "Place de la Concorde", lat: 48.8655, lng: 2.3211 },
      { name: "Louvre", lat: 48.8606, lng: 2.3376 },
      { name: "Notre Dame", lat: 48.8530, lng: 2.3499 },
      { name: "Sainte-Chapelle", lat: 48.8554, lng: 2.3450 },
      { name: "Panthéon", lat: 48.8462, lng: 2.3464 },
      { name: "Museo d'Orsay", lat: 48.8599, lng: 2.3265 },
      { name: "Sacré-Cœur", lat: 48.8867, lng: 2.3431 },
      { name: "Opéra Garnier", lat: 48.8719, lng: 2.3316 }
    ]
  },
  london: {
    displayName: "London",
    pois: [
      { name: "Big Ben", lat: 51.5007, lng: -0.1246 },
      { name: "Westminster Abbey", lat: 51.4994, lng: -0.1273 },
      { name: "Buckingham Palace", lat: 51.5014, lng: -0.1419 },
      { name: "Trafalgar Square", lat: 51.5080, lng: -0.1281 },
      { name: "National Gallery", lat: 51.5089, lng: -0.1286 },
      { name: "British Museum", lat: 51.5194, lng: -0.1270 },
      { name: "St. Paul's Cathedral", lat: 51.5138, lng: -0.0984 },
      { name: "Tower of London", lat: 51.5081, lng: -0.0759 },
      { name: "Tower Bridge", lat: 51.5055, lng: -0.0754 },
      { name: "The Shard", lat: 51.5045, lng: -0.0865 },
      { name: "London Eye", lat: 51.5033, lng: -0.1195 },
      { name: "Piccadilly Circus", lat: 51.5101, lng: -0.1342 }
    ]
  },
leuven: {
    displayName: "Leuven",
    pois: [
      { name: "Grote Markt", lat: 50.8795, lng: 4.7005 },
      { name: "Stadhuis van Leuven", lat: 50.8794, lng: 4.7004 },
      { name: "Sint-Pieterskerk", lat: 50.8791, lng: 4.7009 },
      { name: "KU Leuven Universiteitsbibliotheek", lat: 50.8796, lng: 4.7019 },
      { name: "Imec Tower", lat: 50.8633, lng: 4.6789 },
      { name: "Park Abbey", lat: 50.8556, lng: 4.7261 },
      { name: "Stella Artois Brouwerij", lat: 50.8760, lng: 4.6992 },
      { name: "Museum Leuven", lat: 50.8783, lng: 4.6997 },
      { name: "Fonske Fountain", lat: 50.8793, lng: 4.7006 },
      { name: "Naamsestraat", lat: 50.8760, lng: 4.6992 }
    ]
  },
  mechelen: {
    displayName: "Mechelen",
    pois: [
      { name: "Grote Markt Mechelen", lat: 51.0280, lng: 4.4800 },
      { name: "Sint-Romboutskathedraal", lat: 51.0284, lng: 4.4800 },
      { name: "Stadhuis Mechelen", lat: 51.0279, lng: 4.4792 },
      { name: "Hof van Busleyden", lat: 51.0289, lng: 4.4811 },
      { name: "Paleis op de Meir", lat: 51.0278, lng: 4.4806 },
      { name: "Speelgoedmuseum", lat: 51.0293, lng: 4.4828 },
      { name: "Dijle River Walk", lat: 51.0275, lng: 4.4780 },
      { name: "Begijnhof Mechelen", lat: 51.0261, lng: 4.4819 },
      { name: "Schepenhuis", lat: 51.0281, lng: 4.4794 },
      { name: "IJzerenleen", lat: 51.0283, lng: 4.4797 }
    ]
  },
  antwerp: {
    displayName: "Anversa",
    pois: [
      { name: "Grote Markt Anversa", lat: 51.2213, lng: 4.3997 },
      { name: "Onze-Lieve-Vrouwekathedraal", lat: 51.2211, lng: 4.4003 },
      { name: "Rubenshuis", lat: 51.2180, lng: 4.4079 },
      { name: "MAS Museum aan de Stroom", lat: 51.2298, lng: 4.4019 },
      { name: "Steen Castle", lat: 51.2237, lng: 4.3964 },
      { name: "KMSKA", lat: 51.2117, lng: 4.4104 },
      { name: "Plantin-Moretus Museum", lat: 51.2196, lng: 4.3983 },
      { name: "Meir Shopping Street", lat: 51.2178, lng: 4.4094 },
      { name: "Chinatown Antwerp", lat: 51.2265, lng: 4.4108 },
      { name: "Zoo Antwerpen", lat: 51.2167, lng: 4.4214 }
    ]
  },
  ottignies: {
    displayName: "Ottignies",
    pois: [
      { name: "Gare d'Ottignies", lat: 50.6697, lng: 4.5664 },
      { name: "Place de l'Eglise Ottignies", lat: 50.6706, lng: 4.5656 },
      { name: "Bois de Lauzelle", lat: 50.6576, lng: 4.5734 },
      { name: "Louvain-la-Neuve Campus", lat: 50.6683, lng: 4.6156 },
      { name: "Grand-Place Louvain-la-Neuve", lat: 50.6683, lng: 4.6124 },
      { name: "Lac de Louvain-la-Neuve", lat: 50.6653, lng: 4.6212 },
      { name: "Musee de Louvain-la-Neuve", lat: 50.6694, lng: 4.6110 },
      { name: "Theatre Jean Vilar", lat: 50.6679, lng: 4.6114 },
      { name: "Parc du Rabais", lat: 50.6663, lng: 4.5589 },
      { name: "Eglise Saint-Pierre Ottignies", lat: 50.6709, lng: 4.5660 }
    ]
  },
    amsterdam: {
    displayName: "Amsterdam",
    pois: [
      { name: "Dam Square", lat: 52.3731, lng: 4.8922 },
      { name: "Royal Palace", lat: 52.3732, lng: 4.8914 },
      { name: "Anne Frank House", lat: 52.3752, lng: 4.8840 },
      { name: "Westerkerk", lat: 52.3745, lng: 4.8836 },
      { name: "Jordaan", lat: 52.3745, lng: 4.8800 },
      { name: "Bloemenmarkt", lat: 52.3667, lng: 4.8914 },
      { name: "Rijksmuseum", lat: 52.3600, lng: 4.8852 },
      { name: "Van Gogh Museum", lat: 52.3584, lng: 4.8811 },
      { name: "Stedelijk Museum", lat: 52.3580, lng: 4.8797 },
      { name: "Vondelpark", lat: 52.3584, lng: 4.8686 },
      { name: "Rembrandt House", lat: 52.3694, lng: 4.9013 },
      { name: "NEMO Science Museum", lat: 52.3741, lng: 4.9123 }
    ]
  },
  barcelona: {
    displayName: "Barcelona",
    pois: [
      { name: "Sagrada Família", lat: 41.4036, lng: 2.1744 },
      { name: "Recinte Modernista de Sant Pau", lat: 41.4116, lng: 2.1743 },
      { name: "Park Güell", lat: 41.4145, lng: 2.1527 },
      { name: "Casa Milà (La Pedrera)", lat: 41.3952, lng: 2.1619 },
      { name: "Casa Batlló", lat: 41.3917, lng: 2.1649 },
      { name: "Plaça de Catalunya", lat: 41.3870, lng: 2.1701 },
      { name: "Gothic Quarter", lat: 41.3833, lng: 2.1764 },
      { name: "Barcelona Cathedral", lat: 41.3839, lng: 2.1762 },
      { name: "Plaça Reial", lat: 41.3803, lng: 2.1752 },
      { name: "La Rambla", lat: 41.3825, lng: 2.1701 },
      { name: "Mercado de La Boqueria", lat: 41.3817, lng: 2.1715 },
      { name: "Arc de Triomf", lat: 41.3911, lng: 2.1806 }
    ]
  },
  berlin: {
    displayName: "Berlin",
    pois: [
      { name: "Brandenburg Gate", lat: 52.5163, lng: 13.3777 },
      { name: "Reichstag Building", lat: 52.5186, lng: 13.3761 },
      { name: "Holocaust Memorial", lat: 52.5139, lng: 13.3786 },
      { name: "Checkpoint Charlie", lat: 52.5074, lng: 13.3904 },
      { name: "Museum Island", lat: 52.5169, lng: 13.3992 },
      { name: "Berlin Cathedral", lat: 52.5190, lng: 13.4011 },
      { name: "Alexanderplatz", lat: 52.5219, lng: 13.4132 },
      { name: "TV Tower (Fernsehturm)", lat: 52.5208, lng: 13.4094 },
      { name: "East Side Gallery", lat: 52.5050, lng: 13.4397 },
      { name: "Potsdamer Platz", lat: 52.5096, lng: 13.3759 },
      { name: "Tiergarten", lat: 52.5145, lng: 13.3501 },
      { name: "Kaiser Wilhelm Memorial Church", lat: 52.5048, lng: 13.3350 }
    ]
  },
  brussels: {
    displayName: "Brussels",
    pois: [
      { name: "Grand Place", lat: 50.8467, lng: 4.3524 },
      { name: "Town Hall", lat: 50.8466, lng: 4.3522 },
      { name: "Manneken Pis", lat: 50.8450, lng: 4.3499 },
      { name: "Mont des Arts", lat: 50.8442, lng: 4.3567 },
      { name: "Royal Palace of Brussels", lat: 50.8417, lng: 4.3621 },
      { name: "Brussels Park", lat: 50.8447, lng: 4.3644 },
      { name: "Saint-Michel Cathedral", lat: 50.8479, lng: 4.3592 },
      { name: "Place Royale", lat: 50.8423, lng: 4.3597 },
      { name: "Palais de Justice", lat: 50.8388, lng: 4.3517 },
      { name: "Atomium", lat: 50.8949, lng: 4.3415 },
      { name: "Parc du Cinquantenaire", lat: 50.8407, lng: 4.3934 },
      { name: "European Parliament", lat: 50.8385, lng: 4.3768 }
    ]
  },
  madrid: {
    displayName: "Madrid",
    pois: [
      { name: "Puerta del Sol", lat: 40.4168, lng: -3.7038 },
      { name: "Plaza Mayor", lat: 40.4154, lng: -3.7074 },
      { name: "Mercado de San Miguel", lat: 40.4155, lng: -3.7090 },
      { name: "Royal Palace of Madrid", lat: 40.4180, lng: -3.7144 },
      { name: "Almudena Cathedral", lat: 40.4155, lng: -3.7153 },
      { name: "Temple of Debod", lat: 40.4241, lng: -3.7177 },
      { name: "Gran Vía", lat: 40.4196, lng: -3.7051 },
      { name: "Cibeles Fountain", lat: 40.4193, lng: -3.6931 },
      { name: "Puerta de Alcalá", lat: 40.4203, lng: -3.6888 },
      { name: "Retiro Park", lat: 40.4153, lng: -3.6839 },
      { name: "Prado Museum", lat: 40.4138, lng: -3.6921 },
      { name: "Reina Sofía Museum", lat: 40.4079, lng: -3.6946 }
    ]
  },
  lisbon: {
    displayName: "Lisbon",
    pois: [
      { name: "Praça do Comércio", lat: 38.7075, lng: -9.1364 },
      { name: "Lisbon Cathedral", lat: 38.7099, lng: -9.1326 },
      { name: "São Jorge Castle", lat: 38.7139, lng: -9.1335 },
      { name: "Alfama District", lat: 38.7112, lng: -9.1292 },
      { name: "Santa Justa Lift", lat: 38.7121, lng: -9.1394 },
      { name: "Rossio Square", lat: 38.7138, lng: -9.1394 },
      { name: "Bairro Alto", lat: 38.7118, lng: -9.1437 },
      { name: "Jerónimos Monastery", lat: 38.6979, lng: -9.2067 },
      { name: "Padrão dos Descobrimentos", lat: 38.6936, lng: -9.2057 },
      { name: "Belém Tower", lat: 38.6916, lng: -9.2160 },
      { name: "Oceanário de Lisboa", lat: 38.7635, lng: -9.0937 },
      { name: "LX Factory", lat: 38.7032, lng: -9.1788 }
    ]
  },
  prague: {
    displayName: "Prague",
    pois: [
      { name: "Old Town Square", lat: 50.0875, lng: 14.4211 },
      { name: "Astronomical Clock", lat: 50.0870, lng: 14.4208 },
      { name: "Charles Bridge", lat: 50.0865, lng: 14.4114 },
      { name: "Prague Castle", lat: 50.0909, lng: 14.4005 },
      { name: "St. Vitus Cathedral", lat: 50.0909, lng: 14.4005 },
      { name: "Lennon Wall", lat: 50.0863, lng: 14.4071 },
      { name: "Jewish Quarter", lat: 50.0894, lng: 14.4183 },
      { name: "Wenceslas Square", lat: 50.0811, lng: 14.4278 },
      { name: "Dancing House", lat: 50.0754, lng: 14.4141 },
      { name: "Petrin Lookout Tower", lat: 50.0835, lng: 14.3951 },
      { name: "National Museum", lat: 50.0792, lng: 14.4306 },
      { name: "Vyšehrad", lat: 50.0644, lng: 14.4191 }
    ]
  },
  ghent: {
    displayName: "Ghent",
    pois: [
      { name: "Graslei", lat: 51.0541, lng: 3.7174 },
      { name: "Korenlei", lat: 51.0545, lng: 3.7166 },
      { name: "Gravensteen", lat: 51.0565, lng: 3.7202 },
      { name: "Sint-Baafskathedraal", lat: 51.0534, lng: 3.7262 },
      { name: "Belfort van Gent", lat: 51.0543, lng: 3.7244 },
      { name: "Sint-Niklaaskerk", lat: 51.0549, lng: 3.7240 },
      { name: "Vrijdagmarkt", lat: 51.0566, lng: 3.7220 },
      { name: "Patershol", lat: 51.0570, lng: 3.7180 },
      { name: "Museum voor Schone Kunsten", lat: 51.0393, lng: 3.7204 },
      { name: "Stadsmuseum Gent", lat: 51.0552, lng: 3.7214 }
    ]
  },
  bruges: {
    displayName: "Bruges",
    pois: [
      { name: "Markt", lat: 51.2087, lng: 3.2244 },
      { name: "Belfort van Brugge", lat: 51.2082, lng: 3.2255 },
      { name: "Basiliek van het Heilig Bloed", lat: 51.2085, lng: 3.2263 },
      { name: "Onze-Lieve-Vrouwekerk", lat: 51.2043, lng: 3.2240 },
      { name: "Begijnhof", lat: 51.2024, lng: 3.2233 },
      { name: "Minnewater", lat: 51.2008, lng: 3.2258 },
      { name: "Groeningemuseum", lat: 51.2067, lng: 3.2281 },
      { name: "Choco-Story", lat: 51.2080, lng: 3.2266 },
      { name: "Canal Tour", lat: 51.2070, lng: 3.2250 },
      { name: "Rozenhoedkaai", lat: 51.2074, lng: 3.2214 }
    ]
  },
  liege: {
    displayName: "Liège",
    pois: [
      { name: "Place du Marché", lat: 50.6444, lng: 5.5753 },
      { name: "Palais des Princes-Évêques", lat: 50.6450, lng: 5.5740 },
      { name: "Cathédrale Saint-Paul", lat: 50.6411, lng: 5.5750 },
      { name: "Montagne de Bueren", lat: 50.6465, lng: 5.5712 },
      { name: "Gare Liège-Guillemins", lat: 50.6243, lng: 5.5742 },
      { name: "Aquarium-Muséum", lat: 50.6185, lng: 5.5812 },
      { name: "Coteaux de la Citadelle", lat: 50.6470, lng: 5.5730 },
      { name: "Opéra Royal de Wallonie", lat: 50.6435, lng: 5.5758 },
      { name: "Fragnée Bridge", lat: 50.6250, lng: 5.5710 },
      { name: "Grand Curtius Museum", lat: 50.6485, lng: 5.5801 }
    ]
  },
  namur: {
    displayName: "Namur",
    pois: [
      { name: "Citadelle de Namur", lat: 50.4594, lng: 4.8636 },
      { name: "Place de l'Ange", lat: 50.4650, lng: 4.8670 },
      { name: "Cathédrale Saint-Aubain", lat: 50.4665, lng: 4.8665 },
      { name: "Terra Nova", lat: 50.4590, lng: 4.8645 },
      { name: "Pont de Jambes", lat: 50.4570, lng: 4.8720 },
      { name: "Felix Roulin Museum", lat: 50.4655, lng: 4.8680 },
      { name: "Sambre et Meuse Confluence", lat: 50.4580, lng: 4.8690 },
      { name: "Grognon", lat: 50.4585, lng: 4.8685 },
      { name: "Église Saint-Loup", lat: 50.4670, lng: 4.8650 },
      { name: "Confluence Park", lat: 50.4575, lng: 4.8695 }
    ]
  },
  vienna: {
    displayName: "Vienna",
    pois: [
      { name: "Schönbrunn Palace", lat: 48.1847, lng: 16.3122 },
      { name: "Stephansdom", lat: 48.2085, lng: 16.3731 },
      { name: "Hofburg Palace", lat: 48.2068, lng: 16.3670 },
      { name: "Belvedere Palace", lat: 48.1916, lng: 16.3807 },
      { name: "Prater", lat: 48.2167, lng: 16.3958 },
      { name: "Naschmarkt", lat: 48.1994, lng: 16.3653 },
      { name: "Museum Quarter", lat: 48.2037, lng: 16.3641 },
      { name: "St. Charles Church", lat: 48.1986, lng: 16.3717 },
      { name: "Ringstrasse", lat: 48.2067, lng: 16.3667 },
      { name: "Spanish Riding School", lat: 48.2075, lng: 16.3680 },
      { name: "Albertina", lat: 48.2048, lng: 16.3705 },
      { name: "Vienna State Opera", lat: 48.2033, lng: 16.3697 }
    ]
  },
  milan: {
    displayName: "Milano",
    pois: [
      { name: "Duomo di Milano", lat: 45.4641, lng: 9.1919 },
      { name: "Galleria Vittorio Emanuele II", lat: 45.4659, lng: 9.1899 },
      { name: "Teatro alla Scala", lat: 45.4675, lng: 9.1895 },
      { name: "Castello Sforzesco", lat: 45.4704, lng: 9.1793 },
      { name: "Santa Maria delle Grazie", lat: 45.4659, lng: 9.1703 },
      { name: "Navigli", lat: 45.4517, lng: 9.1777 },
      { name: "Brera District", lat: 45.4718, lng: 9.1885 },
      { name: "Pinacoteca di Brera", lat: 45.4720, lng: 9.1880 },
      { name: "Quadrilatero della Moda", lat: 45.4685, lng: 9.1970 },
      { name: "Parco Sempione", lat: 45.4730, lng: 9.1753 },
      { name: "Cimitero Monumentale", lat: 45.4862, lng: 9.1755 },
      { name: "Porta Nuova", lat: 45.4835, lng: 9.1902 }
    ]
  },
  florence: {
    displayName: "Firenze",
    pois: [
      { name: "Duomo di Firenze", lat: 43.7731, lng: 11.2560 },
      { name: "Galleria degli Uffizi", lat: 43.7676, lng: 11.2553 },
      { name: "Ponte Vecchio", lat: 43.7680, lng: 11.2532 },
      { name: "Piazza della Signoria", lat: 43.7696, lng: 11.2558 },
      { name: "Basilica di Santa Croce", lat: 43.7685, lng: 11.2625 },
      { name: "Piazzale Michelangelo", lat: 43.7629, lng: 11.2653 },
      { name: "Palazzo Pitti", lat: 43.7650, lng: 11.2502 },
      { name: "Boboli Gardens", lat: 43.7645, lng: 11.2495 },
      { name: "Basilica di San Lorenzo", lat: 43.7750, lng: 11.2540 },
      { name: "Bargello Museum", lat: 43.7702, lng: 11.2578 },
      { name: "Mercato Centrale", lat: 43.7762, lng: 11.2535 },
      { name: "Cattedrale di Santa Maria del Fiore", lat: 43.7731, lng: 11.2560 }
    ]
  },
  venice: {
    displayName: "Venezia",
    pois: [
      { name: "Piazza San Marco", lat: 45.4342, lng: 12.3386 },
      { name: "Basilica di San Marco", lat: 45.4345, lng: 12.3396 },
      { name: "Palazzo Ducale", lat: 45.4339, lng: 12.3404 },
      { name: "Ponte di Rialto", lat: 45.4378, lng: 12.3359 },
      { name: "Grand Canal", lat: 45.4408, lng: 12.3260 },
      { name: "Murano", lat: 45.4578, lng: 12.3565 },
      { name: "Burano", lat: 45.4853, lng: 12.4170 },
      { name: "Peggy Guggenheim Collection", lat: 45.4310, lng: 12.3290 },
      { name: "Gallerie dell'Accademia", lat: 45.4313, lng: 12.3285 },
      { name: "Campanile di San Marco", lat: 45.4340, lng: 12.3393 },
      { name: "Ponte dei Sospiri", lat: 45.4339, lng: 12.3406 },
      { name: "Teatro La Fenice", lat: 45.4335, lng: 12.3337 }
    ]
  },
  dublin: {
    displayName: "Dublin",
    pois: [
      { name: "Trinity College", lat: 53.3438, lng: -6.2546 },
      { name: "Temple Bar", lat: 53.3454, lng: -6.2627 },
      { name: "Guinness Storehouse", lat: 53.3419, lng: -6.2868 },
      { name: "Dublin Castle", lat: 53.3429, lng: -6.2674 },
      { name: "St. Patrick's Cathedral", lat: 53.3395, lng: -6.2711 },
      { name: "Kilmainham Gaol", lat: 53.3422, lng: -6.3098 },
      { name: "Phoenix Park", lat: 53.3562, lng: -6.3292 },
      { name: "National Gallery", lat: 53.3412, lng: -6.2526 },
      { name: "Ha'penny Bridge", lat: 53.3462, lng: -6.2637 },
      { name: "Grafton Street", lat: 53.3432, lng: -6.2607 },
      { name: "Christ Church Cathedral", lat: 53.3434, lng: -6.2711 },
      { name: "Irish Museum of Modern Art", lat: 53.3418, lng: -6.3012 }
    ]
  },
  edinburgh: {
    displayName: "Edinburgh",
    pois: [
      { name: "Edinburgh Castle", lat: 55.9486, lng: -3.1999 },
      { name: "Royal Mile", lat: 55.9496, lng: -3.1884 },
      { name: "Arthur's Seat", lat: 55.9444, lng: -3.1615 },
      { name: "National Museum of Scotland", lat: 55.9470, lng: -3.1905 },
      { name: "Scott Monument", lat: 55.9524, lng: -3.1933 },
      { name: "Palace of Holyroodhouse", lat: 55.9530, lng: -3.1725 },
      { name: "Calton Hill", lat: 55.9553, lng: -3.1828 },
      { name: "Princes Street Gardens", lat: 55.9518, lng: -3.1955 },
      { name: "Scottish National Gallery", lat: 55.9507, lng: -3.1962 },
      { name: "The Real Mary King's Close", lat: 55.9502, lng: -3.1902 },
      { name: "Camera Obscura", lat: 55.9487, lng: -3.1965 },
      { name: "Grassmarket", lat: 55.9465, lng: -3.1995 }
    ]
  },
  lyon: {
    displayName: "Lyon",
    pois: [
      { name: "Basilique Notre-Dame de Fourvière", lat: 45.7622, lng: 4.8226 },
      { name: "Vieux Lyon", lat: 45.7603, lng: 4.8280 },
      { name: "Place Bellecour", lat: 45.7567, lng: 4.8324 },
      { name: "Confluence Museum", lat: 45.7479, lng: 4.8174 },
      { name: "Parc de la Tête d'Or", lat: 45.7769, lng: 4.8548 },
      { name: "Musée des Confluences", lat: 45.7326, lng: 4.8174 },
      { name: "Croix-Rousse", lat: 45.7720, lng: 4.8320 },
      { name: "Théâtres Romains", lat: 45.7595, lng: 4.8198 },
      { name: "Traboules", lat: 45.7625, lng: 4.8285 },
      { name: "Halles de Lyon", lat: 45.7558, lng: 4.8380 },
      { name: "Musée des Beaux-Arts", lat: 45.7597, lng: 4.8335 },
      { name: "Lumière Institute", lat: 45.7480, lng: 4.8610 }
    ]
  },
  nice: {
    displayName: "Nice",
    pois: [
      { name: "Promenade des Anglais", lat: 43.6952, lng: 7.2643 },
      { name: "Vieux Nice", lat: 43.6952, lng: 7.2770 },
      { name: "Colline du Château", lat: 43.6955, lng: 7.2775 },
      { name: "Marché aux Fleurs", lat: 43.6958, lng: 7.2760 },
      { name: "Musée Matisse", lat: 43.7183, lng: 7.2588 },
      { name: "Cimiez Monastery", lat: 43.7190, lng: 7.2600 },
      { name: "Place Masséna", lat: 43.6956, lng: 7.2733 },
      { name: "MAMAC", lat: 43.6960, lng: 7.2785 },
      { name: "Villa Ephrussi", lat: 43.6958, lng: 7.3292 },
      { name: "Monaco", lat: 43.7384, lng: 7.4246 },
      { name: "Cap Ferrat", lat: 43.6875, lng: 7.3333 },
      { name: "Russian Cathedral", lat: 43.7100, lng: 7.2640 }
    ]
  },
  munich: {
    displayName: "Monaco di Baviera",
    pois: [
      { name: "Marienplatz", lat: 48.1374, lng: 11.5755 },
      { name: "Neues Rathaus", lat: 48.1374, lng: 11.5762 },
      { name: "Frauenkirche", lat: 48.1385, lng: 11.5735 },
      { name: "English Garden", lat: 48.1607, lng: 11.6158 },
      { name: "Residenz", lat: 48.1414, lng: 11.5780 },
      { name: "Nymphenburg Palace", lat: 48.1585, lng: 11.5037 },
      { name: "Viktualienmarkt", lat: 48.1355, lng: 11.5810 },
      { name: "BMW Museum", lat: 48.1773, lng: 11.5560 },
      { name: "Deutsches Museum", lat: 48.1299, lng: 11.5832 },
      { name: "Odeonsplatz", lat: 48.1425, lng: 11.5768 },
      { name: "Hofbräuhaus", lat: 48.1376, lng: 11.5817 },
      { name: "Olympiapark", lat: 48.1758, lng: 11.5495 }
    ]
  },
  zurich: {
    displayName: "Zurigo",
    pois: [
      { name: "Bahnhofstrasse", lat: 47.3769, lng: 8.5417 },
      { name: "Grossmünster", lat: 47.3695, lng: 8.5442 },
      { name: "Fraumünster", lat: 47.3696, lng: 8.5411 },
      { name: "Lindenhof", lat: 47.3724, lng: 8.5412 },
      { name: "Lake Zurich", lat: 47.3564, lng: 8.5418 },
      { name: "Kunsthaus Zürich", lat: 47.3693, lng: 8.5489 },
      { name: "Swiss National Museum", lat: 47.3783, lng: 8.5399 },
      { name: "Old Town", lat: 47.3720, lng: 8.5410 },
      { name: "Uetliberg", lat: 47.3511, lng: 8.4911 },
      { name: "Rietberg Museum", lat: 47.3555, lng: 8.5011 },
      { name: "Josefswiese", lat: 47.3720, lng: 8.5280 },
      { name: "Paradeplatz", lat: 47.3665, lng: 8.5385 }
    ]
  }
};

// Stato Applicazione
let map;
let directionsService;
let directionsRenderer;
let markers = [];
let userMarker = null;
let userPosition = null;
let allStops = [];
let stops = [];
let currentDay = 1;
let currentLegIndex = 0;
let watchId = null;
let simulationInterval = null;
let simIndex = 0;
let currentStep = 1;

// Inizializzazione Google Maps (callback globale)
window.initMap = function() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  try {
    map = new google.maps.Map(mapElement, {
      zoom: 14,
      center: { lat: 41.8902, lng: 12.4922 },
      disableDefaultUI: false,
      styles: [
        { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{"color": "#334155"}] },
        { "featureType": "landscape", "elementType": "all", "stylers": [{"color": "#f1f5f9"}] }
      ]
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#6366f1", strokeWeight: 6, strokeOpacity: 0.8 }
    });
    userMarker = new google.maps.Marker({
      map: map,
      visible: false,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeWeight: 3,
        strokeColor: "#fff",
        scale: 10
      },
      zIndex: 1000
    });
    console.log("Maps API caricata correttamente.");
  } catch (e) {
    console.error("Errore inizializzazione Maps:", e);
    document.getElementById("tracking-status").textContent = "Errore: Google Maps non caricato. Controlla la connessione o l'API Key.";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const mainEl = document.querySelector(".main");
  const heroEl = document.querySelector(".hero");
  const enterAppBtn = document.getElementById("enter-app");
  const stepPills = document.querySelectorAll(".step-pill");

  const cityInput = document.getElementById("city-input");
  const daysInput = document.getElementById("days-input");
  const btnGenerate = document.getElementById("generate-city-itinerary");
  const stopsList = document.getElementById("stops-list");
  const daysTabsContainer = document.getElementById("days-tabs");
  const btnStart = document.getElementById("start-tracking");
  const btnStop = document.getElementById("stop-tracking");
  const trackingStatus = document.getElementById("tracking-status");

  if (enterAppBtn && mainEl && heroEl) {
    enterAppBtn.addEventListener("click", () => {
      mainEl.classList.remove("is-hidden");
      heroEl.classList.add("hero-compact");
      mainEl.scrollIntoView({ behavior: "smooth" });
      currentStep = 1;
      updateStepUI();
    });
  }

  function updateStepUI() {
    stepPills.forEach(pill => {
      const step = Number(pill.dataset.step || "1");
      pill.classList.toggle("step-pill-active", step === currentStep);
    });
  }

  stepPills.forEach(pill => {
    pill.addEventListener("click", () => {
      const step = Number(pill.dataset.step || "1");
      currentStep = step;
      updateStepUI();
      if (step === 1 && document.querySelector(".planner-section")) {
        document.querySelector(".planner-section").scrollIntoView({ behavior: "smooth" });
      } else if (step === 2 && document.querySelector(".navigator-section")) {
        document.querySelector(".navigator-section").scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  // Controllo iniziale se l'API è caricata (nel caso defer fallisca o sia lenta)
  if (typeof google === "undefined" || !google.maps) {
    trackingStatus.textContent = "Attivazione navigatore in corso...";
    setTimeout(() => {
        if (typeof google === "undefined") {
            trackingStatus.textContent = "Errore: Servizi Google non disponibili. Controlla l'API Key nel file index.html.";
            trackingStatus.className = "status-banner status-neutral";
        }
    }, 3000);
  }

  function doGenerateItinerary(userLat, userLng) {
    const rawInput = cityInput.value.trim();
    const cityParts = rawInput.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    
    let pois = [];
    const foundCities = [];
    
    for (const part of cityParts) {
      const cityKey = resolveCityKey(part);
      if (cityKey && CITY_TEMPLATES[cityKey]) {
        const template = CITY_TEMPLATES[cityKey];
        pois = pois.concat(template.pois.map(p => ({
          ...p,
          cityName: template.displayName
        })));
        foundCities.push(template.displayName);
      }
    }
    
    if (pois.length === 0) {
      trackingStatus.textContent = "Città non trovata. Inserisci una città valida (es: Roma, Anversa, Leuven, Brussels).";
      trackingStatus.className = "status-banner status-neutral";
      return;
    }

    if (userLat != null && userLng != null) {
      pois = optimizeRouteFromPosition(pois, userLat, userLng);
    }

    const numDays = parseInt(daysInput.value);
    allStops = [];
    const perDay = Math.ceil(pois.length / numDays);
    
    for (let i = 0; i < numDays; i++) {
      allStops.push(pois.slice(i * perDay, (i + 1) * perDay));
    }

    currentDay = 1;
    renderTabs(numDays);
    loadDay(1);
    
    const citiesLabel = foundCities.join(", ");
    trackingStatus.textContent = pois.length > 0 ? `Itinerario per ${citiesLabel} pronto!` : "Nessun itinerario generato.";
    trackingStatus.className = "status-banner status-active";
  }

  btnGenerate.addEventListener("click", () => {
    if (!navigator.geolocation) {
      doGenerateItinerary(null, null);
      return;
    }
    trackingStatus.textContent = "Rilevamento posizione in corso...";
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        userPosition = { lat, lng };
        if (userMarker) {
          userMarker.setPosition({ lat, lng });
          userMarker.setVisible(true);
        }
        doGenerateItinerary(lat, lng);
      },
      () => doGenerateItinerary(null, null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  const btnRecalcFromPosition = document.getElementById("recalc-from-position");
  if (btnRecalcFromPosition) {
    btnRecalcFromPosition.addEventListener("click", () => {
      const flatStops = allStops.flat();
      if (flatStops.length === 0) return;
      if (!navigator.geolocation) return alert("GPS non supportato.");
      trackingStatus.textContent = "Ricalcolo da tua posizione...";
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          userPosition = { lat, lng };
          if (userMarker) {
            userMarker.setPosition({ lat, lng });
            userMarker.setVisible(true);
          }
          const optimized = optimizeRouteFromPosition(flatStops, lat, lng);
          const numDays = allStops.length;
          allStops = [];
          const perDay = Math.ceil(optimized.length / numDays);
          for (let i = 0; i < numDays; i++) {
            allStops.push(optimized.slice(i * perDay, (i + 1) * perDay));
          }
          loadDay(1);
          trackingStatus.textContent = "Itinerario riordinato dalla tua posizione!";
          trackingStatus.className = "status-banner status-active";
        },
        () => alert("Impossibile ottenere la posizione.")
      );
    });
  }

  function renderTabs(n) {
    daysTabsContainer.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const btn = document.createElement("button");
      btn.className = `day-tab ${i === 1 ? 'active' : ''}`;
      btn.innerHTML = `<span>Giorno</span> <strong>${i}</strong>`;
      btn.onclick = () => {
        document.querySelectorAll(".day-tab").forEach(t => t.classList.remove("active"));
        btn.classList.add("active");
        loadDay(i);
      };
      daysTabsContainer.appendChild(btn);
    }
  }

  function loadDay(day) {
    currentDay = day;
    stops = (allStops[day - 1] || []).map(s => ({ ...s, reached: false }));
    currentLegIndex = 0;
    
    document.getElementById("distance-to-next").textContent = "--";
    document.getElementById("current-leg").textContent = stops.length > 0 ? stops[0].name : "--";
    
    renderStopsList();
    calculateAndDisplayRoute();
  }

  function renderStopsList() {
    stopsList.innerHTML = stops.map((s, i) => `
      <li class="stop-item ${s.reached ? 'reached' : ''} ${i === currentLegIndex ? 'current' : ''}">
        <div class="stop-info">
          <span class="stop-number">${i + 1}</span>
          <div>
            <span class="stop-name">${s.name}</span>
            ${s.durationToNext ? `<span class="stop-duration">→ ~${s.durationToNext}</span>` : ''}
          </div>
        </div>
        <span class="stop-status">${s.reached ? '✅' : '⏳'}</span>
      </li>
    `).join("");
    
    btnStart.disabled = stops.length < 1;
    const flatCount = allStops.flat().length;
    if (document.getElementById("play-simulation")) {
      document.getElementById("play-simulation").disabled = flatCount < 1;
    }
    const btnRecalc = document.getElementById("recalc-from-position");
    if (btnRecalc) btnRecalc.disabled = flatCount < 1;
  }

  function calculateAndDisplayRoute() {
    if (typeof google === "undefined" || !directionsService || stops.length < 1) return;

    if (stops.length === 1) {
      stops[0].durationToNext = null;
      directionsRenderer.setDirections({ routes: [] });
      updateMarkers();
      return;
    }

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
    const waypoints = stops.slice(1, -1).map(s => ({ location: { lat: s.lat, lng: s.lng }, stopover: true }));

    directionsService.route({
      origin: origin,
      destination: destination,
      waypoints: waypoints,
      travelMode: google.maps.TravelMode.WALKING
    }, (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        const legs = result.routes?.[0]?.legs || [];
        for (let i = 0; i < stops.length; i++) {
          stops[i].durationToNext = i < legs.length && legs[i].duration ? legs[i].duration.text : null;
        }
        renderStopsList();
        updateMarkers();
      }
    });
  }

  function updateMarkers() {
    markers.forEach(m => {
      google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    markers = stops.map((s, i) => new google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: map,
        label: { text: (i + 1).toString(), color: "white", fontWeight: "bold" },
        title: s.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: s.reached ? "#10b981" : (i === currentLegIndex ? "#6366f1" : "#94a3b8"),
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "white",
          scale: 14
        }
      }));

    const bounds = new google.maps.LatLngBounds();
    stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds);
  }

  function updateMarkersForSimulation(flatStops, currentIdx, onMarkerClick) {
    markers.forEach(m => {
      google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    markers = flatStops.map((s, i) => {
      const m = new google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: map,
        label: { text: (i + 1).toString(), color: "white", fontWeight: "bold" },
        title: `${i + 1}. ${s.name} — Clicca per vedere`,
        cursor: "pointer",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: i === currentIdx ? "#6366f1" : "#94a3b8",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "white",
          scale: 16
        }
      });
      m.addListener("click", () => onMarkerClick(i));
      return m;
    });
    const bounds = new google.maps.LatLngBounds();
    flatStops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds);
  }

  function highlightSimulationMarker(flatStops, currentIdx) {
    markers.forEach((m, i) => {
      m.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: i === currentIdx ? "#6366f1" : "#94a3b8",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "white",
        scale: 16
      });
    });
  }

  btnStart.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("GPS non supportato.");
    if (typeof google === "undefined") return alert("Servizi Google non caricati.");

    trackingStatus.textContent = "Navigazione attiva...";
    trackingStatus.className = "status-banner status-active";
    btnStart.disabled = true;
    btnStop.disabled = false;

    watchId = navigator.geolocation.watchPosition(pos => {
      const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      userPosition = userPos;
      if (userMarker) {
        userMarker.setPosition(userPos);
        userMarker.setVisible(true);
      }
      map.panTo(userPos);
      
      if (currentLegIndex < stops.length) {
        const target = stops[currentLegIndex];
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(userPos.lat, userPos.lng),
          new google.maps.LatLng(target.lat, target.lng)
        );

        document.getElementById("distance-to-next").textContent = `${Math.round(distance)} m`;
        document.getElementById("current-leg").textContent = target.name;

        if (distance < DISTANCE_THRESHOLD_METERS) {
          stops[currentLegIndex].reached = true;
          currentLegIndex++;
          renderStopsList();
          updateMarkers();
          
          if (currentLegIndex >= stops.length) {
            trackingStatus.textContent = "Itinerario completato! 🎉";
            trackingStatus.className = "status-banner status-done";
            if (watchId) navigator.geolocation.clearWatch(watchId);
            btnStop.disabled = true;
          }
        }
      }
    }, (err) => {
      console.error("GPS Error:", err);
      trackingStatus.textContent = "Errore GPS. Controlla i permessi.";
    }, { enableHighAccuracy: true, timeout: 5000 });
  });

  btnStop.addEventListener("click", () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (userMarker) userMarker.setVisible(false);
    trackingStatus.textContent = "Navigazione sospesa.";
    trackingStatus.className = "status-banner status-neutral";
    btnStart.disabled = false;
    btnStop.disabled = true;
  });

  const btnShowLocation = document.getElementById("show-my-location");
  if (btnShowLocation) {
    btnShowLocation.addEventListener("click", () => {
      if (!navigator.geolocation) return alert("GPS non supportato.");
      navigator.geolocation.getCurrentPosition(
        pos => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          userPosition = p;
          if (userMarker) {
            userMarker.setPosition(p);
            userMarker.setVisible(true);
          }
          map.panTo(p);
          map.setZoom(16);
        },
        err => alert("Impossibile ottenere la posizione."),
        { enableHighAccuracy: true }
      );
    });
  }

  // === ANTEPRIMA PERCORSO (PLAY) ===
  const btnPlay = document.getElementById("play-simulation");
  const overlay = document.getElementById("simulation-overlay");
  const simPhoto = document.getElementById("simulation-photo-img");
  const simPoiName = document.getElementById("simulation-poi-name");
  const simPoiCity = document.getElementById("simulation-poi-city");
  const simCurrent = document.getElementById("sim-current");
  const simTotal = document.getElementById("sim-total");
  const btnSimPrev = document.getElementById("sim-prev");
  const btnSimPause = document.getElementById("sim-pause");
  const btnSimNext = document.getElementById("sim-next");
  const btnSimClose = document.getElementById("sim-close");

  function stopSimulation() {
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
    overlay.classList.add("hidden");
    btnSimPause.textContent = "⏸ Pausa";
    loadDay(currentDay);
  }

  async function updateSimulationUI(index, flatStops) {
    const s = flatStops[index];
    if (!s) return;
    simIndex = index;
    highlightSimulationMarker(flatStops, index);

    if (simPhoto) {
      simPhoto.style.opacity = "0.5";
      simPhoto.src = "";
      simPhoto.alt = s.name;
      const realUrl = await getRealPhotoUrl(s.name, s.cityName || "");
      if (flatStops[index] === s) simPhoto.src = realUrl;
      simPhoto.style.opacity = "1";
    }
    simPoiName.textContent = s.name;
    simPoiCity.textContent = s.cityName ? `📍 ${s.cityName}` : "";
    simCurrent.textContent = index + 1;
    simTotal.textContent = flatStops.length;

    // Pan mappa e mostra percorso fino a questa tappa
    const stopsSoFar = flatStops.slice(0, index + 1);
    map.panTo({ lat: s.lat, lng: s.lng });
    map.setZoom(15);

    if (typeof google !== "undefined" && directionsService && stopsSoFar.length >= 2) {
      const origin = { lat: stopsSoFar[0].lat, lng: stopsSoFar[0].lng };
      const dest = { lat: stopsSoFar[stopsSoFar.length - 1].lat, lng: stopsSoFar[stopsSoFar.length - 1].lng };
      const waypoints = stopsSoFar.slice(1, -1).map(st => ({ location: { lat: st.lat, lng: st.lng }, stopover: true }));
      directionsService.route({
        origin,
        destination: dest,
        waypoints,
        travelMode: google.maps.TravelMode.WALKING
      }, (result, status) => {
        if (status === "OK") directionsRenderer.setDirections(result);
      });
    }
  }

  btnPlay.addEventListener("click", () => {
    const flatStops = allStops.flat();
    if (flatStops.length === 0) return;

    simIndex = 0;
    updateMarkersForSimulation(flatStops, 0, (i) => {
      updateSimulationUI(i, flatStops);
    });
    overlay.classList.remove("hidden");
    simTotal.textContent = flatStops.length;
    updateSimulationUI(0, flatStops);

    if (simulationInterval) clearInterval(simulationInterval);
    simulationInterval = setInterval(() => {
      simIndex = (simIndex + 1) % flatStops.length;
      updateSimulationUI(simIndex, flatStops);
      if (simIndex === flatStops.length - 1) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        btnSimPause.textContent = "⏸ Fine";
      }
    }, 3500);
  });

  btnSimPrev.addEventListener("click", () => {
    const flatStops = allStops.flat();
    simIndex = Math.max(0, simIndex - 1);
    updateSimulationUI(simIndex, flatStops);
  });

  btnSimNext.addEventListener("click", () => {
    const flatStops = allStops.flat();
    simIndex = Math.min(flatStops.length - 1, simIndex + 1);
    updateSimulationUI(simIndex, flatStops);
  });

  btnSimPause.addEventListener("click", () => {
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
      btnSimPause.textContent = "▶ Riprendi";
    } else {
      const flatStops = allStops.flat();
      simulationInterval = setInterval(() => {
        simIndex = (simIndex + 1) % flatStops.length;
        updateSimulationUI(simIndex, flatStops);
      }, 3500);
      btnSimPause.textContent = "⏸ Pausa";
    }
  });

  btnSimClose.addEventListener("click", stopSimulation);

});
