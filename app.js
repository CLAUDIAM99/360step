// === CONFIGURAZIONE GENERALE ===
const DISTANCE_THRESHOLD_METERS = 30;

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
  }
};

// Stato Applicazione
let map;
let directionsService;
let directionsRenderer;
let markers = [];
let allStops = [];
let stops = [];
let currentDay = 1;
let currentLegIndex = 0;
let watchId = null;

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
    console.log("Maps API caricata correttamente.");
  } catch (e) {
    console.error("Errore inizializzazione Maps:", e);
    document.getElementById("tracking-status").textContent = "Errore: Google Maps non caricato. Controlla la connessione o l'API Key.";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const cityInput = document.getElementById("city-input");
  const daysInput = document.getElementById("days-input");
  const btnGenerate = document.getElementById("generate-city-itinerary");
  const stopsList = document.getElementById("stops-list");
  const daysTabsContainer = document.getElementById("days-tabs");
  const btnStart = document.getElementById("start-tracking");
  const btnStop = document.getElementById("stop-tracking");
  const trackingStatus = document.getElementById("tracking-status");

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

  btnGenerate.addEventListener("click", () => {
    const rawCity = cityInput.value.toLowerCase().trim();
    // Supporto per varianti nomi
    let city = rawCity;
    if (rawCity === "roma") city = "rome";
    if (rawCity === "parigi" || rawCity === "paris") city = "paris";
    if (rawCity === "londra") city = "london";
    if (rawCity === "bruxelles") city = "brussels";
    if (rawCity === "barcellona") city = "barcelona";
    if (rawCity === "berlino") city = "berlin";
    if (rawCity === "praga") city = "prague";
    if (rawCity === "lisbona") city = "lisbon";

    const numDays = parseInt(daysInput.value);
    const template = CITY_TEMPLATES[city] || CITY_TEMPLATES.rome;
    
    const pois = [...template.pois];
    allStops = [];
    const perDay = Math.ceil(pois.length / numDays);
    
    for (let i = 0; i < numDays; i++) {
      allStops.push(pois.slice(i * perDay, (i + 1) * perDay));
    }

    currentDay = 1;
    renderTabs(numDays);
    loadDay(1);
    
    trackingStatus.textContent = `Itinerario per ${template.displayName} pronto!`;
    trackingStatus.className = "status-banner status-active";
  });

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
          <span class="stop-name">${s.name}</span>
        </div>
        <span class="stop-status">${s.reached ? '✅' : '⏳'}</span>
      </li>
    `).join("");
    
    btnStart.disabled = stops.length < 1;
  }

  function calculateAndDisplayRoute() {
    if (typeof google === "undefined" || !directionsService || stops.length < 2) return;

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
        updateMarkers();
      }
    });
  }

  function updateMarkers() {
    markers.forEach(m => m.setMap(null));
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

  btnStart.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("GPS non supportato.");
    if (typeof google === "undefined") return alert("Servizi Google non caricati.");

    trackingStatus.textContent = "Navigazione attiva...";
    trackingStatus.className = "status-banner status-active";
    btnStart.disabled = true;
    btnStop.disabled = false;

    watchId = navigator.geolocation.watchPosition(pos => {
      const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      
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
    trackingStatus.textContent = "Navigazione sospesa.";
    trackingStatus.className = "status-banner status-neutral";
    btnStart.disabled = false;
    btnStop.disabled = true;
  });
});
