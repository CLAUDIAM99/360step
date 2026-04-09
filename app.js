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

// Catalogo città: breve descrizione e cosa vedere (mostrato dopo la ricerca)
const CITY_CATALOG = {
  rome: {
    description: "Capitale eterna, tra antichità romana e barocco. Storia, arte e vita da dolce vita.",
    highlights: ["Colosseo e Foro Romano", "Vaticano e Basilica di San Pietro", "Fontana di Trevi e Piazza di Spagna", "Pantheon e Piazza Navona", "Trastevere e quartieri"]
  },
  paris: {
    description: "Città della luce: arte, moda e monumenti iconici. Romantica e sempre in movimento.",
    highlights: ["Tour Eiffel e Champ de Mars", "Louvre e Tuileries", "Notre-Dame e Île de la Cité", "Sacré-Cœur e Montmartre", "Champs-Élysées e Arco di Trionfo"]
  },
  london: {
    description: "Metropoli tra tradizione e avanguardia. Musei gratuiti, parchi e quartieri vivaci.",
    highlights: ["Big Ben e Westminster", "British Museum e National Gallery", "Tower Bridge e Tower of London", "Buckingham Palace", "Camden e Covent Garden"]
  },
  leuven: {
    description: "Città universitaria belga, birra e architettura gotica. Compatta e accogliente.",
    highlights: ["Grote Markt e Stadhuis", "Sint-Pieterskerk", "KU Leuven e biblioteca", "Stella Artois Brouwerij", "Park Abbey"]
  },
  amsterdam: {
    description: "Canali, biciclette e musei. Libertà e cultura in una città a misura d'uomo.",
    highlights: ["Dam e Palazzo Reale", "Rijksmuseum e Van Gogh", "Anne Frank House", "Jordaan e canali", "Mercato dei fiori"]
  },
  barcelona: {
    description: "Gaudí, mare e tapas. Architettura modernista e vita mediterranea.",
    highlights: ["Sagrada Família", "Park Güell", "Casa Batlló e La Pedrera", "Barri Gòtic e Rambla", "Barceloneta e spiaggia"]
  },
  berlin: {
    description: "Capitale creativa e storica. Musei, street art e memoria del Novecento.",
    highlights: ["Porta di Brandeburgo", "Museumsinsel", "East Side Gallery", "Checkpoint Charlie", "Reichstag e quartieri"]
  },
  brussels: {
    description: "Cuore dell'Europa, cioccolato e birra. Grand Place e Manneken Pis.",
    highlights: ["Grand Place", "Manneken Pis", "Atomium", "Mont des Arts", "Quartieri europei"]
  },
  madrid: {
    description: "Capital española: Prado, tapas e vita notturna. Sole e cultura.",
    highlights: ["Museo del Prado", "Palacio Real", "Puerta del Sol e Gran Vía", "Retiro", "Mercato di San Miguel"]
  },
  lisbon: {
    description: "Sette colline, tram e fado. Atmosfera portoghese e vista sull'oceano.",
    highlights: ["Alfama e castello", "Belém e Mosteiro", "Tram 28", "Baixa e Chiado", "Miradouros"]
  },
  prague: {
    description: "Centro storico UNESCO, birra e architettura gotica e barocca.",
    highlights: ["Ponte Carlo e Castello", "Orologio astronomico", "Piazza della Città Vecchia", "Quartiere ebraico", "Birrerie"]
  },
  mechelen: {
    description: "Piccola città fiamminga tra Bruxelles e Anversa. Campanili e tranquillità.",
    highlights: ["Sint-Romboutskathedraal", "Grote Markt", "Hof van Busleyden", "Begijnhof", "Dijle"]
  },
  antwerp: {
    description: "Porto e diamanti, Rubens e arte. Seconda città del Belgio.",
    highlights: ["Grote Markt e cattedrale", "MAS", "Rubenshuis", "Stazione Centrale", "Meir"]
  },
  ottignies: {
    description: "Porta di Louvain-la-Neuve: campus, lago e natura.",
    highlights: ["Louvain-la-Neuve", "Lac de LLN", "Bois de Lauzelle", "Grand-Place LLN"]
  },
  ghent: {
    description: "Città medievale fiamminga tra canali e torri. Meno turistica, molto autentica.",
    highlights: ["Gravensteen", "Graslei e Korenlei", "Sint-Baafskathedraal", "Belfort", "Patershol"]
  },
  bruges: {
    description: "Venezia del Nord: canali, cioccolato e centro storico UNESCO.",
    highlights: ["Markt e Belfort", "Canali e giri in barca", "Basilica del Sacro Sangue", "Begijnhof", "Cioccolaterie"]
  },
  liege: {
    description: "Città vallone sul fiume Meuse. Montagne de Bueren e vita studentesca.",
    highlights: ["Place du Marché", "Montagne de Bueren", "Gare Guillemins", "Coteaux de la Citadelle"]
  },
  namur: {
    description: "Capitale della Vallonia alla confluenza Sambre e Mosa. Citadella e tranquillità.",
    highlights: ["Citadelle", "Terra Nova", "Pont de Jambes", "Grognon"]
  },
  vienna: {
    description: "Capitale asburgica: musica, caffè e palazzi. Eleganza e cultura.",
    highlights: ["Schönbrunn", "Stephansdom", "Hofburg", "Belvedere", "Caffè storici"]
  },
  milan: {
    description: "Moda, design e Duomo. Metropoli italiana tra business e arte.",
    highlights: ["Duomo e Galleria", "Santa Maria delle Grazie (Cenacolo)", "Castello Sforzesco", "Navigli", "Quadrilatero della moda"]
  },
  florence: {
    description: "Culla del Rinascimento. Uffizi, Duomo e arte a ogni angolo.",
    highlights: ["Uffizi e Ponte Vecchio", "Duomo e Cupola", "Piazza della Signoria", "Piazzale Michelangelo", "San Lorenzo e mercato"]
  },
  venice: {
    description: "Laguna unica al mondo. Canali, palazzi e atmosfera irrepetibile.",
    highlights: ["Piazza San Marco", "Ponte di Rialto", "Canal Grande", "Murano e Burano", "Ponte dei Sospiri"]
  },
  dublin: {
    description: "Capitals irlandese: pub, letteratura e cordialità. Trinity e Guinness.",
    highlights: ["Trinity College", "Guinness Storehouse", "Temple Bar", "Castello e cattedrali", "Phoenix Park"]
  },
  edinburgh: {
    description: "Castello, Royal Mile e festival. Scozia tra storia e natura.",
    highlights: ["Edinburgh Castle", "Royal Mile", "Arthur's Seat", "Palazzo di Holyroodhouse", "Grassmarket"]
  },
  lyon: {
    description: "Capitale della gastronomia e della seta. Tra due colline e due fiumi.",
    highlights: ["Fourvière e basilica", "Vieux Lyon e traboules", "Presqu'île", "Confluence", "Murailles du Croix-Rousse"]
  },
  nice: {
    description: "Côte d'Azur: mare, Promenade des Anglais e luce del sud.",
    highlights: ["Promenade des Anglais", "Vieux Nice", "Colline du Château", "Cimiez", "Mercato dei fiori"]
  },
  munich: {
    description: "Cuore della Baviera: birra, barocco e BMW. Oktoberfest e Residenz.",
    highlights: ["Marienplatz e Neues Rathaus", "Residenz", "Englischer Garten", "BMW Museum", "Viktualienmarkt"]
  },
  zurich: {
    description: "Finanza, lago e qualità della vita. Compatta tra acqua e monti.",
    highlights: ["Bahnhofstrasse", "Grossmünster e Fraumünster", "Lago e Lindenhof", "Kunsthaus", "Altstadt"]
  }
};

// === Preferenze walk (city break / premium UX) ===
const TIME_STOP_CAPS = { "2h": 4, "4h": 6, half: 9, full: 14 };
const PACE_MULT = { relaxed: 0.78, balanced: 1, intense: 1.18 };

const WALK_BEST_TIME = {
  romantic: "Tardo pomeriggio fino al tramonto",
  iconic: "Mattina presto, prima della folla",
  hidden: "Metà mattina o dopo pranzo",
  chill: "Quando preferisci — il ritmo è lento",
  food: "Pranzo leggero o aperitivo"
};

const WALK_WHY_FALLBACK = {
  romantic: "Un angolo dove fermarsi, respirare e godersi la città in due.",
  iconic: "Tra i punti che raccontano meglio questa destinazione.",
  hidden: "Fuori dal solito percorso turistico — più autentico.",
  chill: "Pensato per camminare senza fretta.",
  food: "Legato a gusto, mercati o pause conviviali."
};

const WALK_LABELS = {
  romantic: "Romantic",
  iconic: "Iconic",
  hidden: "Hidden gems",
  chill: "Chill walk",
  food: "Food walk"
};

let lastWalkMeta = {
  walkType: "iconic",
  timeBudget: "half",
  pace: "balanced",
  citiesLabel: ""
};

