// === CONFIGURAZIONE GENERALE ===
const DISTANCE_THRESHOLD_METERS = 50;
// === CONFIGURAZIONE GENERALE ===
const DISTANCE_THRESHOLD_METERS = 30;

// Database Itinerari potenziato
const CITY_TEMPLATES = {
  rome: {
    displayName: "Roma",
    pois: [
      { name: "Colosseo", lat: 41.8902, lng: 12.4922 },
      { name: "Arco di Costantino", lat: 41.8898, lng: 12.4907 },
      { name: "Foro Romano", lat: 41.8925, lng: 12.4853 },
      { name: "Palatino", lat: 41.8884, lng: 12.4868 },
      { name: "Altare della Patria", lat: 41.8946, lng: 12.4828 },
      { name: "Campidoglio", lat: 41.8933, lng: 12.4829 },
      { name: "Teatro di Marcello", lat: 41.8919, lng: 12.4798 },
      { name: "Largo di Torre Argentina", lat: 41.8955, lng: 12.4764 },
      { name: "Pantheon", lat: 41.8986, lng: 12.4769 },
      { name: "Piazza Navona", lat: 41.8992, lng: 12.4731 },
      { name: "Campo de' Fiori", lat: 41.8957, lng: 12.4722 },
      { name: "Castel Sant'Angelo", lat: 41.9031, lng: 12.4663 },
      { name: "Piazza San Pietro", lat: 41.9022, lng: 12.4572 },
      { name: "Musei Vaticani", lat: 41.9065, lng: 12.4536 },
      { name: "Fontana di Trevi", lat: 41.9009, lng: 12.4833 },
      { name: "Piazza di Spagna", lat: 41.9057, lng: 12.4823 },
      { name: "Villa Borghese", lat: 41.9128, lng: 12.4852 },
      { name: "Piazza del Popolo", lat: 41.9107, lng: 12.4764 }
    ]
  },
  paris: {
    displayName: "Paris",
    pois: [
      { name: "Tour Eiffel", lat: 48.8584, lng: 2.2945 },
      { name: "Champ de Mars", lat: 48.8556, lng: 2.2986 },
      { name: "Trocadéro", lat: 48.8623, lng: 2.2881 },
      { name: "Arco di Trionfo", lat: 48.8738, lng: 2.2950 },
      { name: "Champs-Élysées", lat: 48.8698, lng: 2.3075 },
      { name: "Place de la Concorde", lat: 48.8655, lng: 2.3211 },
      { name: "Giardino delle Tuileries", lat: 48.8635, lng: 2.3274 },
      { name: "Louvre", lat: 48.8606, lng: 2.3376 },
      { name: "Pont Neuf", lat: 48.8571, lng: 2.3414 },
      { name: "Sainte-Chapelle", lat: 48.8554, lng: 2.3450 },
      { name: "Notre Dame", lat: 48.8530, lng: 2.3499 },
      { name: "Île Saint-Louis", lat: 48.8517, lng: 2.3563 },
      { name: "Panthéon", lat: 48.8462, lng: 2.3464 },
      { name: "Giardini del Lussemburgo", lat: 48.8462, lng: 2.3371 },
      { name: "Museo d'Orsay", lat: 48.8599, lng: 2.3265 },
      { name: "Opéra Garnier", lat: 48.8719, lng: 2.3316 },
      { name: "Sacré-Cœur", lat: 48.8867, lng: 2.3431 },
      { name: "Place du Tertre", lat: 48.8865, lng: 2.3408 }
    ]
  },
  london: {
    displayName: "London",
    pois: [
      { name: "Big Ben", lat: 51.5007, lng: -0.1246 },
      { name: "Westminster Abbey", lat: 51.4994, lng: -0.1273 },
      { name: "St. James's Park", lat: 51.5025, lng: -0.1348 },
      { name: "Buckingham Palace", lat: 51.5014, lng: -0.1419 },
      { name: "Piccadilly Circus", lat: 51.5101, lng: -0.1342 },
      { name: "Leicester Square", lat: 51.5104, lng: -0.1301 },
      { name: "Trafalgar Square", lat: 51.5080, lng: -0.1281 },
      { name: "National Gallery", lat: 51.5089, lng: -0.1286 },
      { name: "Covent Garden", lat: 51.5117, lng: -0.1240 },
      { name: "British Museum", lat: 51.5194, lng: -0.1270 },
      { name: "St. Paul's Cathedral", lat: 51.5138, lng: -0.0984 },
      { name: "Millennium Bridge", lat: 51.5103, lng: -0.0984 },
      { name: "Tate Modern", lat: 51.5076, lng: -0.0994 },
      { name: "Shakespeare's Globe", lat: 51.5081, lng: -0.0964 },
      { name: "The Shard", lat: 51.5045, lng: -0.0865 },
      { name: "Tower Bridge", lat: 51.5055, lng: -0.0754 },
      { name: "Tower of London", lat: 51.5081, lng: -0.0759 },
      { name: "London Eye", lat: 51.5033, lng: -0.1195 }
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

// Inizializzazione Google Maps
window.initMap = function() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  map = new google.maps.Map(mapElement, {
    zoom: 14,
    center: { lat: 41.8902, lng: 12.4922 },
    disableDefaultUI: false,
    styles: [
      {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [{"color": "#334155"}]
      },
      {
        "featureType": "landscape",
        "elementType": "all",
        "stylers": [{"color": "#f1f5f9"}]
      },
      {
        "featureType": "water",
        "elementType": "all",
        "stylers": [{"color": "#e2e8f0"}]
      }
    ]
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#6366f1",
      strokeWeight: 6,
      strokeOpacity: 0.8
    }
  });
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

  btnGenerate.addEventListener("click", () => {
    const city = cityInput.value.toLowerCase().trim();
    const numDays = parseInt(daysInput.value);
    const template = CITY_TEMPLATES[city] || CITY_TEMPLATES.rome;
    
    // Distribuzione intelligente delle tappe
    const pois = [...template.pois];
    allStops = [];
    const perDay = Math.ceil(pois.length / numDays);
    
    for (let i = 0; i < numDays; i++) {
      allStops.push(pois.slice(i * perDay, (i + 1) * perDay));
    }

    currentDay = 1;
    renderTabs(numDays);
    loadDay(1);
    
    trackingStatus.textContent = "Itinerario pronto! Pronti a partire?";
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
    
    // Resetta distanze UI
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
          </div>
        </div>
        <span class="stop-status">${s.reached ? '✅' : '⏳'}</span>
      </li>
    `).join("");
    
    btnStart.disabled = stops.length < 1;
  }

  function calculateAndDisplayRoute() {
    if (!directionsService || stops.length < 2) return;

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
    const waypoints = stops.slice(1, -1).map(s => ({
      location: { lat: s.lat, lng: s.lng },
      stopover: true
    }));

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
    markers = stops.map((s, i) => {
      const isCurrent = i === currentLegIndex;
      const isReached = s.reached;
      
      return new google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: map,
        label: {
          text: (i + 1).toString(),
          color: "white",
          fontWeight: "bold"
        },
        title: s.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: isReached ? "#10b981" : (isCurrent ? "#6366f1" : "#94a3b8"),
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "white",
          scale: 14
        }
      });
    });

    const bounds = new google.maps.LatLngBounds();
    stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds);
  }

  btnStart.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("GPS non supportato dal tuo browser.");

    trackingStatus.textContent = "Navigazione attiva: segui la mappa!";
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
            trackingStatus.textContent = "Grande! Hai completato l'itinerario di oggi! 🎉";
            trackingStatus.className = "status-banner status-done";
            if (watchId) navigator.geolocation.clearWatch(watchId);
            btnStop.disabled = true;
          }
        }
      }
    }, (err) => {
      console.error("Errore GPS:", err);
      trackingStatus.textContent = "Errore GPS. Controlla i permessi.";
      trackingStatus.className = "status-banner status-neutral";
    }, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
  });

  btnStop.addEventListener("click", () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    trackingStatus.textContent = "Navigazione sospesa.";
    trackingStatus.className = "status-banner status-neutral";
    btnStart.disabled = false;
    btnStop.disabled = true;
  });
});

// Database Itinerari
const CITY_TEMPLATES = {
  rome: { displayName: "Roma", pois: [
    { name: "Colosseo", lat: 41.8902, lng: 12.4922 }, { name: "Foro Romano", lat: 41.8925, lng: 12.4853 },
    { name: "Pantheon", lat: 41.8986, lng: 12.4769 }, { name: "Piazza Navona", lat: 41.8992, lng: 12.4731 }
  ]},
  paris: { displayName: "Paris", pois: [
    { name: "Tour Eiffel", lat: 48.8584, lng: 2.2945 }, { name: "Louvre", lat: 48.8606, lng: 2.3376 },
    { name: "Notre Dame", lat: 48.8530, lng: 2.3499 }
  ]},
  london: { displayName: "London", pois: [
    { name: "Big Ben", lat: 51.5007, lng: -0.1246 }, { name: "London Eye", lat: 51.5033, lng: -0.1195 },
    { name: "Trafalgar Square", lat: 51.5080, lng: -0.1281 }
  ]}
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

// Inizializzazione Google Maps (deve essere globale per il callback)
window.initMap = function() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  map = new google.maps.Map(mapElement, {
    zoom: 14,
    center: { lat: 41.8902, lng: 12.4922 },
    disableDefaultUI: false,
    mapId: "DEMO_MAP_ID" 
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: { strokeColor: "#6366f1", strokeWeight: 6, strokeOpacity: 0.8 }
  });
  
  console.log("Google Maps caricato correttamente.");
};

// UI Elements
document.addEventListener("DOMContentLoaded", () => {
  const cityInput = document.getElementById("city-input");
  const daysInput = document.getElementById("days-input");
  const btnGenerate = document.getElementById("generate-city-itinerary");
  const stopsList = document.getElementById("stops-list");
  const daysTabsContainer = document.getElementById("days-tabs");
  const btnStart = document.getElementById("start-tracking");
  const trackingStatus = document.getElementById("tracking-status");

  btnGenerate.addEventListener("click", () => {
    const city = cityInput.value.toLowerCase();
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
    trackingStatus.textContent = "Itinerario generato. Avvia la navigazione!";
  });

  function renderTabs(n) {
    daysTabsContainer.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const btn = document.createElement("button");
      btn.className = `day-tab ${i === 1 ? 'active' : ''}`;
      btn.textContent = `Giorno ${i}`;
      btn.onclick = () => {
        document.querySelectorAll(".day-tab").forEach(t => t.classList.remove("active"));
        btn.classList.add("active");
        loadDay(i);
      };
      daysTabsContainer.appendChild(btn);
    }
  }

  function loadDay(day) {
    stops = (allStops[day-1] || []).map(s => ({...s, reached: false}));
    currentLegIndex = 0;
    renderStopsList();
    calculateAndDisplayRoute();
  }

  function renderStopsList() {
    stopsList.innerHTML = stops.map((s, i) => `
      <li class="stop-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
        <span>${i+1}. ${s.name}</span>
        <span>${s.reached ? '✅' : '⏳'}</span>
      </li>
    `).join("");
    btnStart.disabled = stops.length < 2;
  }

  function calculateAndDisplayRoute() {
    if (!directionsService || stops.length < 2) return;

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length-1].lat, lng: stops[stops.length-1].lng };
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
      label: (i + 1).toString(),
      title: s.name
    }));
    
    const bounds = new google.maps.LatLngBounds();
    stops.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds);
  }

  btnStart.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("GPS non supportato");

    trackingStatus.textContent = "Navigazione attiva...";
    btnStart.disabled = true;
    document.getElementById("stop-tracking").disabled = false;

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
          if (currentLegIndex >= stops.length) {
            trackingStatus.textContent = "Itinerario completato! 🎉";
          }
        }
      }
    }, null, { enableHighAccuracy: true });
  });

  document.getElementById("stop-tracking").addEventListener("click", () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    trackingStatus.textContent = "Navigazione sospesa.";
    btnStart.disabled = false;
  });
});
