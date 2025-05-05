import { getProfile } from "https://aipipe.org/aipipe.js";

const { token, email } = getProfile();

if (!token)
  window.location = `https://aipipe.org/login?redirect=${window.location.href}`;
// Initialize map
const map = L.map("map").setView([0, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let marker = null;

// DOM elements
const queryInput = document.getElementById("query-input");
const searchBtn = document.getElementById("search-btn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error-message");
const resultEl = document.getElementById("result");
const locationNameEl = document.getElementById("location-name");
const coordinatesEl = document.getElementById("coordinates");

// Event listeners
searchBtn.addEventListener("click", handleSearch);
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSearch();
});

async function handleSearch() {
  const query = queryInput.value.trim();
  if (!query) return;

  loadingEl.classList.remove("d-none");
  resultEl.classList.add("d-none");
  errorEl.classList.add("d-none");

  try {
    // Get search parameters from LLM
    const searchParams = await getLocationFromLLM(query);
    
    // Search OpenStreetMap with the parameters
    const locationData = await searchOpenStreetMap(searchParams);

    // Display the result
    locationNameEl.textContent = searchParams.displayName || locationData.displayName;
    coordinatesEl.textContent = `${locationData.latitude}, ${locationData.longitude}`;
    resultEl.classList.remove("d-none");

    // Update map based on search type
    if (searchParams.searchType === 'region' && locationData.boundingBox) {
      updateMapWithBounds(locationData.boundingBox);
    } else {
      // For cities and POIs, zoom to the point
      const zoomLevel = searchParams.searchType === 'city' ? 12 : 15; // cities less zoomed than POIs
      updateMap(locationData.latitude, locationData.longitude, searchParams.displayName || locationData.displayName, zoomLevel);
    }
  } catch (error) {
    console.error("Error:", error);
    errorEl.textContent = error.message || "Something went wrong. Please try again.";
    errorEl.classList.remove("d-none");
  } finally {
    loadingEl.classList.add("d-none");
  }
}

async function getLocationFromLLM(query) {
  const response = await fetch("https://aipipe.org/openrouter/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      "model": "openai/gpt-4.1-nano",
      "messages": [
        {
          "role": "system",
          "content": `You are a geographical assistant. Based on the user's query, provide OpenStreetMap API parameters in JSON format. For cities/regions, include the search parameters. Your response should be ONLY a JSON object in this format:
          {
            "searchType": "city|region|poi", // type of search
            "query": "search query for nominatim",
            "boundingBox": { // only for regions
              "north": 00.0000,
              "south": 00.0000,
              "east": 00.0000,
              "west": 00.0000
            },
            "displayName": "human readable name"
          }`
        },
        { "role": "user", "content": query }
      ]
    })
  }).then(r => r.json());

  const content = response.choices?.[0]?.message?.content;
  console.log(content)
  if (!content) {
    throw new Error("Empty response from LLM");
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No valid JSON found in response");
    }
  } catch (error) {
    console.error("Parsing error:", error, "Raw content:", content);
    throw new Error("Failed to parse location data from LLM response");
  }
}

async function searchOpenStreetMap(params) {
  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.searchParams.append('format', 'json');
  nominatimUrl.searchParams.append('q', params.query);
  nominatimUrl.searchParams.append('limit', '1');

  const response = await fetch(nominatimUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'GeoFinder/1.0'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch from OpenStreetMap');
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error('Location not found');
  }

  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    boundingBox: data[0].boundingbox ? {
      south: parseFloat(data[0].boundingbox[0]),
      north: parseFloat(data[0].boundingbox[1]),
      west: parseFloat(data[0].boundingbox[2]),
      east: parseFloat(data[0].boundingbox[3])
    } : null
  };
}

function updateMap(lat, lon, name, zoomLevel = 10) {
  // Convert coordinates to numbers to ensure they're valid
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error("Invalid coordinates");
  }

  // Remove any existing markers or rectangles
  if (marker) {
    map.removeLayer(marker);
  }
  map.eachLayer((layer) => {
    if (layer instanceof L.Rectangle) {
      map.removeLayer(layer);
    }
  });

  // Update map view with specified zoom
  map.setView([latitude, longitude], zoomLevel);

  // Add new marker
  marker = L.marker([latitude, longitude])
    .addTo(map)
    .bindPopup(`<b>${name}</b><br>Lat: ${latitude}, Lon: ${longitude}`)
    .openPopup();
}

function updateMapWithBounds(bounds) {
  // Remove any existing markers or rectangles
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
  map.eachLayer((layer) => {
    if (layer instanceof L.Rectangle) {
      map.removeLayer(layer);
    }
  });

  const corner1 = L.latLng(bounds.north, bounds.west);
  const corner2 = L.latLng(bounds.south, bounds.east);
  const mapBounds = L.latLngBounds(corner1, corner2);
  
  // Add padding to the bounds for better visibility
  map.fitBounds(mapBounds, {
    padding: [50, 50]
  });
  
  // Show the region bounds with a semi-transparent fill
  L.rectangle(mapBounds, {
    color: "#ff7800",
    weight: 2,
    fillOpacity: 0.15
  }).addTo(map);
}