function readWalkPreferences() {
  const typeEl = document.querySelector('input[name="walk-type"]:checked');
  const timeEl = document.querySelector('input[name="time-budget"]:checked');
  const paceEl = document.querySelector('input[name="pace"]:checked');
  const daysEl = document.getElementById("days-input");
  return {
    walkType: typeEl ? typeEl.value : "iconic",
    timeBudget: timeEl ? timeEl.value : "half",
    pace: paceEl ? paceEl.value : "balanced",
    days: Math.max(1, Math.min(3, parseInt(daysEl && daysEl.value ? daysEl.value : "1", 10) || 1))
  };
}

function applyWalkMood(pois, mood) {
  if (!pois.length) return pois;
  const n = pois.length;
  const copy = [...pois];
  switch (mood) {
    case "romantic":
      return copy.filter((_, i) => i % 2 === 0 || i === n - 1);
    case "hidden":
      return copy.slice(Math.max(0, Math.floor(n * 0.28)));
    case "chill":
      return copy.filter((_, i) => i % 2 === 0);
    case "food": {
      const foodish = copy.filter((p) =>
        /mercat|market|food|tapas|bistr|café|caffe|osteria|trattoria|ristor|wein|bier|chocolat|cioccolat|kulinar|viktualien|san miguel|fondouk/i.test(p.name)
      );
      return foodish.length >= 3 ? foodish : copy.slice(0, Math.min(7, n));
    }
    case "iconic":
    default:
      return copy.slice(0, Math.max(4, Math.ceil(n * 0.72)));
  }
}

function applyTimeAndPaceCap(pois, timeBudget, pace) {
  const base = TIME_STOP_CAPS[timeBudget] != null ? TIME_STOP_CAPS[timeBudget] : 9;
  const mult = PACE_MULT[pace] != null ? PACE_MULT[pace] : 1;
  const cap = Math.max(3, Math.round(base * mult));
  return pois.slice(0, Math.min(cap, pois.length));
}

function enrichStopsWithWhy(stops, mood) {
  const fallback = WALK_WHY_FALLBACK[mood] || WALK_WHY_FALLBACK.iconic;
  return stops.map((s, i) => {
    let why = fallback;
    const catKey = Object.keys(CITY_TEMPLATES).find((k) => CITY_TEMPLATES[k].displayName === s.cityName);
    if (catKey && CITY_CATALOG[catKey] && CITY_CATALOG[catKey].highlights && CITY_CATALOG[catKey].highlights[i % CITY_CATALOG[catKey].highlights.length]) {
      why = `Nel cuore di ${s.cityName}: ${CITY_CATALOG[catKey].highlights[i % CITY_CATALOG[catKey].highlights.length]}.`;
    }
    return { ...s, why };
  });
}

function setGenerationLoading(on) {
  const el = document.getElementById("generation-loading");
  if (el) {
    el.classList.toggle("is-visible", !!on);
    el.setAttribute("aria-busy", on ? "true" : "false");
  }
}

function setWalkViewEnabled(enabled) {
  const navWalk = document.querySelector('.bottom-nav__btn[data-view="walk"]');
  if (navWalk) {
    navWalk.disabled = !enabled;
    navWalk.removeAttribute("aria-disabled");
  }
}

function updateItineraryHeadline(totalMeters, totalSeconds) {
  const root = document.getElementById("itinerary-headline");
  if (!root) return;
  const flat = allStops.length ? allStops.flat() : [];
  const n = flat.length;
  const km = totalMeters > 0 ? (totalMeters / 1000).toFixed(1) : "—";
  const mins = totalSeconds > 0 ? Math.round(totalSeconds / 60) : 0;
  const timeStr = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : mins > 0 ? `${mins} min` : "—";
  const best = WALK_BEST_TIME[lastWalkMeta.walkType] || WALK_BEST_TIME.iconic;
  root.innerHTML = `
    <div class="headline-stat"><span class="headline-stat__val">${n}</span><span class="headline-stat__lbl">tappe</span></div>
    <div class="headline-stat"><span class="headline-stat__val">${km}</span><span class="headline-stat__lbl">km ca.</span></div>
    <div class="headline-stat"><span class="headline-stat__val">${timeStr}</span><span class="headline-stat__lbl">a piedi</span></div>
    <div class="headline-stat headline-stat--wide"><span class="headline-stat__val headline-stat__val--sm">${best}</span><span class="headline-stat__lbl">momento ideale</span></div>
  `;
}

function updateWalkHero() {
  const titleEl = document.getElementById("walk-hero-title");
  const eyebrowEl = document.getElementById("walk-hero-eyebrow");
  const moodEl = document.getElementById("walk-hero-mood");
  const descEl = document.getElementById("walk-hero-desc");
  const walkSubtitle = document.getElementById("walk-subtitle");
  if (!titleEl || !moodEl || !descEl) return;

  const cities = lastWalkMeta.citiesLabel || "Europa";
  const moodLabel = WALK_LABELS[lastWalkMeta.walkType] || "City walk";
  const best = WALK_BEST_TIME[lastWalkMeta.walkType] || WALK_BEST_TIME.iconic;

  const vibe =
    lastWalkMeta.walkType === "romantic"
      ? "Pause lente, punti scenografici e un ritmo che invita a fermarsi."
      : lastWalkMeta.walkType === "hidden"
        ? "Un percorso meno ovvio, per vedere la città con occhi più curiosi."
        : lastWalkMeta.walkType === "food"
          ? "Pensato per alternare cammino e soste: mercati, strade vive, piccoli rituali."
          : lastWalkMeta.walkType === "chill"
            ? "Poche tappe, più respiro: una passeggiata che non stanca."
            : "I classici che valgono: essenziale, pulito, super walkable.";

  if (eyebrowEl) eyebrowEl.textContent = "City walk";
  titleEl.textContent = cities;
  moodEl.textContent = moodLabel;
  descEl.textContent = `${vibe} Ideale: ${best}.`;
  if (walkSubtitle) walkSubtitle.textContent = "Controllo semplice, in strada: mappa + prossima tappa + tappe scansionabili.";
}

function updateNextStopCardFromStops() {
  const titleEl = document.getElementById("current-leg");
  const distEl = document.getElementById("distance-to-next");
  const timeEl = document.getElementById("time-to-next");
  if (titleEl) titleEl.textContent = stops && stops[currentLegIndex] ? stops[currentLegIndex].name : "—";

  const cur = stops && stops[currentLegIndex] ? stops[currentLegIndex] : null;
  if (distEl) distEl.textContent = cur && cur.distanceToNext ? cur.distanceToNext : "—";
  if (timeEl) timeEl.textContent = cur && cur.durationToNext ? cur.durationToNext : "—";
}

function escHtml(text) {
  if (text == null) return "";
  const d = document.createElement("div");
  d.textContent = String(text);
  return d.innerHTML;
}

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
let customStartPoint = null; // { lat, lng, label }

// Leaflet map (mappa alternativa itinerario)
let leafletMap;
let leafletMarkersLayer;
let leafletRouteLine;
let leafletUserMarker = null;

// Stato centralizzato della schermata walk (robusto, map-first)
const navigationState = {
  status: "idle", // idle | ready | preview | navigating | paused
  watchId: null,
  currentLegIndex: 0
};

let itineraryData = null; // { id, name, mood, citiesLabel, stops: [{name,lat,lng,why,...}], createdAt }

// Inizializzazione Google Maps (callback globale) — nessuna geolocalizzazione al caricamento
window.initMap = function() {
  if (window._mapsLoadTimeout) {
    clearTimeout(window._mapsLoadTimeout);
    window._mapsLoadTimeout = null;
  }
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  try {
    map = new google.maps.Map(mapElement, {
      // Mondo intero di default
      zoom: 2,
      center: { lat: 0, lng: 0 },
      disableDefaultUI: false,
      styles: [
        { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{"color": "#334155"}] },
        { "featureType": "landscape", "elementType": "all", "stylers": [{"color": "#f1f5f9"}] }
      ]
    });

    // DirectionsService/DirectionsRenderer/Marker: in futuro migrare a Routes API e AdvancedMarkerElement (vedi avvisi in console)
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#2d4a3e", strokeWeight: 5, strokeOpacity: 0.92 }
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
    window.__mapsLoaded = true;
    if (typeof window.__mapsResolve === "function") {
      window.__mapsResolve();
      window.__mapsResolve = null;
    }
  } catch (e) {
    console.error("Errore inizializzazione Maps:", e);
    const el = document.getElementById("tracking-status");
    if (el) {
      el.textContent = "Mappa non disponibile. Disattiva il blocca-pubblicità per questo sito e ricarica, oppure controlla l'API Key.";
      el.classList.add("status-visible");
    }
  }
};

