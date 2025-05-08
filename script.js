import { getProfile } from "https://aipipe.org/aipipe.js";

const { token, email } = getProfile();

if (!token)
  window.location = `https://aipipe.org/login?redirect=${window.location.href}`;

// Initialize map
const map = L.map("map").setView([20.5937, 78.9629], 4); // Center on India
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let marker = null;
let gadmData = null;

// Load GADM data
async function loadGadmData() {
  if (!gadmData) {
    try {
      const response = await fetch("data/gadm41_IND_1.json");
      gadmData = await response.json();
    } catch (error) {
      console.error("Failed to load GADM data:", error);
    }
  }
  return gadmData;
}

async function searchGadmRegion(name) {
  const data = await loadGadmData();
  if (!data) return null;

  // Case-insensitive search
  const searchName = name.toLowerCase();
  const feature = data.features.find(
    (f) => f.properties.NAME_1.toLowerCase() === searchName
  );

  if (!feature) return null;

  // Extract coordinates from MultiPolygon geometry
  const coordinates = [];
  if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        coordinates.push(...ring);
      });
    });
  } else if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates.forEach((ring) => {
      coordinates.push(...ring);
    });
  }

  // Calculate bounds from all coordinates
  const bounds = coordinates.reduce(
    (acc, coord) => {
      const [lon, lat] = coord;
      return {
        north: Math.max(acc.north, lat),
        south: Math.min(acc.south, lat),
        east: Math.max(acc.east, lon),
        west: Math.min(acc.west, lon),
      };
    },
    {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    }
  );

  return {
    feature,
    coordinates,
    boundingBox: bounds,
  };
}

// DOM elements
const queryInput = document.getElementById("query-input");
const searchBtn = document.getElementById("search-btn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error-message");
const resultEl = document.getElementById("result");
const locationNameEl = document.getElementById("location-name");
const coordinatesEl = document.getElementById("coordinates");
const optionsContainerEl = document.getElementById("options-container");
const reasoningEl = document.getElementById("reasoning");
const optionsEl = document.getElementById("options");
const finalAnswerEl = document.getElementById("final-answer");
const finalAnswerContentEl = document.getElementById("final-answer-content");

// Event listeners
searchBtn.addEventListener("click", handleSearch);
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSearch();
});

async function handleSearch() {
  const query = queryInput.value.trim();
  if (!query) return;

  // Reset UI
  loadingEl.classList.remove("d-none");
  resultEl.classList.add("d-none");
  errorEl.classList.add("d-none");
  optionsContainerEl.classList.add("d-none");

  try {
    // Get options and reasoning from LLM
    const llmResponse = await getOptionsFromLLM(query);

    // Display reasoning and options
    reasoningEl.textContent = llmResponse.reasoning;
    optionsEl.innerHTML = "";

    // First, show all options with confidence bars
    llmResponse.options.forEach((option, index) => {
      const optionCard = document.createElement("div");
      optionCard.className = "col-12 mb-3";
      optionCard.innerHTML = `
        <div class="card option-card position-relative">
          <div class="card-body">
            <h6 class="card-title">Option ${index + 1}</h6>
            <p class="card-text">${option.description}</p>
            <div class="confidence-bar">
              <div class="confidence-bar-fill" style="width: ${
                option.confidence * 100
              }%"></div>
            </div>
            <small class="text-muted mt-1 d-block">Confidence: ${(
              option.confidence * 100
            ).toFixed(1)}%</small>
          </div>
        </div>
      `;
      optionsEl.appendChild(optionCard);
    });

    // Show options container
    optionsContainerEl.classList.remove("d-none");

    // Wait a moment to let user see all options
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Then highlight the best option
    const bestOption = llmResponse.options[llmResponse.bestOptionIndex];
    document
      .querySelectorAll(".option-card")
      [llmResponse.bestOptionIndex].classList.add("selected");

    // Show final answer with explanation
    finalAnswerContentEl.innerHTML = `
      <p class="mb-3">${bestOption.explanation}</p>
      <div class="alert alert-light border mb-0">
        <small class="text-muted d-block mb-1">Search Parameters:</small>
        <strong>Type:</strong> ${bestOption.searchParams.searchType}<br>
        <strong>Query:</strong> ${bestOption.searchParams.query}
      </div>
    `;

    // Process the location based on type
    if (bestOption.searchParams.searchType === "region") {
      // Try GADM first
      const gadmResult = await searchGadmRegion(bestOption.searchParams.query);
      if (gadmResult) {
        // Display the result with coordinate count
        locationNameEl.textContent =
          bestOption.searchParams.displayName ||
          gadmResult.feature.properties.NAME_1;
        coordinatesEl.textContent = `Region with ${
          gadmResult.coordinates.length
        } boundary points | Bounds: ${gadmResult.boundingBox.north.toFixed(
          4
        )}°N, ${gadmResult.boundingBox.west.toFixed(
          4
        )}°E to ${gadmResult.boundingBox.south.toFixed(
          4
        )}°S, ${gadmResult.boundingBox.east.toFixed(4)}°E`;
        resultEl.classList.remove("d-none");

        // Clear existing layers
        if (marker) {
          map.removeLayer(marker);
          marker = null;
        }
        map.eachLayer((layer) => {
          if (layer instanceof L.Rectangle || layer instanceof L.GeoJSON) {
            map.removeLayer(layer);
          }
        });

        // Add GeoJSON layer with hover effects
        const geoJsonLayer = L.geoJSON(gadmResult.feature, {
          style: {
            color: "#FFA500",
            weight: 2,
            fillOpacity: 0.15,
            fillColor: "#FFA500",
          },
          onEachFeature: (feature, layer) => {
            layer.on({
              mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({
                  fillOpacity: 0.3,
                });
              },
              mouseout: (e) => {
                const layer = e.target;
                layer.setStyle({
                  fillOpacity: 0.15,
                });
              },
            });
            layer.bindPopup(`
              <b>${feature.properties.NAME_1}</b><br>
              Type: ${feature.properties.TYPE_1 || "Region"}<br>
            `);
          },
        }).addTo(map);

        // Fit map to the region bounds
        map.fitBounds(geoJsonLayer.getBounds());
      } else {
        // Fallback to OpenStreetMap for regions
        const osmResult = await searchOpenStreetMap(bestOption.searchParams);
        if (osmResult.boundingBox) {
          updateMapWithBounds(osmResult.boundingBox);
          locationNameEl.textContent = osmResult.displayName;
          coordinatesEl.textContent = `Region bounds: ${osmResult.boundingBox.north.toFixed(
            4
          )}°N, ${osmResult.boundingBox.west.toFixed(
            4
          )}°E to ${osmResult.boundingBox.south.toFixed(
            4
          )}°S, ${osmResult.boundingBox.east.toFixed(4)}°E`;
          resultEl.classList.remove("d-none");
        }
      }
    } else {
      // For cities and POIs, use OpenStreetMap with appropriate zoom levels
      const osmResult = await searchOpenStreetMap(bestOption.searchParams);
      const zoomLevel = bestOption.searchParams.searchType === "city" ? 12 : 15; // Zoom in more for POIs
      updateMap(
        osmResult.latitude,
        osmResult.longitude,
        osmResult.displayName,
        zoomLevel
      );
      locationNameEl.textContent = osmResult.displayName;
      coordinatesEl.textContent = `${osmResult.latitude.toFixed(
        4
      )}°N, ${osmResult.longitude.toFixed(4)}°E`;
      resultEl.classList.remove("d-none");
    }
  } catch (error) {
    console.error("Search error:", error);
    errorEl.textContent =
      error.message || "An error occurred while processing your query";
    errorEl.classList.remove("d-none");
  } finally {
    loadingEl.classList.add("d-none");
  }
}

