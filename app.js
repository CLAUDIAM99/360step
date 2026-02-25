// === CONFIGURAZIONE GENERALE ===
const DISTANCE_THRESHOLD_METERS = 50;

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