function loadGoogleMapsScriptIfNeeded() {
  if (window.google && window.google.maps) return Promise.resolve();
  if (document.querySelector('script[data-360step="gmaps"]')) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 9000);
      window.__mapsResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  const key = window.__360STEP_CONFIG__?.googleMapsApiKey;
  if (!key) {
    return Promise.reject(new Error("missing_google_maps_key"));
  }

  window._mapsLoadError = false;
  window._mapsLoadTimeout = setTimeout(() => {
    if (typeof google === "undefined") {
      window._mapsLoadError = true;
      const el = document.getElementById("tracking-status");
      if (el) {
        el.textContent = "La mappa non si è caricata. Avvia il progetto con il server e controlla la chiave Google Maps in .env (oppure disattiva ad-blocker).";
        el.classList.add("status-visible");
      }
      console.warn("[360step] Google Maps non caricato in tempo.");
    }
  }, 8000);

  return new Promise((resolve, reject) => {
    window.__mapsResolve = resolve;
    const s = document.createElement("script");
    s.setAttribute("data-360step", "gmaps");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&callback=initMap`;
    s.onerror = () => {
      window._mapsLoadError = true;
      if (window._mapsLoadTimeout) clearTimeout(window._mapsLoadTimeout);
      const el = document.getElementById("tracking-status");
      if (el) {
        el.textContent = "Impossibile caricare Google Maps. Controlla la connessione o disattiva il blocca-pubblicità.";
        el.classList.add("status-visible");
      }
      reject(new Error("gmaps_load_error"));
    };
    document.head.appendChild(s);
  });
}

function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function formatDistance(m) {
  if (!m || m <= 0) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatWalkTimeFromMeters(m) {
  if (!m || m <= 0) return null;
  // 1.25 m/s ~ 4.5 km/h
  const seconds = m / 1.25;
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

function setWalkEmptyState(on) {
  const empty = document.getElementById("walk-empty");
  const content = document.querySelector("#walk-sheet .sheet__content");
  if (!empty || !content) return;
  empty.hidden = !on;
  // nasconde il resto in modo semplice (tutto tranne il blocco empty)
  Array.from(content.children).forEach((child) => {
    if (child === empty) return;
    child.toggleAttribute("hidden", on);
  });
}

function ensureLeafletReady() {
  if (!window.L) return false;
  const container = document.getElementById("leaflet-map");
  if (!container) return false;
  if (!leafletMap) {
    if (typeof window.__initLeafletMap === "function") {
      window.__initLeafletMap();
    }
  }
  if (!leafletMap) return false;
  return true;
}

function invalidateLeafletSizeSoon() {
  if (!leafletMap) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try { leafletMap.invalidateSize(); } catch (e) { /* ignore */ }
    });
  });
}

function setUserMarker(lat, lng) {
  if (!leafletMap || !window.L) return;
  const p = [lat, lng];
  if (!leafletUserMarker) {
    leafletUserMarker = L.circleMarker(p, {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#1d4ed8",
      fillOpacity: 1
    }).addTo(leafletMap);
  } else {
    leafletUserMarker.setLatLng(p);
  }
}

function renderWalk(data) {
  // Guard: dati mancanti → empty state
  if (!data || !Array.isArray(data.stops) || data.stops.length === 0) {
    itineraryData = null;
    navigationState.status = "idle";
    setWalkEmptyState(true);
    setWalkViewEnabled(false);
    return;
  }

  itineraryData = data;
  navigationState.status = "ready";
  navigationState.currentLegIndex = Math.min(navigationState.currentLegIndex || 0, data.stops.length - 1);

  // Sincronizza lo stato legacy usato da varie funzioni esistenti
  stops = data.stops.map((s) => ({ ...s, reached: !!s.reached }));
  currentLegIndex = navigationState.currentLegIndex;

  setWalkEmptyState(false);
  setWalkViewEnabled(true);

  updateWalkHero();
  calculateAndDisplayRoute(); // calcola distanze/tempi (Google Directions se presente, altrimenti Haversine) + updateLeafletFromStops
  updateNextStopCardFromStops();

  // Fit bounds (preview-like) se abbiamo una mappa
  if (ensureLeafletReady()) {
    if (typeof window.__updateLeafletFromStops === "function") {
      window.__updateLeafletFromStops(stops);
    }
    invalidateLeafletSizeSoon();
  }
}

function openWalkScreen() {
  if (typeof window.__setAppView === "function") window.__setAppView("walk", true);
  // aspetta render + layout
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ensureLeafletReady();
      invalidateLeafletSizeSoon();
      // se abbiamo già dati, re-render
      if (itineraryData && itineraryData.stops && itineraryData.stops.length) {
        renderWalk(itineraryData);
      } else {
        setWalkEmptyState(true);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {

  // === Viste app: pianifica | itinerario | salvati ===
  const viewSections = document.querySelectorAll("[data-app-view]");
  const bottomNavBtns = document.querySelectorAll(".bottom-nav__btn[data-view]");

  function mapHashToViewId(hash) {
    const h = (hash || "").toLowerCase();
    const legacy = { "#pianifica": "plan", "#mappa": "walk", "#percorsi": "saved", "#home": "plan" };
    if (legacy[h]) return legacy[h];
    if (h === "#walk" || h === "#plan" || h === "#saved") return h.slice(1);
    return "plan";
  }

  function setAppView(viewId, pushState = true) {
    const id = viewId;
    const hasView = Array.from(viewSections).some((s) => s.getAttribute("data-app-view") === id);
    const safeId = hasView ? id : "plan";
    viewSections.forEach((section) => {
      const v = section.getAttribute("data-app-view");
      const on = v === safeId;
      section.classList.toggle("view--active", on);
      section.toggleAttribute("hidden", !on);
    });
    bottomNavBtns.forEach((btn) => {
      const v = btn.getAttribute("data-view");
      btn.classList.toggle("bottom-nav__btn--active", v === safeId);
    });
    if (pushState) {
      const urls = { plan: "#plan", walk: "#walk", saved: "#saved" };
      if (urls[safeId]) history.pushState(null, "", urls[safeId]);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (safeId === "walk") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (typeof initLeafletMap === "function") initLeafletMap();
          if (typeof leafletMap !== "undefined" && leafletMap) leafletMap.invalidateSize();
          if (typeof map !== "undefined" && map && window.google) google.maps.event.trigger(map, "resize");
        });
      });
    }
  }

  window.__setAppView = setAppView;

  function navigateTo(pageId, pushState = true) {
    const legacy = { map: "walk", planner: "plan", home: "plan", saved: "saved" };
    setAppView(legacy[pageId] || "plan", pushState);
  }

  bottomNavBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const v = btn.getAttribute("data-view");
      if (v) setAppView(v);
    });
  });

  const backToPlanBtn = document.getElementById("back-to-plan");
  if (backToPlanBtn) {
    backToPlanBtn.addEventListener("click", () => setAppView("plan"));
  }

  const walkEmptyBack = document.getElementById("walk-empty-back");
  if (walkEmptyBack) {
    walkEmptyBack.addEventListener("click", () => setAppView("plan"));
  }

  const ctaStartPlanning = document.getElementById("cta-start-planning");
  if (ctaStartPlanning) {
    ctaStartPlanning.addEventListener("click", () => setAppView("plan"));
  }

  const legacyNavLinks = document.querySelectorAll(".nav-link[data-page]");
  legacyNavLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      if (page) navigateTo(page);
    });
  });

  function resolveHashView() {
    return mapHashToViewId(window.location.hash);
  }

  if (viewSections.length) {
    setAppView(resolveHashView(), false);
    window.addEventListener("popstate", () => setAppView(resolveHashView(), false));
  }

  // === ELEMENT REFERENCES ===
  const cityInput = document.getElementById("city-input");
  const daysInput = document.getElementById("days-input");
  const btnGenerate = document.getElementById("btn-generate") || document.getElementById("generate-city-itinerary");
  const btnGenerateAi = document.getElementById("generate-ai-itinerary");
  const btnRegenerate = document.getElementById("btn-regenerate");
  const stopsList = document.getElementById("stops-list");
  const daysTabsContainer = document.getElementById("days-tabs");
  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");
  const trackingStatus = document.getElementById("tracking-status");
  const btnPreview = document.getElementById("btn-preview");
  const btnRecalc = document.getElementById("btn-recalc");
  const saveRouteBtnTop = document.getElementById("save-route-btn");

  // === Leaflet helpers (mappa alternativa) ===
  function initLeafletMap() {
    if (!window.L) {
      setStatusVisible(true);
      setStatusMessage("La mappa non si è caricata (Leaflet). Ricarica la pagina o controlla estensioni che bloccano script/CDN.", "status-neutral");
      return;
    }
    if (leafletMap) return;
    const container = document.getElementById("leaflet-map");
    if (!container) return;

    leafletMap = L.map(container).setView([48.8, 10], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(leafletMap);

    leafletMarkersLayer = L.layerGroup().addTo(leafletMap);

    // Se il container era hidden/collapsed al mount, Leaflet può renderizzare male:
    // invalida dopo il primo paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { leafletMap.invalidateSize(); } catch (e) { /* ignore */ }
      });
    });
  }

  function updateLeafletFromStops(dayStops) {
    if (!window.L) return;
    const container = document.getElementById("leaflet-map");
    if (!container || !dayStops) return;
    if (!leafletMap) initLeafletMap();
    if (!leafletMap || !leafletMarkersLayer) return;

    leafletMarkersLayer.clearLayers();
    if (leafletRouteLine) {
      leafletMap.removeLayer(leafletRouteLine);
      leafletRouteLine = null;
    }

    if (!dayStops.length) return;

    const coords = [];
    dayStops.forEach((s) => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") return;
      const coord = [s.lat, s.lng];
      coords.push(coord);
      const time = s.time || "—";
      const notes = s.notes || "—";
      const marker = L.marker(coord);
      marker.bindPopup(
        `<strong>${s.name}</strong><br>Orario: ${time}<br>Note: ${notes}`
      );
      leafletMarkersLayer.addLayer(marker);
    });

    if (!coords.length) return;

    if (coords.length >= 2) {
      leafletRouteLine = L.polyline(coords, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.85
      }).addTo(leafletMap);
      leafletMap.invalidateSize();
      leafletMap.fitBounds(leafletRouteLine.getBounds(), { padding: [20, 20] });
    } else {
      leafletMap.invalidateSize();
      leafletMap.setView(coords[0], 14);
    }
  }

  // Espone helper a funzioni globali (renderWalk/openWalkScreen)
  window.__initLeafletMap = initLeafletMap;
  window.__updateLeafletFromStops = updateLeafletFromStops;

  // Nessuna richiesta GPS al caricamento. Il banner di stato è nascosto di default e si mostra solo al click su "Avvia navigazione".
  function setStatusVisible(visible) {
    if (!trackingStatus) return;
    trackingStatus.classList.toggle("status-visible", !!visible);
  }
  function setStatusMessage(text, className) {
    if (!trackingStatus) return;
    trackingStatus.textContent = text;
    trackingStatus.className = "status-banner " + (className || "status-neutral");
  }

  function splitPoisIntoDays(pois, numDays, startLat, startLng) {
    if (!pois.length) return [];
    const perDay = Math.ceil(pois.length / numDays);
    const remaining = [...pois];
    const result = [];
    let originLat = startLat;
    let originLng = startLng;

    for (let d = 0; d < numDays; d++) {
      if (!remaining.length) break;
      const count = Math.min(perDay, remaining.length);
      let dayPois;
      if (originLat != null && originLng != null) {
        dayPois = [];
        let cur = { lat: originLat, lng: originLng };
        for (let j = 0; j < count; j++) {
          let nearestIdx = 0;
          let minDist = Infinity;
          for (let k = 0; k < remaining.length; k++) {
            if (typeof google !== "undefined" && google.maps?.geometry?.spherical) {
              const dd = google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(cur.lat, cur.lng),
                new google.maps.LatLng(remaining[k].lat, remaining[k].lng)
              );
              if (dd < minDist) { minDist = dd; nearestIdx = k; }
            } else {
              const dx = cur.lat - remaining[k].lat;
              const dy = cur.lng - remaining[k].lng;
              const dd = dx * dx + dy * dy;
              if (dd < minDist) { minDist = dd; nearestIdx = k; }
            }
          }
          dayPois.push(remaining[nearestIdx]);
          cur = remaining[nearestIdx];
          remaining.splice(nearestIdx, 1);
        }
      } else {
        dayPois = remaining.splice(0, count);
      }
      result.push(dayPois);
      if (dayPois.length) {
        const last = dayPois[dayPois.length - 1];
        originLat = last.lat;
        originLng = last.lng;
      }
    }
    if (remaining.length) {
      result[result.length - 1].push(...remaining);
    }
    return result;
  }

  function getStartOrigin(userLat, userLng) {
    if (customStartPoint) return { lat: customStartPoint.lat, lng: customStartPoint.lng };
    if (userLat != null && userLng != null) return { lat: userLat, lng: userLng };
    return null;
  }

  function doGenerateItinerary(userLat, userLng) {
    setGenerationLoading(true);
    const prefs = readWalkPreferences();
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
      setGenerationLoading(false);
      setStatusVisible(true);
      setStatusMessage("Non abbiamo trovato questa città. Scegline una dall'elenco suggerito.", "status-neutral");
      return;
    }

    let filtered = applyWalkMood(pois, prefs.walkType);
    filtered = applyTimeAndPaceCap(filtered, prefs.timeBudget, prefs.pace);
    filtered = enrichStopsWithWhy(filtered, prefs.walkType);

    const numDays = prefs.days;
    const origin = getStartOrigin(userLat, userLng);
    allStops = splitPoisIntoDays(filtered, numDays, origin?.lat, origin?.lng);

    lastWalkMeta = { ...prefs, citiesLabel: foundCities.join(", ") };

    currentDay = 1;
    renderTabs(allStops.length);
    loadDay(1);

    const citiesLabel = foundCities.join(", ");
    setStatusVisible(true);
    setStatusMessage(`Il tuo walk a ${citiesLabel} è pronto. Buon viaggio.`, "status-active");
    setWalkViewEnabled(true);
    // Stato robusto: salva itineraryData e apri la schermata walk in modo sicuro.
    itineraryData = {
      id: Date.now(),
      name: citiesLabel,
      mood: prefs.walkType,
      citiesLabel,
      stops: allStops[0] ? allStops[0].map((s) => ({ ...s })) : [],
      createdAt: new Date().toISOString()
    };
    openWalkScreen();
    renderWalk(itineraryData);
    setTimeout(() => setGenerationLoading(false), 900);
  }

  function doGenerateAiItinerary(userLat, userLng) {
    setGenerationLoading(true);
    const prefs = readWalkPreferences();
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

    if (!pois.length) {
      setGenerationLoading(false);
      setStatusVisible(true);
      setStatusMessage("Non abbiamo trovato questa città. Scegline una dall'elenco suggerito.", "status-neutral");
      return;
    }

    pois = [...pois].sort(() => Math.random() - 0.5);
    let filtered = applyWalkMood(pois, prefs.walkType);
    filtered = applyTimeAndPaceCap(filtered, prefs.timeBudget, prefs.pace);
    filtered = enrichStopsWithWhy(filtered, prefs.walkType);

    const numDays = prefs.days;
    const origin = getStartOrigin(userLat, userLng);
    allStops = splitPoisIntoDays(filtered, numDays, origin?.lat, origin?.lng);

    lastWalkMeta = { ...prefs, citiesLabel: foundCities.join(", ") };

    currentDay = 1;
    renderTabs(allStops.length);
    loadDay(1);
    const citiesLabel = foundCities.join(", ");
    setStatusVisible(true);
    setStatusMessage(`Nuovo mix per ${citiesLabel}. Esplora l'itinerario aggiornato.`, "status-active");
    setWalkViewEnabled(true);
    itineraryData = {
      id: Date.now(),
      name: citiesLabel,
      mood: prefs.walkType,
      citiesLabel,
      stops: allStops[0] ? allStops[0].map((s) => ({ ...s })) : [],
      createdAt: new Date().toISOString()
    };
    openWalkScreen();
    renderWalk(itineraryData);
    setTimeout(() => setGenerationLoading(false), 900);
  }

  if (btnGenerate) {
    btnGenerate.addEventListener("click", () => {
      if (!navigator.geolocation) {
        doGenerateItinerary(null, null);
        return;
      }
      setStatusVisible(true);
      setStatusMessage("Un attimo: usiamo la tua posizione per ordinare le tappe in modo sensato.", "status-active");
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
  }

  if (btnGenerateAi) {
    btnGenerateAi.addEventListener("click", () => {
      setStatusVisible(true);
      setStatusMessage("Creo un itinerario AI…", "status-active");
      if (!navigator.geolocation) {
        doGenerateAiItinerary(null, null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          userPosition = { lat, lng };
          if (userMarker) {
            userMarker.setPosition({ lat, lng });
            userMarker.setVisible(true);
          }
          doGenerateAiItinerary(lat, lng);
        },
        () => doGenerateAiItinerary(null, null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // Map-first static: Leaflet è il default (nessuna chiave necessaria).
  // Google Maps resta opzionale: caricalo solo se è presente una key (utile per directions più precisi).
  if (window.__360STEP_CONFIG__?.googleMapsApiKey) {
    loadGoogleMapsScriptIfNeeded().catch(() => {
      setStatusVisible(true);
      setStatusMessage("Mappa avanzata non disponibile. Continuo con la mappa standard.", "status-neutral");
    });
  }

  // Permette di lanciare la generazione con Invio
  if (cityInput) {
    cityInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const dropdown = document.getElementById("city-suggestions-dropdown");
        if (dropdown && dropdown.classList.contains("visible")) {
          const first = dropdown.querySelector(".city-suggestion-item");
          if (first) first.click();
        } else if (btnGenerate) {
          btnGenerate.click();
        }
      }
    });
  }

  if (btnRegenerate) {
    btnRegenerate.addEventListener("click", () => {
      if (!cityInput || !cityInput.value.trim()) {
        setStatusVisible(true);
        setStatusMessage("Scegli prima una città, poi rigenera il percorso.", "status-neutral");
        return;
      }
      setStatusVisible(true);
      setStatusMessage("Stiamo mescolando le tappe in un nuovo ordine…", "status-active");
      if (!navigator.geolocation) {
        doGenerateAiItinerary(null, null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (userMarker) {
            userMarker.setPosition(userPosition);
            userMarker.setVisible(true);
          }
          doGenerateAiItinerary(pos.coords.latitude, pos.coords.longitude);
        },
        () => doGenerateAiItinerary(null, null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // Barra ricerca città a cascata: elenco da CITY_TEMPLATES + CITY_ALIASES
  const cityDropdown = document.getElementById("city-suggestions-dropdown");
  if (cityInput && cityDropdown) {
    const cityList = Object.entries(CITY_TEMPLATES).map(([key, t]) => ({
      key,
      displayName: t.displayName,
      searchTerms: [t.displayName.toLowerCase(), ...(CITY_ALIASES[key] || []).map(a => a.toLowerCase())]
    }));

    function showSuggestions(query) {
      const q = (query || "").trim().toLowerCase();
      const filtered = q
        ? cityList.filter(c => c.searchTerms.some(term => term.includes(q)))
        : cityList.slice(0, 20);
      cityDropdown.innerHTML = filtered.slice(0, 12).map(c => 
        `<div class="city-suggestion-item" data-name="${c.displayName.replace(/"/g, "&quot;")}" data-key="${c.key}">${c.displayName}</div>`
      ).join("");
      cityDropdown.classList.toggle("visible", filtered.length > 0);
      cityDropdown.setAttribute("aria-hidden", filtered.length === 0 ? "true" : "false");
    }

    function addCity(name, key) {
      const cur = cityInput.value.trim();
      cityInput.value = cur ? `${cur}, ${name}` : name;
      cityDropdown.classList.remove("visible");
      cityDropdown.setAttribute("aria-hidden", "true");
      renderCityCatalog(key || getFirstCityKeyFromInput());
    }

    function getFirstCityKeyFromInput() {
      const raw = cityInput.value.trim();
      if (!raw) return null;
      const parts = raw.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        let key = resolveCityKey(part);
        if (!key) {
          for (const [k, t] of Object.entries(CITY_TEMPLATES)) {
            if (t.displayName && t.displayName.toLowerCase() === part.toLowerCase()) {
              key = k;
              break;
            }
          }
        }
        if (key && CITY_CATALOG[key]) return key;
      }
      return null;
    }

    function renderCityCatalog(cityKey) {
      const catalogEl = document.getElementById("city-catalog");
      if (!catalogEl) return;
      if (!cityKey || !CITY_CATALOG[cityKey]) {
        catalogEl.innerHTML = "";
        catalogEl.classList.remove("city-catalog-visible");
        return;
      }
      const cat = CITY_CATALOG[cityKey];
      const name = CITY_TEMPLATES[cityKey] ? CITY_TEMPLATES[cityKey].displayName : cityKey;
      catalogEl.innerHTML = `
        <div class="city-catalog-card">
          <h4 class="city-catalog-title">${name}</h4>
          <p class="city-catalog-desc">${cat.description}</p>
          <p class="city-catalog-label">Cosa vedere</p>
          <ul class="city-catalog-highlights">${(cat.highlights || []).map(h => `<li>${h}</li>`).join("")}</ul>
        </div>
      `;
      catalogEl.classList.add("city-catalog-visible");
    }

    // Mostra subito il catalogo di Roma al caricamento
    const catalogEl = document.getElementById("city-catalog");
    if (catalogEl) {
      renderCityCatalog("rome");
    }

    cityInput.addEventListener("input", () => {
      showSuggestions(cityInput.value);
      const key = getFirstCityKeyFromInput();
      renderCityCatalog(key || "rome");
    });
    cityInput.addEventListener("blur", () => {
      const key = getFirstCityKeyFromInput();
      renderCityCatalog(key || "rome");
    });
    cityInput.addEventListener("focus", () => showSuggestions(cityInput.value));
    cityDropdown.addEventListener("click", (e) => {
      const item = e.target.closest(".city-suggestion-item");
      if (item) {
        const name = item.getAttribute("data-name");
        const key = item.getAttribute("data-key");
        addCity(name, key);
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".city-search-wrap")) {
        cityDropdown.classList.remove("visible");
        cityDropdown.setAttribute("aria-hidden", "true");
      }
    });
  }

  // === STARTING POINT GEOCODING ===
  const startPointInput = document.getElementById("start-point-input");
  const startPointBtn = document.getElementById("start-point-btn");
  const startPointStatus = document.getElementById("start-point-status");

  if (startPointInput && startPointBtn) {
    startPointBtn.addEventListener("click", () => {
      const query = startPointInput.value.trim();
      if (!query) {
        customStartPoint = null;
        if (startPointStatus) startPointStatus.textContent = "Punto di partenza rimosso. Verrà usata la posizione GPS.";
        return;
      }
      if (typeof google === "undefined" || !google.maps) {
        if (startPointStatus) startPointStatus.textContent = "Mappa non pronta. Attendi il caricamento.";
        return;
      }
      if (startPointStatus) startPointStatus.textContent = "Ricerca in corso...";
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: query }, (results, status) => {
        if (status !== "OK" || !results || !results[0]) {
          if (startPointStatus) startPointStatus.textContent = "Luogo non trovato. Prova con un indirizzo più specifico.";
          customStartPoint = null;
          return;
        }
        const loc = results[0].geometry.location;
        customStartPoint = {
          lat: loc.lat(),
          lng: loc.lng(),
          label: results[0].formatted_address || query
        };
        if (startPointStatus) startPointStatus.textContent = "Partenza: " + customStartPoint.label;
      });
    });

    startPointInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        startPointBtn.click();
      }
    });
  }

  const btnRecalcFromPosition = document.getElementById("btn-recalc");
  if (btnRecalcFromPosition) {
    btnRecalcFromPosition.addEventListener("click", () => {
      const flatStops = allStops.flat();
      if (flatStops.length === 0) return;
      if (!navigator.geolocation) return alert("GPS non supportato.");
      setStatusVisible(true);
      setStatusMessage("Ricalcolo da tua posizione…", "status-active");
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
          setStatusMessage("Itinerario riordinato dalla tua posizione!", "status-active");
        },
        () => alert("Impossibile ottenere la posizione.")
      );
    });
  }

  function renderTabs(n) {
    if (!daysTabsContainer) return;
    daysTabsContainer.innerHTML = "";
    if (n <= 1) {
      daysTabsContainer.classList.add("days-tabs--hidden");
      return;
    }
    daysTabsContainer.classList.remove("days-tabs--hidden");
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

    const summaryEl = document.getElementById("route-summary");
    if (summaryEl) {
      summaryEl.innerHTML = "";
      summaryEl.style.display = "none";
    }
    const distNext = document.getElementById("distance-to-next");
    const curLeg = document.getElementById("current-leg");
    if (distNext) distNext.textContent = "—";
    if (curLeg) curLeg.textContent = stops.length > 0 ? stops[0].name : "—";

    renderStopsList();
    updateWalkHero();
    updateNextStopCardFromStops();
    calculateAndDisplayRoute();
    updateLeafletFromStops(stops);
  }

  let sortableInstance = null;

  function initSortableStops() {
    if (!stopsList || !window.Sortable) return;
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
    if (stops.length < 2) return;

    sortableInstance = new Sortable(stopsList, {
      animation: 150,
      ghostClass: "stop-item-dragging",
      filter: ".stop-item-start",
      onEnd: function(evt) {
        const items = stopsList.querySelectorAll(".stop-item:not(.stop-item-start)");
        const newOrder = Array.from(items).map(li => parseInt(li.getAttribute("data-index"), 10)).filter(n => !Number.isNaN(n));
        if (newOrder.length !== stops.length) return;
        const reordered = newOrder.map(i => stops[i]);
        stops.length = 0;
        stops.push(...reordered);
        allStops[currentDay - 1] = [...stops];
        setStatusVisible(true);
        setStatusMessage("Itinerario riordinato. Ricalcolo tempi…", "status-active");
        calculateAndDisplayRoute();
        if (typeof updateLeafletFromStops === "function") updateLeafletFromStops(stops);
      }
    });
  }

  function renderRouteSummary(totalMeters, totalSeconds) {
    const el = document.getElementById("route-summary");
    if (!el) return;
    if (!totalMeters && !totalSeconds) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }
    const km = (totalMeters / 1000).toFixed(1);
    const mins = Math.round(totalSeconds / 60);
    const timeStr = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    el.innerHTML = `<span class="route-summary-km">${km} km</span><span class="route-summary-sep">·</span><span class="route-summary-time">~${timeStr} a piedi</span>`;
    el.style.display = "flex";
    updateItineraryHeadline(totalMeters, totalSeconds);
  }

  function getDayStartLabel(day) {
    if (day === 1 && customStartPoint) return `Partenza: ${customStartPoint.label}`;
    if (day > 1) {
      const prevDay = allStops[day - 2];
      if (prevDay && prevDay.length) {
        return `Prosegui da: ${prevDay[prevDay.length - 1].name}`;
      }
    }
    return null;
  }

  function renderStopsList() {
    if (!stopsList) return;
    let startLabel = getDayStartLabel(currentDay);
    let startHtml = startLabel
      ? `<li class="stop-item stop-card stop-card--start stop-item-start" aria-hidden="false"><div class="stop-card__inner"><span class="stop-card__num" aria-hidden="true">↦</span><div class="stop-card__body"><p class="stop-card__start-label">${escHtml(startLabel)}</p></div></div></li>`
      : "";
    stopsList.innerHTML = startHtml + stops.map((s, i) => {
      const fromPrev = i > 0 && (s.distanceFromPrev || s.durationFromPrev)
        ? `<p class="stop-card__fromprev">Da prima: ${escHtml([s.distanceFromPrev, s.durationFromPrev].filter(Boolean).join(" · "))}</p>`
        : "";
      const toNext = s.distanceToNext || s.durationToNext
        ? `<p class="stop-card__leg">\u2192 Poi: ${escHtml([s.distanceToNext, s.durationToNext].filter(Boolean).join(" · "))}</p>`
        : "";
      const whyBlock = s.why ? `<p class="stop-card__why">${escHtml(s.why)}</p>` : "";
      return `
      <li class="stop-item stop-card ${s.reached ? "reached" : ""} ${i === currentLegIndex ? "current" : ""}" data-index="${i}">
        <div class="stop-card__inner">
          <span class="stop-card__num" aria-hidden="true">${i + 1}</span>
          <div class="stop-card__body">
            <h3 class="stop-card__title">${escHtml(s.name)}</h3>
            ${whyBlock}
            ${fromPrev}
            ${toNext}
          </div>
          <span class="stop-card__status" aria-label="${s.reached ? "Visitata" : "Da visitare"}">${s.reached ? "\u2713" : "\u00b7\u00b7\u00b7"}</span>
        </div>
      </li>
    `}).join("");
    
    if (btnStart) btnStart.disabled = stops.length < 1;
    const btnPreview = document.getElementById("btn-preview");
    if (btnPreview) btnPreview.disabled = allStops.flat().length < 1;
    const btnRecalc = document.getElementById("btn-recalc");
    if (btnRecalc) btnRecalc.disabled = allStops.flat().length < 1;
    const regen = document.getElementById("btn-regenerate");
    if (regen) regen.disabled = allStops.flat().length < 1;
    const saveWalk = document.getElementById("save-route-btn");
    if (saveWalk) saveWalk.disabled = allStops.flat().length < 1;

    initSortableStops();
  }

  // Estrae testo dalle istruzioni HTML delle Directions API
  function stripHtml(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  }

  // Mostra il pannello indicazioni con le istruzioni turn-by-turn (gira a destra, ecc.)
  function renderDirectionsPanel(legs, currentStepIndex) {
    const panel = document.getElementById("directions-panel");
    const container = document.getElementById("directions-steps");
    if (!panel || !container) return;
    currentStepIndex = currentStepIndex ?? 0;
    const steps = [];
    if (legs && legs.length) {
      legs.forEach(leg => {
        if (leg.steps && leg.steps.length) {
          leg.steps.forEach(s => steps.push({
            text: stripHtml(s.instructions),
            distance: s.distance && s.distance.text ? s.distance.text : "",
            duration: s.duration && s.duration.text ? s.duration.text : ""
          }));
        }
      });
    }
    if (steps.length === 0) {
      panel.classList.remove("visible");
      panel.setAttribute("aria-hidden", "true");
      container.innerHTML = "";
      return;
    }
    container.innerHTML = steps.map((s, i) => `
      <div class="directions-step ${i === currentStepIndex ? "current" : ""}" data-index="${i}">
        <span class="directions-step-num">${i + 1}</span>
        <div>
          <div class="directions-step-text">${s.text || "—"}</div>
          ${s.distance ? `<div class="directions-step-dist">${s.distance}${s.duration ? " · " + s.duration : ""}</div>` : ""}
        </div>
      </div>
    `).join("");
    panel.classList.add("visible");
    panel.setAttribute("aria-hidden", "false");
  }

  function hideDirectionsPanel() {
    const panel = document.getElementById("directions-panel");
    const container = document.getElementById("directions-steps");
    if (panel) {
      panel.classList.remove("visible");
      panel.setAttribute("aria-hidden", "true");
    }
    if (container) container.innerHTML = "";
  }

  // Crea un percorso dalla posizione utente alla tappa selezionata e mostra le indicazioni
  function drawRouteFromUserToStop(stopIndex) {
    if (typeof google === "undefined" || !directionsService || !stops[stopIndex]) return;
    if (!userPosition) return;
    const destination = stops[stopIndex];
    const originLatLng = { lat: userPosition.lat, lng: userPosition.lng };

    directionsService.route({
      origin: originLatLng,
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: google.maps.TravelMode.WALKING
    }, (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        setStatusMessage(`Verso ${destination.name}`, "status-active");
        const legs = result.routes && result.routes[0] && result.routes[0].legs;
        renderDirectionsPanel(legs, 0);
      }
    });
  }

  // Messaggio errore GPS leggibile in console e in italiano per l'utente
  function handleGeolocationError(err) {
    const code = err && err.code;
    const msg = err && err.message ? err.message : "";
    const codeNames = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };
    const codeName = codeNames[code] || "UNKNOWN";
    console.error("[GPS] Errore geolocalizzazione:", codeName, "code=" + code, msg);

    let userMsg = "Impossibile usare la posizione.";
    if (code === 1) userMsg = "Permesso GPS negato. Abilita la posizione nelle impostazioni del browser o del dispositivo.";
    else if (code === 2) userMsg = "Posizione non disponibile. Controlla che il GPS sia attivo e il segnale sufficiente.";
    else if (code === 3) userMsg = "Tempo scaduto. Riprova in un luogo con migliore ricezione.";

    setStatusVisible(true);
    setStatusMessage(userMsg, "status-neutral");
  }

  // Avvia la navigazione GPS solo al click — permesso richiesto qui, mai al caricamento
  function startGpsTracking() {
    if (!navigator.geolocation) {
      setStatusVisible(true);
      setStatusMessage("Questo browser non supporta la geolocalizzazione. Usa un browser aggiornato.", "status-neutral");
      console.error("[GPS] navigator.geolocation non disponibile");
      return;
    }
    if (!stops.length) {
      setStatusVisible(true);
      setStatusMessage("Genera prima un itinerario (città + Genera itinerario).", "status-neutral");
      return;
    }

    setStatusVisible(true);
    setStatusMessage("Richiesta posizione in corso… Accetta il permesso nel browser.", "status-active");
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    document.body.classList.add("is-tracking");
    if (map) map.setZoom(17);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userPosition = userPos;
        // Leaflet marker (default)
        if (ensureLeafletReady()) {
          setUserMarker(userPos.lat, userPos.lng);
          leafletMap.panTo([userPos.lat, userPos.lng], { animate: true });
        }
        // Google marker (opzionale)
        if (userMarker) {
          userMarker.setPosition(userPos);
          userMarker.setVisible(true);
        }
        if (map) {
          map.panTo(userPos);
          if (map.getZoom() < 17) map.setZoom(17);
        }
        setStatusMessage("Navigazione attiva.", "status-active");

        if (currentLegIndex < stops.length) {
          const target = stops[currentLegIndex];
          const distance = (typeof google !== "undefined" && google.maps?.geometry?.spherical)
            ? google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(userPos.lat, userPos.lng),
                new google.maps.LatLng(target.lat, target.lng)
              )
            : haversineMeters({ lat: userPos.lat, lng: userPos.lng }, { lat: target.lat, lng: target.lng });
          const distEl = document.getElementById("distance-to-next");
          const legEl = document.getElementById("current-leg");
          const timeEl = document.getElementById("time-to-next");
          if (distEl) distEl.textContent = formatDistance(distance) || `${Math.round(distance)} m`;
          if (legEl) legEl.textContent = target.name;
          if (timeEl) {
            timeEl.textContent = formatWalkTimeFromMeters(distance) || "—";
          }
          // Directions solo se Google è disponibile
          if (typeof google !== "undefined" && directionsService) {
            drawRouteFromUserToStop(currentLegIndex);
          }
          if (distance < DISTANCE_THRESHOLD_METERS) {
            stops[currentLegIndex].reached = true;
            currentLegIndex++;
            renderStopsList();
            updateNextStopCardFromStops();
            if (map) updateMarkers();
            if (currentLegIndex >= stops.length) {
              setStatusMessage("Itinerario completato! 🎉", "status-done");
              if (watchId) navigator.geolocation.clearWatch(watchId);
              watchId = null;
              if (btnStop) btnStop.disabled = true;
              if (btnStart) btnStart.disabled = false;
              document.body.classList.remove("is-tracking");
            }
          }
        }
      },
      (err) => {
        handleGeolocationError(err);
        if (btnStart) btnStart.disabled = false;
        if (btnStop) btnStop.disabled = true;
        if (watchId) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        document.body.classList.remove("is-tracking");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // Click su una tappa: imposta destinazione, disegna percorso e avvia navigazione vera
  if (stopsList) {
    stopsList.addEventListener("click", (event) => {
      const item = event.target.closest(".stop-item");
      if (!item) return;
      const index = Number(item.getAttribute("data-index"));
      if (Number.isNaN(index) || !stops[index]) return;

      currentLegIndex = index;
      const curLegEl = document.getElementById("current-leg");
      if (curLegEl) curLegEl.textContent = stops[index].name;
      renderStopsList();
      updateMarkers();

      const buildAndStartNavigation = () => {
        if (map) {
          map.setZoom(17);
          map.panTo(userPosition);
        }
        drawRouteFromUserToStop(index);
        if (!watchId) startGpsTracking();
      };

      if (userPosition) {
        buildAndStartNavigation();
      } else if (navigator.geolocation) {
        setStatusVisible(true);
        setStatusMessage("Rilevamento posizione in corso…", "status-active");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (userMarker) {
              userMarker.setPosition(userPosition);
              userMarker.setVisible(true);
            }
            buildAndStartNavigation();
          },
          (err) => {
            handleGeolocationError(err);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    });
  }

  function calculateAndDisplayRoute() {
    // Se Google Directions non è disponibile (es. GitHub Pages senza key), facciamo fallback con Haversine.
    if (stops.length < 1) return;
    if (typeof google === "undefined" || !directionsService) {
      let totalMeters = 0;
      for (let i = 0; i < stops.length; i++) {
        const prev = i > 0 ? stops[i - 1] : null;
        const cur = stops[i];
        const next = i < stops.length - 1 ? stops[i + 1] : null;
        const mFromPrev = prev ? haversineMeters({ lat: prev.lat, lng: prev.lng }, { lat: cur.lat, lng: cur.lng }) : 0;
        const mToNext = next ? haversineMeters({ lat: cur.lat, lng: cur.lng }, { lat: next.lat, lng: next.lng }) : 0;
        cur.distanceFromPrev = prev ? formatDistance(mFromPrev) : null;
        cur.durationFromPrev = prev ? formatWalkTimeFromMeters(mFromPrev) : null;
        cur.distanceToNext = next ? formatDistance(mToNext) : null;
        cur.durationToNext = next ? formatWalkTimeFromMeters(mToNext) : null;
        if (next) totalMeters += mToNext;
      }
      const totalSeconds = Math.round(totalMeters / 1.25);
      renderRouteSummary(totalMeters, totalSeconds);
      renderStopsList();
      updateNextStopCardFromStops();
      updateLeafletFromStops(stops);
      return;
    }

    if (stops.length === 1) {
      stops[0].durationToNext = null;
      stops[0].distanceToNext = null;
      stops[0].durationFromPrev = null;
      stops[0].distanceFromPrev = null;
      renderRouteSummary(0, 0);
      directionsRenderer.setDirections({ routes: [] });
      updateMarkers();
      updateNextStopCardFromStops();
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
        let totalMeters = 0;
        let totalSeconds = 0;
        for (let i = 0; i < stops.length; i++) {
          if (i < legs.length && legs[i]) {
            stops[i].durationToNext = legs[i].duration ? legs[i].duration.text : null;
            stops[i].distanceToNext = legs[i].distance ? legs[i].distance.text : null;
            // Distanza/tempo dalla tappa precedente (per card scansionabili)
            if (i > 0 && legs[i - 1]) {
              stops[i].durationFromPrev = legs[i - 1].duration ? legs[i - 1].duration.text : null;
              stops[i].distanceFromPrev = legs[i - 1].distance ? legs[i - 1].distance.text : null;
            } else {
              stops[i].durationFromPrev = null;
              stops[i].distanceFromPrev = null;
            }
            if (legs[i].distance && legs[i].distance.value) totalMeters += legs[i].distance.value;
            if (legs[i].duration && legs[i].duration.value) totalSeconds += legs[i].duration.value;
          } else {
            stops[i].durationToNext = null;
            stops[i].distanceToNext = null;
            stops[i].durationFromPrev = null;
            stops[i].distanceFromPrev = null;
          }
        }
        renderRouteSummary(totalMeters, totalSeconds);
        renderStopsList();
        updateNextStopCardFromStops();
        updateMarkers();
        if (typeof updateLeafletFromStops === "function") updateLeafletFromStops(stops);
      }
    });
  }

  function updateMarkers() {
    markers.forEach(m => {
      google.maps.event.clearInstanceListeners(m);
      m.setMap(null);
    });
    if (!map) return;
    markers = stops.map((s, i) => new google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: map,
        label: { text: (i + 1).toString(), color: "white", fontWeight: "bold" },
        title: s.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: s.reached ? "#2d6a4f" : (i === currentLegIndex ? "#2d4a3e" : "#94a3b8"),
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
    if (!map) return;
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
          fillColor: i === currentIdx ? "#2d4a3e" : "#94a3b8",
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
        fillColor: i === currentIdx ? "#2d4a3e" : "#94a3b8",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "white",
        scale: 16
      });
    });
  }

  // --- Walk screen actions (robuste, state-based) ---
  function setNavStatus(next) {
    navigationState.status = next;
    navigationState.watchId = watchId;
    updateNextStopCardFromStops();
    // Bottoni: Pausa attiva solo se stiamo navigando
    if (btnStop) btnStop.disabled = !(watchId || navigationState.status === "navigating");
  }

  function startNavigation() {
    if (!itineraryData || !itineraryData.stops || !itineraryData.stops.length) {
      setStatusVisible(true);
      setStatusMessage("Crea prima un itinerario, poi avvia il walk.", "status-neutral");
      setWalkEmptyState(true);
      return;
    }
    openWalkScreen();
    setNavStatus("navigating");
    startGpsTracking(); // usa GPS; se Google non c'è, calcoliamo distanze con Haversine
  }

  function pauseNavigation() {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    setNavStatus("paused");
    setStatusVisible(true);
    setStatusMessage("In pausa. Riprendi quando vuoi.", "status-neutral");
    document.body.classList.remove("is-tracking");
  }

  function previewRoute() {
    if (!itineraryData || !itineraryData.stops || !itineraryData.stops.length) {
      setWalkEmptyState(true);
      return;
    }
    openWalkScreen();
    setNavStatus("preview");
    if (ensureLeafletReady()) {
      if (typeof window.__updateLeafletFromStops === "function") {
        window.__updateLeafletFromStops(itineraryData.stops);
      }
      invalidateLeafletSizeSoon();
    }
    setStatusVisible(true);
    setStatusMessage("Anteprima: tappe e percorso sulla mappa.", "status-active");
  }

  if (btnStart) btnStart.addEventListener("click", startNavigation);
  if (btnStop) btnStop.addEventListener("click", pauseNavigation);
  if (btnPreview) btnPreview.addEventListener("click", previewRoute);

  // Inline buttons removed (map-first sheet uses btnStart/btnStop directly)

  if (btnStop) btnStop.addEventListener("click", () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (userMarker) userMarker.setVisible(false);
    setStatusMessage("Navigazione sospesa.", "status-neutral");
    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.disabled = true;
    document.body.classList.remove("is-tracking");
    if (map && stops.length) {
      const bounds = new google.maps.LatLngBounds();
      stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(bounds);
    }
    updateNextStopCardFromStops();
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
          if (map) {
            map.panTo(p);
            map.setZoom(16);
          }
        },
        err => alert("Impossibile ottenere la posizione."),
        { enableHighAccuracy: true }
      );
    });
  }

  // === ANTEPRIMA PERCORSO (PLAY) ===
  const btnPlay = document.getElementById("btn-preview");
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
    if (overlay) overlay.classList.add("hidden");
    if (btnSimPause) btnSimPause.textContent = "⏸ Pausa";
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
    if (simPoiName) simPoiName.textContent = s.name;
    if (simPoiCity) simPoiCity.textContent = s.cityName ? s.cityName : "";
    if (simCurrent) simCurrent.textContent = index + 1;
    if (simTotal) simTotal.textContent = flatStops.length;

    // Pan mappa e mostra percorso fino a questa tappa
    const stopsSoFar = flatStops.slice(0, index + 1);
    if (map) {
      map.panTo({ lat: s.lat, lng: s.lng });
      map.setZoom(15);
    }

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

  if (btnPlay && overlay) {
    btnPlay.addEventListener("click", () => {
      const flatStops = allStops.flat();
      if (flatStops.length === 0) return;
      navigateTo("map");

      simIndex = 0;
      updateMarkersForSimulation(flatStops, 0, (i) => {
        updateSimulationUI(i, flatStops);
      });
      overlay.classList.remove("hidden");
      if (simTotal) simTotal.textContent = flatStops.length;
      updateSimulationUI(0, flatStops);

      if (simulationInterval) clearInterval(simulationInterval);
      simulationInterval = setInterval(() => {
        simIndex = (simIndex + 1) % flatStops.length;
        updateSimulationUI(simIndex, flatStops);
        if (simIndex === flatStops.length - 1) {
          clearInterval(simulationInterval);
          simulationInterval = null;
          if (btnSimPause) btnSimPause.textContent = "⏸ Fine";
        }
      }, 3500);
    });
  }

  if (btnSimPrev) {
    btnSimPrev.addEventListener("click", () => {
      const flatStops = allStops.flat();
      simIndex = Math.max(0, simIndex - 1);
      updateSimulationUI(simIndex, flatStops);
    });
  }

  if (btnSimNext) {
    btnSimNext.addEventListener("click", () => {
      const flatStops = allStops.flat();
      simIndex = Math.min(flatStops.length - 1, simIndex + 1);
      updateSimulationUI(simIndex, flatStops);
    });
  }

  if (btnSimPause) {
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
  }

  if (btnSimClose) btnSimClose.addEventListener("click", stopSimulation);

  // === AGGIUNGI META (geocoding + inserimento in ordine sensato) ===
  const addMetaInput = document.getElementById("add-meta-input");
  const addMetaBtn = document.getElementById("add-meta-btn");
  if (addMetaInput && addMetaBtn) {
    addMetaBtn.addEventListener("click", () => {
      const query = addMetaInput.value.trim();
      if (!query) {
        addMetaInput.focus();
        return;
      }
      if (!allStops.length) {
        setStatusVisible(true);
        setStatusMessage("Genera prima un itinerario (città + Genera itinerario), poi aggiungi la meta.", "status-neutral");
        return;
      }
      if (typeof google === "undefined" || !google.maps) {
        setStatusVisible(true);
        setStatusMessage("Mappa non pronta. Attendi il caricamento.", "status-neutral");
        return;
      }
      const dayIndex = currentDay - 1;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: query + ", Europe" }, (results, status) => {
        if (status !== "OK" || !results || !results[0]) {
          setStatusVisible(true);
          setStatusMessage("Luogo non trovato. Prova un altro nome o indirizzo.", "status-neutral");
          return;
        }
        const loc = results[0].geometry.location;
        const newPoi = {
          name: results[0].formatted_address || query,
          lat: loc.lat(),
          lng: loc.lng(),
          cityName: ""
        };
        allStops[dayIndex] = allStops[dayIndex] || [];
        allStops[dayIndex].push(newPoi);
        const dayStops = allStops[dayIndex];
        const start = dayStops[0];
        allStops[dayIndex] = optimizeRouteFromPosition(dayStops, start.lat, start.lng);
        loadDay(currentDay);
        addMetaInput.value = "";
        setStatusVisible(true);
        setStatusMessage("Meta aggiunta al giorno " + currentDay + " e ordinata nel percorso.", "status-active");
      });
    });
  }

  // === SALVA PERCORSO e Percorsi salvati ===
  const SAVED_ROUTES_KEY = "360step_saved_routes";
  const saveRouteBtn = document.getElementById("save-route-btn");
  const savedRoutesList = document.getElementById("saved-routes-list");

  function getSavedRoutes() {
    try {
      const raw = localStorage.getItem(SAVED_ROUTES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function setSavedRoutes(routes) {
    try {
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
    } catch (e) {
      console.warn("Impossibile salvare i percorsi", e);
    }
  }

  function renderSavedRoutes() {
    if (!savedRoutesList) return;
    const routes = getSavedRoutes();
    const emptyEl = document.getElementById("saved-empty");
    if (!routes.length) {
      savedRoutesList.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    savedRoutesList.innerHTML = routes.map((r, i) => `
      <li class="saved-route-item" data-index="${i}">
        <div class="saved-route-main">
          <span class="saved-route-name">${r.name || "Percorso " + (i + 1)}</span>
          <span class="saved-route-meta">${r.cities || ""} · ${r.days || 0} giorni</span>
        </div>
        <div class="saved-route-actions">
          <button type="button" class="btn btn-outline saved-route-load">Carica</button>
          <button type="button" class="btn btn-outline planned-remove">Elimina</button>
        </div>
      </li>
    `).join("");
  }

  if (saveRouteBtn) {
    saveRouteBtn.addEventListener("click", () => {
      if (!allStops.length) {
        setStatusVisible(true);
        setStatusMessage("Genera un itinerario prima di salvarlo nei preferiti.", "status-neutral");
        return;
      }
      const nameInput = document.getElementById("walk-save-name");
      const defaultName = (cityInput && cityInput.value.trim()) || lastWalkMeta.citiesLabel || "Il mio walk";
      const name = nameInput && nameInput.value.trim()
        ? nameInput.value.trim()
        : (typeof prompt === "function" ? prompt("Nome per questo walk (es. Weekend a Roma):", defaultName) : defaultName);
      if (name == null) return;
      const routes = getSavedRoutes();
      const route = {
        id: Date.now(),
        name: (name || "Itinerario").trim(),
        cities: cityInput ? cityInput.value.trim() : "",
        days: allStops.length,
        allStops: allStops.map(day => day.map(s => ({ name: s.name, lat: s.lat, lng: s.lng, cityName: s.cityName || "" }))),
        createdAt: new Date().toISOString()
      };
      routes.push(route);
      setSavedRoutes(routes);
      renderSavedRoutes();
      setStatusVisible(true);
      setStatusMessage("Salvato. Lo ritrovi in Salvati, pronto per il prossimo weekend.", "status-active");
      if (nameInput) nameInput.value = "";
    });
  }

  if (savedRoutesList) {
    renderSavedRoutes();
    savedRoutesList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest(".saved-route-item");
      if (!item) return;
      const idx = Number(item.getAttribute("data-index"));
      if (Number.isNaN(idx)) return;
      const routes = getSavedRoutes();
      const route = routes[idx];
      if (target.classList.contains("saved-route-load") && route && route.allStops) {
        allStops = route.allStops.map(day => day.map(s => ({ ...s })));
        renderTabs(allStops.length);
        loadDay(1);
        if (cityInput && route.cities) cityInput.value = route.cities;
        setStatusVisible(true);
        setStatusMessage("Percorso caricato. Puoi avviare la navigazione.", "status-active");
        if (typeof window.__setAppView === "function") window.__setAppView("walk");
        else navigateTo("planner");
        return;
      }
      if (target.classList.contains("planned-remove")) {
        routes.splice(idx, 1);
        setSavedRoutes(routes);
        renderSavedRoutes();
      }
    });
  }

  // === VIAGGI MESSI DA PARTE ===
  const plannedForm = document.getElementById("planned-form");
  const plannedList = document.getElementById("planned-list");
  const plannedNameInput = document.getElementById("planned-name");
  const plannedCitiesInput = document.getElementById("planned-cities");
  const plannedDateInput = document.getElementById("planned-date");

  const PLANNED_STORAGE_KEY = "360step_planned_trips";
  let plannedTrips = [];

  function loadPlannedTrips() {
    try {
      const raw = localStorage.getItem(PLANNED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        plannedTrips = parsed;
      }
    } catch (e) {
      console.warn("Impossibile leggere i viaggi salvati", e);
    }
  }

  function savePlannedTrips() {
    try {
      localStorage.setItem(PLANNED_STORAGE_KEY, JSON.stringify(plannedTrips));
    } catch (e) {
      console.warn("Impossibile salvare i viaggi", e);
    }
  }

  function renderPlannedTrips() {
    if (!plannedList) return;
    if (!plannedTrips.length) {
      plannedList.innerHTML = "";
      return;
    }
    plannedList.innerHTML = plannedTrips.map((trip, index) => {
      const dateLabel = trip.date ? ` · ${trip.date}` : "";
      const citiesLabel = trip.cities ? trip.cities : "Città da definire";
      return `
        <li class="planned-item" data-index="${index}">
          <div class="planned-main">
            <span class="planned-name">${trip.name}</span>
            <span class="planned-meta">${citiesLabel}${dateLabel}</span>
          </div>
          <div class="planned-actions">
            <button type="button" class="btn btn-outline planned-remove">✕</button>
          </div>
        </li>
      `;
    }).join("");
  }

  if (plannedForm && plannedList) {
    loadPlannedTrips();
    renderPlannedTrips();

    plannedForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = plannedNameInput.value.trim();
      const cities = plannedCitiesInput.value.trim();
      const date = plannedDateInput.value;
      if (!name) {
        plannedNameInput.focus();
        return;
      }
      plannedTrips.push({ name, cities, date });
      savePlannedTrips();
      renderPlannedTrips();
      plannedNameInput.value = "";
      plannedCitiesInput.value = "";
      plannedDateInput.value = "";
    });

    plannedList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains("planned-remove")) {
        const item = target.closest(".planned-item");
        if (!item) return;
        const idx = Number(item.getAttribute("data-index"));
        if (!Number.isNaN(idx)) {
          plannedTrips.splice(idx, 1);
          savePlannedTrips();
          renderPlannedTrips();
        }
      }
    });
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    try {
      const saved = localStorage.getItem("360step-theme");
      if (saved === "dark" || saved === "light") {
        document.documentElement.setAttribute("data-theme", saved);
        themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
      }
    } catch (e) { /* ignore */ }
    themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
      themeToggle.setAttribute("aria-label", next === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro");
      try {
        localStorage.setItem("360step-theme", next);
      } catch (e) { /* ignore */ }
    });
  }

});
