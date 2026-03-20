/**
 * Realistic test fixtures for visual tests.
 * Contains trip data with real-world coordinates and encoded polylines
 * from actual travel routes (SE Asia, Europe, UK).
 */
import type { Trip, Stage } from "../types";

// --- Helper to build stages with required fields ---
function stage(
  name: string,
  lat: number,
  lng: number,
  opts?: Partial<Stage>
): Stage {
  return {
    endLocation: { name, latlng: { lat, lng } },
    ...opts,
  };
}

// --- SE Asia Trip: Bangkok -> Chiang Mai -> Chiang Khong -> Luang Prabang ---
export const seAsiaTrip: Trip = {
  name: "SE Asia",
  startDate: "2024-11-26",
  endDate: "2024-12-24",
  hideLabel: false,
  stages: [
    stage("Bangkok", 13.7563, 100.5018),
    stage("Chiang Mai", 18.7883, 98.9853, {
      mode: "flying",
      polyline: "ax}rAagldRayu]|dgH",
    }),
    stage("Chiang Khong", 20.2647, 100.4046, {
      mode: "driving",
      polyline:
        "irtqBaad{QlAe`@`@_LsOcCsKs@~JQ[i^qJv@wOw`@gWqm@yv@ynA_|C_lE{uA}lCw|AylEgl@w_Bai@ix@ahAw|Co`@iy@cBeb@iOuJyCga@zG_N{[_l@^_Qwg@mhAa^afAkLwi@_Xwn@w\\y`@w[fJgZdEsOaEmh@pJa_Ah`@i[eUaXnCiM}ImXuXsTyd@mVoj@uQwMen@ys@qh@ip@}Mec@}RmM}Tae@m_@{OefAglAiS{l@wj@qz@ukAuaAiOis@oi@kw@mXc[}EoVeSgEsLaa@wN_`@uW}l@uJen@_v@opAgQuL",
    }),
    stage("Pakbeng", 19.899, 101.1419, {
      mode: "boat",
      polyline: "e}tzBygycRplfAe_oC",
    }),
    stage("Luang Prabang", 19.8833, 102.1387, {
      mode: "boat",
      polyline: "somxB_hihR`aB_uaE",
    }),
    stage("Hanoi", 21.0278, 105.8342, {
      mode: "flying",
      polyline: "qmjxB_~knR}o~EowpU",
    }),
  ],
};

// --- UK Road Trip: London -> Oxford -> Bath -> Bristol ---
export const ukTrip: Trip = {
  name: "UK Road Trip",
  startDate: "2024-06-15",
  endDate: "2024-06-20",
  hideLabel: false,
  stages: [
    stage("London", 51.5074, -0.1278),
    stage("Oxford", 51.752, -1.2577, {
      mode: "driving",
      // Approximate polyline London to Oxford via M40
      polyline:
        "_{xyHnlYfiBzpH~yAfsGncBrtDvlAdoCf}@~jCzg@tmBt_@v|Afs@rkBhaBr|Cvp@~aA",
    }),
    stage("Bath", 51.3811, -2.3590, {
      mode: "driving",
      polyline:
        "_{oyHhyc@rm@v~Dv[dxBxg@pyBviBpxEhqAvgC~e@d_CvRlzA",
    }),
    stage("Bristol", 51.4545, -2.5879, {
      mode: "driving",
      polyline: "yxiyHhnhDc_AplC{v@rnA",
    }),
  ],
};

// --- Europe Trip: Paris -> Amsterdam -> Berlin -> Prague ---
export const europeTrip: Trip = {
  name: "Europe 2024",
  startDate: "2024-03-10",
  endDate: "2024-03-25",
  hideLabel: false,
  stages: [
    stage("Paris", 48.8566, 2.3522),
    stage("Amsterdam", 52.3676, 4.9041, {
      mode: "flying",
      polyline: "aoh_Hm_dMwkkHwcuA",
    }),
    stage("Berlin", 52.52, 13.405, {
      mode: "flying",
      polyline: "g`ngI{xcfBbpCsbxN",
    }),
    stage("Prague", 50.0755, 14.4378, {
      mode: "flying",
      polyline: "shk~Ik_fpBhluDbimC",
    }),
  ],
};

// --- Walking trip with Strava-like elevation data (simulated) ---
export const hikingTrip: Trip = {
  name: "Lake District Hike",
  startDate: "2024-08-10",
  endDate: "2024-08-12",
  hideLabel: false,
  stages: [
    stage("Keswick", 54.6013, -3.1347),
    stage("Catbells Summit", 54.5719, -3.1686, {
      mode: "walking",
      // Approximate polyline Keswick to Catbells
      polyline: "oay{I`maHhm@v{@tg@~lAhy@bcA",
      strava_data: {
        name: "Catbells Walk",
        distance: 4200,
        moving_time: 5400,
        total_elevation_gain: 410,
        max_elevation: 451,
        distance_stream: "0,200,400,600,800,1000,1200,1400,1600,1800,2000,2200,2400,2600,2800,3000,3200,3400,3600,3800,4000,4200",
        elevation_stream: "80,95,120,155,200,245,280,320,350,380,410,440,451,430,390,340,290,240,190,145,110,85",
      },
    }),
    stage("Buttermere", 54.5416, -3.2786, {
      mode: "walking",
      polyline: "cyr{Ij}cHx_AlyBhqA~rA",
      strava_data: {
        name: "Catbells to Buttermere",
        distance: 8500,
        moving_time: 10800,
        total_elevation_gain: 520,
        max_elevation: 480,
        distance_stream: "0,500,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500",
        elevation_stream: "451,380,320,280,250,300,380,440,480,460,400,340,280,220,180,150,120,100",
      },
    }),
  ],
};

// --- Home location for overview tests ---
export const homeTrip: Trip = {
  name: "Home",
  startDate: "2020-01-01",
  endDate: "2025-12-31",
  hideLabel: false,
  isHome: true,
  stages: [stage("London", 51.5074, -0.1278)],
};

// --- Australia trip for world overview ---
export const australiaTrip: Trip = {
  name: "Australia Visit",
  startDate: "2024-01-10",
  endDate: "2024-01-25",
  hideLabel: false,
  stages: [
    stage("Sydney", -33.8688, 151.2093),
    stage("Melbourne", -37.8136, 144.9631, {
      mode: "flying",
      polyline: "r{k}Eqcs{[~zzKnnb_@",
    }),
  ],
};

// --- All trips for overview generation ---
export const allTrips: Trip[] = [
  homeTrip,
  ukTrip,
  europeTrip,
  seAsiaTrip,
  hikingTrip,
  australiaTrip,
];

// --- Elevation test data: realistic hiking profile ---
export const sampleElevationData = {
  elevation: [
    80, 95, 120, 155, 200, 245, 280, 320, 350, 380, 410, 440, 451, 430, 390,
    340, 290, 240, 190, 145, 110, 85, 100, 150, 220, 310, 380, 440, 480, 460,
    400, 340, 280, 220, 180, 150, 120, 100,
  ],
  distance: [
    0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400,
    2600, 2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4700, 5200, 5700,
    6200, 6700, 7200, 7700, 8200, 8700, 9200, 9700, 10200, 10700, 11200,
    11700, 12200,
  ],
  stageMarkers: [
    { distance: 0, label: "1" },
    { distance: 4200, label: "2" },
  ],
};
