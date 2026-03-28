import fs from 'fs';
const data = JSON.parse(fs.readFileSync('travels.json', 'utf8'));
const trip = data.find(t => t.name === 'Tauernradweg');
const stages = trip.stages.filter(s => s.polyline);
const result = stages.map(s => ({
  name: s.strava_data.name,
  polyline: s.polyline,
  distance: s.strava_data.distance,
  movingTime: s.strava_data.moving_time,
  elevationGain: s.strava_data.total_elevation_gain,
  averageSpeed: s.strava_data.average_speed,
  distanceStream: s.strava_data.distance_stream.split(',').map(Number),
  elevationStream: s.strava_data.elevation_stream.split(',').map(Number)
}));
fs.writeFileSync('extracted_trip.json', JSON.stringify(result, null, 2));