async function getOptionsFromLLM(query) {
  const response = await fetch(
    "https://aipipe.org/openrouter/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content: `You are a geographical assistant for India. When given a location query, analyze it and provide 3 possible interpretations with reasoning. Your response should be ONLY a JSON object in this format:
{
  "type": "object",
  "properties": {
    "reasoning": {
      "type": "string"
    },
    "bestOptionIndex": {
      "type": "integer"
    },
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string"
          },
          "explanation": {
            "type": "string"
          },
          "confidence": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0
          },
          "searchParams": {
            "type": "object",
            "properties": {
              "searchType": {
                "type": "string",
                "enum": [
                  "city",
                  "region",
                  "poi"
                ]
              },
              "query": {
                "type": "string"
              },
              "boundingBox": {
                "type": "object",
                "properties": {
                  "north": {
                    "type": "number"
                  },
                  "south": {
                    "type": "number"
                  },
                  "east": {
                    "type": "number"
                  },
                  "west": {
                    "type": "number"
                  }
                },
                "required": ["north", "south", "east", "west"]
              },
              "displayName": {
                "type": "string"
              }
            },
            "required": ["searchType", "query", "boundingBox", "displayName"]
          }
        },
        "required": ["description", "explanation", "confidence", "searchParams"]
      },
      "minItems": 1,
      "uniqueItems": true
    }
  },
  "required": ["reasoning", "bestOptionIndex", "options"]
}
          Sort options by confidence and set bestOptionIndex to the index of the highest confidence option.`,
          },
          { role: "user", content: query },
        ],
      }),
    }
  ).then((r) => r.json());

  const content = response.choices?.[0]?.message?.content;
  console.log(content);
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
    throw new Error("Failed to parse options from LLM response");
  }
}

async function searchOpenStreetMap(params) {
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.append("format", "json");
  nominatimUrl.searchParams.append("q", params.query);
  nominatimUrl.searchParams.append("limit", "1");

  const response = await fetch(nominatimUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "GeoFinder/1.0",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch from OpenStreetMap");
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error("Location not found");
  }

  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    boundingBox: data[0].boundingbox
      ? {
          south: parseFloat(data[0].boundingbox[0]),
          north: parseFloat(data[0].boundingbox[1]),
          west: parseFloat(data[0].boundingbox[2]),
          east: parseFloat(data[0].boundingbox[3]),
        }
      : null,
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
    padding: [50, 50],
  });

  // Show the region bounds with a semi-transparent fill
  L.rectangle(mapBounds, {
    color: "#FFA500",
    weight: 2,
    fillOpacity: 0.15,
  }).addTo(map);
}
