# GeoFinder - Interactive Location Search with LLM

GeoFinder is an intelligent location search interface that combines LLM capabilities with geographic data to provide accurate location interpretations in India.

## Features

- Interactive map interface using Leaflet.js
- LLM-powered location search with multiple interpretations
- Support for three location types:
  - Regions (States/UTs) using GADM data
  - Cities using OpenStreetMap (zoom level 12)
  - Points of Interest using OpenStreetMap (zoom level 15)
- Confidence visualization for each interpretation
- Automatic best option selection
- Region boundary visualization

## Usage

1. Enter a location query in the search box
2. The system will process your query and show multiple interpretations
3. Each interpretation includes:
   - Location type (Region/City/POI)
   - Confidence score
   - Geographic coordinates
4. Click on any interpretation to view it on the map
5. Region searches will highlight administrative boundaries

## For Developers

### Technical Stack

- Frontend: HTML, CSS, JavaScript
- Map Library: Leaflet.js
- Styling: Bootstrap 5
- LLM: GPT-4.1-nano via OpenRouter

### Data Sources

- GADM data (`gadm41_IND_1.json`) for Indian administrative regions
- OpenStreetMap for cities and POIs

### Project Structure

- `index.html`: Main application interface
- `script.js`: Core application logic
- `data/gadm41_IND_1.json`: GADM level 1 administrative data for India

### Key Components

- Split view interface with thinking side and map display
- Asynchronous data loading
- Fallback mechanisms for region searches
- Confidence-based option selection

### Setup

1. Clone the repository
2. Ensure you have the required API keys for OpenRouter
3. Open `index.html` in a web browser

### Dependencies

- Leaflet.js for map rendering
- Bootstrap 5 for UI components
- OpenRouter API access for LLM capabilities

## Notes

- The application is specifically designed for Indian geographic data
- GADM data is used for level 1 administrative divisions (states/UTs)
- OpenStreetMap serves as a fallback for regions and primary source for cities/POIs