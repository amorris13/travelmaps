# Veloprint

A comprehensive tool for generating beautiful SVG Veloprint posters with support for multiple travel modes, regions, and Strava activity data integration.

## Features

- **Multi-Modal Travel Support**: Generate routes for walking, driving, bicycling, transit, flying, and boating
- **Geographic Regions**: Pre-configured regions for UK, Europe, Australia, and World overviews
- **Strava Integration**: Import activity data including GPS tracks, elevation profiles, and performance metrics
- **Static Map Backgrounds**: Optional Mapbox static map backgrounds for enhanced visualization
- **Smart Label Placement**: Intelligent label positioning to avoid overlaps
- **Route Visualization**: Polyline-based route rendering with different styles per travel mode
- **Overview Maps**: Generate both individual trip maps and yearly/regional overviews
- **Flexible Data Structure**: JSON-based configuration with comprehensive schema validation

## Quick Start

### Prerequisites

- Node.js 18+ 
- TypeScript
- API keys for Google Maps and optionally Mapbox and Strava

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your API keys:
   ```env
   # Required for Google Maps API (geocoding and directions)
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   
   # Required for Mapbox static maps (optional)
   MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   
   # Required for Strava activity data (optional)
   STRAVA_ACCESS_TOKEN=your_strava_access_token_here
   ```

### Basic Usage

```bash
# Generate data (geocoding, directions, Strava data)
npm run generate-data

# Generate SVG maps
npm run generate-svg -- --filename=travels.json

# Generate SVG maps with static map backgrounds
npm run generate-svg -- --filename=travels.json --staticmap=true

# Test Strava integration (requires STRAVA_ACCESS_TOKEN in .env)
npm run test-strava
```

## Data Structure

The system uses a JSON-based data structure defined in `trips_schema.json`. Here's the core structure:

### Trips
A trip represents a journey with a start and end date:

```json
{
  "name": "Europe 2013",
  "startDate": "2013-07-12",
  "endDate": "2014-08-04",
  "stages": [...],
  "isHome": false,
  "hideLabel": false,
  "hideOnOverview": false
}
```

### Stages
Each trip consists of stages representing individual legs of the journey:

```json
{
  "endLocation": {
    "name": "London",
    "latlng": {
      "lat": 51.5074,
      "lng": -0.1278
    }
  },
  "mode": "driving",
  "polyline": "encoded_polyline_string",
  "strava_activity_id": "1234567890",
  "hideLabel": false,
  "hidePolyline": false
}
```

### Travel Modes

The system supports various travel modes:

- **walking**: Walking routes
- **driving**: Car/bus routes  
- **bicycling**: Cycling routes
- **transit**: Public transportation
- **flying**: Air travel (straight lines)
- **boat**: Water travel (straight lines)

### Location Data

Locations can be specified with or without coordinates:

```json
{
  "name": "Paris",
  "geocodeName": "Paris, France", // Optional: specific geocoding query
  "latlng": {
    "lat": 48.8566,
    "lng": 2.3522
  }
}
```

## Strava Integration

### Setup

1. **Get a Strava Access Token:**
   - Go to https://www.strava.com/settings/api
   - Create a new application
   - Use the access token from your application

2. **Add the token to your `.env` file:**
   ```env
   STRAVA_ACCESS_TOKEN=your_strava_access_token_here
   ```

3. **Add Strava Activity IDs to your travels.json:**
   ```json
   {
     "mode": "bicycling",
     "strava_activity_id": "1234567890",
     "endLocation": {
       "name": "Destination"
     }
   }
   ```

### Data Retrieved

