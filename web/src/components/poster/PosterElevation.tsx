"use client";

import type { StageConfig } from "@lib/types";
import {
  computeElevationProfileFromStages,
  renderElevationProfileAsSvg,
} from "@lib/elevation";
import React, { useMemo } from "react";

interface PosterElevationProps {
  stages: StageConfig[];
  accentColor: string;
  y: number;
  width: number;
  height: number;
  units?: "metric" | "imperial";
  contentX?: number;
  contentWidth?: number;
}

export function PosterElevation(props: PosterElevationProps) {
  const isServer = typeof window === "undefined";
  if (isServer) {
    return <PosterElevationInternal {...props} isServer={true} />;
  }
  return <PosterElevationClient {...props} />;
}

function PosterElevationClient(props: PosterElevationProps) {
  const effectiveWidth = props.contentWidth !== undefined ? props.contentWidth : props.width;
  const profileData = useMemo(() => {
    return computeElevationProfileFromStages(
      props.stages,
      effectiveWidth,
      props.height,
      {
        labelProminentElevations: { minProminence: 250 },
        showKeyElevations: false,
        units: props.units,
      },
      props.accentColor
    );
  }, [props.stages, props.accentColor, effectiveWidth, props.height, props.units]);

  return <PosterElevationInternal {...props} profileData={profileData} isServer={false} />;
}

function PosterElevationInternal({
  accentColor,
  width,
  height,
  units,
  contentX,
  contentWidth,
  stages,
  profileData: passedProfileData,
  isServer
}: any) {
  const effectiveWidth = contentWidth !== undefined ? contentWidth : width;

  const profileData = isServer
    ? computeElevationProfileFromStages(
        stages,
        effectiveWidth,
        height,
        {
          labelProminentElevations: { minProminence: 250 },
          showKeyElevations: false,
          units,
        },
        accentColor
      )
    : passedProfileData;

  if (!profileData) return null;

  const effectiveX = contentX !== undefined ? contentX : 0;

  if (isServer) {
      // On server, render graphics as Data URI for Satori
      const graphicsSvg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(${effectiveX}, 0)">
            <defs>
              <linearGradient id="elevation-gradient-server" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${profileData.gradientStartColor}" />
                <stop offset="100%" stop-color="${profileData.gradientEndColor}" />
              </linearGradient>
            </defs>
            ${(profileData.gridlines || []).map((gy: number) => `
              <line x1="5" y1="${gy}" x2="${profileData.plotWidth + 5}" y2="${gy}" stroke="#e0e0e0" stroke-width="1" />
            `).join('')}
            ${(profileData.segmentPaths || []).map((seg: any) => `
              <path d="${seg.fillD}" fill="url(#elevation-gradient-server)" stroke="none" />
              <path d="${seg.pathD}" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            `).join('')}
            ${profileData.maxElevationTrianglePoints ? `
              <polygon points="${profileData.maxElevationTrianglePoints}" fill="${accentColor}" stroke="white" stroke-width="2" stroke-linejoin="round" />
            ` : ''}
          </g>
        </svg>
      `.trim();

      const graphicsDataUri = `data:image/svg+xml;base64,${Buffer.from(graphicsSvg).toString('base64')}`;

      return (
        <div style={{ display: "flex", width: `${width}px`, height: `${height}px`, position: "relative" }}>
          <img src={graphicsDataUri} style={{ display: "flex", width: "100%", height: "100%" }} />
          <div style={{ display: "flex", position: "absolute", left: `${effectiveX}px`, top: "0px", width: `${effectiveWidth}px`, height: `${height}px`, pointerEvents: "none" }}>
            {(profileData.prominentLabels || []).map((label: any, i: number) => (
               <div key={`p-${i}`} style={{ display: "flex", position: "absolute", left: `${label.x}px`, top: `${label.y}px`, transform: "translate(-50%, 0)", fontSize: "10px", fontFamily: "Montserrat", color: "#666" }}>
                 {label.label}
               </div>
            ))}
            {(profileData.stageMarkerPositions || []).map((marker: any, i: number) => (
               <div key={`s-${i}`} style={{ display: "flex", position: "absolute", left: `${(marker.x + marker.xNext) / 2}px`, top: `${profileData.plotOffsetY + profileData.plotHeight + 5}px`, transform: "translate(-50%, 0)", fontSize: "10px", fontFamily: "Montserrat", color: "#999" }}>
                 {marker.label}
               </div>
            ))}
          </div>
        </div>
      );
  }

  return (
    <div
      style={{
        display: "flex",
        width: `${width}px`,
        height: `${height}px`,
        position: "relative",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "flex" }}
      >
        <g transform={`translate(${effectiveX}, 0)`}>
          <defs>
            <linearGradient id="elevation-gradient-final" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={profileData.gradientStartColor} />
              <stop offset="100%" stopColor={profileData.gradientEndColor} />
            </linearGradient>
          </defs>

          {(profileData.gridlines || []).map((gy: number, i: number) => (
            <line key={`grid-${i}`} x1={5} y1={gy} x2={profileData.plotWidth + 5} y2={gy} stroke="#e0e0e0" strokeWidth={1} />
          ))}

          {(profileData.segmentPaths || []).map((seg: any, i: number) => (
            <g key={`seg-group-${i}`}>
              <path d={seg.fillD} fill="url(#elevation-gradient-final)" stroke="none" />
              <path d={seg.pathD} fill="none" stroke={accentColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}

          {profileData.maxElevationTrianglePoints && (
            <polygon points={profileData.maxElevationTrianglePoints} fill={accentColor} stroke="white" strokeWidth={2} strokeLinejoin="round" />
          )}
        </g>
      </svg>

      <div style={{ display: "flex", position: "absolute", left: `${effectiveX}px`, top: "0px", width: `${effectiveWidth}px`, height: `${height}px`, pointerEvents: "none" }}>
         {(profileData.prominentLabels || []).map((label: any, i: number) => (
            <div key={`p-${i}`} style={{
              display: "flex",
              position: "absolute",
              left: `${label.x}px`,
              top: `${label.y}px`,
              transform: "translate(-50%, 0)",
              fontSize: "10px",
              fontFamily: "Montserrat",
              color: "#666",
            }}>
              {label.label}
            </div>
         ))}
         {(profileData.stageMarkerPositions || []).map((marker: any, i: number) => (
            <div key={`s-${i}`} style={{
              display: "flex",
              position: "absolute",
              left: `${(marker.x + marker.xNext) / 2}px`,
              top: `${profileData.plotOffsetY + profileData.plotHeight + 5}px`,
              transform: "translate(-50%, 0)",
              fontSize: "10px",
              fontFamily: "Montserrat",
              color: "#999",
            }}>
              {marker.label}
            </div>
         ))}
      </div>
    </div>
  );
}
