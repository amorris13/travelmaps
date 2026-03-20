// Re-export Poster as PosterSvg for the export workflow
// In future, this could be a server-side-only version that generates
// a complete SVG string (without React hooks) for high-res export.
export { Poster as PosterSvg } from "./Poster";