The system automatically fetches:
- Activity name, distance, time, elevation gain
- Average and max speeds
- Distance stream (comma-separated cumulative distance values)
- Elevation stream (comma-separated elevation values)
- Time stream (comma-separated time values)
- GPS track polyline (stored in the stage's polyline field)

## Map Generation

### Individual Trip Maps

Generate detailed maps for specific trips:

```bash
npm run generate-svg -- --filename=travels.json
```

This creates SVG files for each trip in the `output/` directory.

### Overview Maps

Generate regional and yearly overviews:

- **Regional Overviews**: UK, Europe, Australia, World
- **Yearly Overviews**: All trips from a specific year
- **With/Without Maps**: Choose between clean SVG or with static map backgrounds

### Static Map Backgrounds

Enable Mapbox static map backgrounds for enhanced visualization:

```bash
npm run generate-svg -- --filename=travels.json --staticmap=true
```

This requires a `MAPBOX_ACCESS_TOKEN` in your `.env` file.

## Advanced Features

### Label Placement

The system uses intelligent label placement algorithms to:
- Avoid label overlaps
- Position labels optimally around route points
- Handle multiple labels in dense areas
- Score placement quality for best results

### Route Styling

Different travel modes are styled differently:
- **Walking**: Dotted lines
- **Driving**: Solid lines
- **Bicycling**: Dashed lines
- **Transit**: Alternating dash-dot
- **Flying**: Arced lines
- **Boat**: Wavy lines

### Geographic Regions

Pre-configured regions with optimized bounds:

- **UK**: England, Scotland, Wales, Northern Ireland
- **Europe**: Continental Europe
- **Australia**: Australian continent
- **World**: Global overview

### Data Processing

The `generate_data.ts` script:

1. **Geocoding**: Converts location names to coordinates using Google Geocoding API
2. **Route Generation**: Creates polylines using Google Directions API
3. **Strava Integration**: Fetches activity data and GPS tracks
4. **Data Validation**: Ensures all required fields are present
5. **Sorting**: Orders trips chronologically

## Output Files

Generated files follow this naming convention:

- Individual trips: `{year}-{trip_name}.svg`
- Overview maps: `{year}-overview-{region}.svg`
- With static maps: `{year}-{trip_name}-withmap.svg`

Example outputs:
- `2017-norway.svg` - Individual Norway trip
- `2017-overview-europe.svg` - 2017 European overview
- `2017-norway-withmap.svg` - Norway trip with map background

## Configuration Options

### Stage Properties

- `hideLabel`: Hide location labels
- `hidePolyline`: Hide route lines
- `hideWaypoint`: Hide waypoint markers
- `dayStop`: Mark as overnight stop
- `partialAttendance`: Indicate partial participation
- `showWaypointOnOverview`: Show in overview maps

### Trip Properties

- `isHome`: Mark as home location
- `hideLabel`: Hide trip labels
- `hideOnOverview`: Exclude from overview maps

## API Requirements

### Google Maps API
- **Geocoding API**: Convert location names to coordinates
- **Directions API**: Generate route polylines
- **Required**: `GOOGLE_MAPS_API_KEY`

### Mapbox API (Optional)
- **Static Images API**: Background map tiles
- **Required**: `MAPBOX_ACCESS_TOKEN`

### Strava API (Optional)
- **Activities API**: Fetch activity data
- **Streams API**: Get GPS and performance data
- **Required**: `STRAVA_ACCESS_TOKEN`

## Development

### Scripts

- `npm run generate-data`: Process and enrich travel data
- `npm run generate-svg`: Create SVG maps
- `npm run test-strava`: Test Strava API integration
- `npm run build`: Compile TypeScript
- `npm run dev`: Watch mode for development

### Dependencies

Key libraries used:
- **SVG.js**: SVG manipulation and rendering
- **@mapbox/polyline**: Polyline encoding/decoding
- **sharp**: Image processing for static maps
- **simplify-js**: Path simplification
- **svg-intersections**: Label collision detection

## Troubleshooting

### Common Issues

1. **Missing API Keys**: Ensure all required environment variables are set
2. **Rate Limiting**: Google Maps API has usage limits
3. **Geocoding Failures**: Check location names and API quotas
4. **Strava Token Expiry**: Refresh access tokens periodically

### Error Handling

The system includes comprehensive error handling for:
- API failures and rate limits
- Invalid data formats
- Missing required fields
- Network connectivity issues

## License

This project is open source. See the license file for details. 