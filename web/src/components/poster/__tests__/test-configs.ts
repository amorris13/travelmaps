import type { PosterConfig } from "@lib/types";
import { ACCENT_COLOR } from "@lib/constants";

// Real polylines from travels.json to ensure connected stages and valid locations.
// p1: Bangkok -> Chiang Mai
const p1 = "ax}rAagldRayu]|dgH";
// p2: Chiang Mai -> Chiang Khong
const p2 = "irtqBaad{QlAe`@`@_LsOcCsKs@~JQ[i^qJv@wOw`@gWqm@yv@ynA_|C_lE{uA}lCw|AylEgl@w_Bai@ix@ahAw|Co`@iy@cBeb@iOuJyCga@zG_N{[_l@^_Qwg@mhAa^afAkLwi@_Xwn@w\\y`@w[fJgZdEsOaEmh@pJa_Ah`@i[eUaXnCiM}ImXuXsTyd@mVoj@uQwMen@ys@qh@ip@}Mec@}RmM}Tae@m_@{OefAglAiS{l@wj@qz@ukAuaAiOis@oi@kw@mXc[}EoVeSgEsLaa@wN_`@uW}l@uJen@_v@opAgQuL\\qSa\\}Hu]ocAuE}VwWul@yKckA}]mqAm_@cJ{ToUyE}PgP_I{Rod@eZw\\sGi\\pGuR{]wq@gR{i@cTmNqp@oAib@mQybC}n@a|@d@gZpD_YuIqVuYot@qd@gaAmIqvAlDgpBlR}gBjG}nApCqtIsEyhCxX}~Bv]cnB~Foh@Y_}BlNqtBwF}aAK{^~L{s@bM}UjKcHfTol@dQce@bU{lCh~@}l@Vix@_MmaAsRmb@ySubAq\\mf@mXew@wDc|BXcl@nAmk@eSicA{gAijBmMsW}^k]oW_v@hRy]_Y}c@sn@iUkm@_e@eXsz@qcAqn@{OeJ{IjEe_@zEsMkc@cVaG}J_K|CmK`EqQdNqJmF_D{`@}_@}K`F_OoE}Q}]c[{D{Suc@bAeNiTcK]_[kRqA{WmQsW}Zuj@w|@cgAsC{d@qSen@qJa^a]gr@qWec@gGuj@jSeb@qGylAeJcN`Fch@MwpCsEq}AhEiQ_VwOuu@w\\iu@}Na`B{k@c~BcaAsiA_^ss@}g@k_@_jAs|@ovAa_AynB}AqpAaT_dAmd@aa@iHiOfk@mm@d_@ikAnk@}kAgRyq@uYsi@gl@yQpF_q@tQqq@x[ulArb@k~AhXkdAtJ{dA_AgbCuBi_A{V}b@ew@m_@cx@i{@gXi_@oFyh@aC{lCc\\my@_v@e_@{Y}NiKcYqEaXaDs}@uSss@wLqtA|@sbAhGqxAf^uu@tMgdAuKmkAud@_fF}TalCm@{jDxP{nEvE}xAkYsD_bBeNse@qHk]c]oj@w^q\\{I_a@aP}n@xC}tAeTkqA{b@gmAor@ggAeaA_dAcu@q\\ck@ydB{fBqpAwx@aa@iDws@_g@}]{Vqe@qHo}@oJgfA}H}a@}Buh@m[aj@kZki@uh@_`A{t@g}@kEef@ng@cdA~e@_wAfMa`EhNor@tMk_AaEih@g@gc@nBmZkGsqAge@k\\n@uUvLaRdPwNoDwL~@_TfIHjB";
// p3: Chiang Khong -> Pakbeng (connected to p2)
const p3 = "e}tzBygycRplfAe_oC";

export const testConfigs: Record<string, PosterConfig> = {
  single_stage: {
    title: "Bangkok to Chiang Mai",
    dateRange: "January 1, 2024",
    accentColor: ACCENT_COLOR,
    fontFamily: "Helvetica Neue",
    mapStyle: "muted",
    showElevation: true,
    showStageTable: false,
    units: "metric",
    showSeconds: false,
    stages: [
      {
        activityId: "1",
        activityType: "Ride",
        name: "Stage 1",
        startLabel: "Bangkok",
        endLabel: "Chiang Mai",
        polyline: p1,
        distance: 12000,
        movingTime: 1800,
        elevationGain: 200,
        averageSpeed: 6.6,
        elevationStream: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        distanceStream: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],
      },
    ],
    additionalLocations: [],
  },
  multi_stage: {
    title: "Thailand Journey",
    dateRange: "July 1 - July 5, 2024",
    accentColor: "#3498db",
    fontFamily: "Helvetica Neue",
    mapStyle: "muted",
    showElevation: true,
    showStageTable: true,
    units: "metric",
    showSeconds: false,
    stages: [
      {
        activityId: "s1",
        activityType: "Ride",
        name: "Bangkok Stage",
        startLabel: "Bangkok",
        endLabel: "Chiang Mai",
        polyline: p1,
        distance: 85000,
        movingTime: 14400,
        elevationGain: 1200,
        averageSpeed: 5.9,
        elevationStream: [400, 500, 600, 700, 800, 900, 1000, 1100, 1000, 900, 800],
        distanceStream: [0, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 85000],
      },
      {
        activityId: "s2",
        activityType: "Ride",
        name: "Mountain Stage",
        startLabel: "Chiang Mai",
        endLabel: "Chiang Khong",
        polyline: p2,
        distance: 45000,
        movingTime: 10800,
        elevationGain: 1500,
        averageSpeed: 4.2,
        elevationStream: [1000, 1200, 1500, 2000, 1800, 1500, 1000, 800, 600, 400],
        distanceStream: [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000],
      },
      {
        activityId: "s3",
        activityType: "Ride",
        name: "River Stage",
        startLabel: "Chiang Khong",
        endLabel: "Pakbeng",
        polyline: p3,
        distance: 30000,
        movingTime: 7200,
        elevationGain: 300,
        averageSpeed: 4.1,
        elevationStream: [400, 410, 420, 430, 440, 450],
        distanceStream: [0, 6000, 12000, 18000, 24000, 30000],
      },
    ],
    additionalLocations: [
      { name: "Mekong River", lat: 20.2646, lng: 100.4046 },
    ],
  },
  minimal: {
    title: "Quick Link",
    dateRange: "",
    accentColor: "#2ecc71",
    fontFamily: "Helvetica Neue",
    mapStyle: "muted",
    showElevation: false,
    showStageTable: false,
    units: "metric",
    showSeconds: false,
    stages: [
      {
        activityId: "m1",
        activityType: "Walk",
        name: "Walk",
        startLabel: "",
        endLabel: "Home",
        polyline: "izreFvfbjVdH`B",
        distance: 500,
        movingTime: 300,
        elevationGain: 5,
        averageSpeed: 1.6,
        elevationStream: [5, 5, 5],
        distanceStream: [0, 250, 500],
      },
    ],
    additionalLocations: [],
  },
};
