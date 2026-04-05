import { renderPosterToSvg, renderSvgToPng } from "./web/src/lib/render-server.js";
import { testConfigs } from "./web/src/components/poster/__tests__/test-configs.js";
import fs from "fs";
import path from "path";

async function verify() {
  const config = testConfigs.multi_stage;
  console.log("Rendering multi_stage poster...");

  try {
    const svg = await renderPosterToSvg(config);
    fs.writeFileSync("verify_out.svg", svg);
    console.log("Saved verify_out.svg");

    const png = renderSvgToPng(svg, 1200);
    fs.writeFileSync("verify_out.png", png);
    console.log("Saved verify_out.png");
  } catch (err) {
    console.error("Verification failed:", err);
  }
}

verify();
