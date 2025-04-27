import fs from "fs";
import path from "path";

const travelsFilePath = path.resolve(process.cwd(), "travels.json"); // Use absolute path

try {
  // 1. Read the travels.json file
  const travelsData = fs.readFileSync(travelsFilePath, "utf8");

  // 2. Parse the JSON data
  const travels = JSON.parse(travelsData);

  // 3. Iterate and refactor each trip and its stages
  const refactoredTravels = travels.map((trip) => {
    if (!trip.stages || !Array.isArray(trip.stages)) {
      console.warn(`Trip "${trip.name}" has no valid stages array. Skipping.`);
      return trip; // Skip trips without a valid stages array
    }

    const refactoredStages = trip.stages.map((stage) => {
      // Check if refactoring is needed (avoids re-refactoring)
      if (stage.endLocation) {
        return stage;
      }

      // Create the endLocation object
      const endLocation = {
        name: stage.name, // Always required according to previous schema
      };

      // Move geocodeName if it exists
      if (stage.geocodeName) {
        endLocation.geocodeName = stage.geocodeName;
      }

      // Move latlng if it exists
      if (stage.latlng) {
        endLocation.latlng = { ...stage.latlng }; // Copy latlng object
      }

      // Create a new stage object without the old properties
      const newStage = { ...stage };
      delete newStage.name;
      delete newStage.geocodeName;
      delete newStage.latlng;

      // Add the endLocation property
      newStage.endLocation = endLocation;

      return newStage;
    });

    // Return the trip with refactored stages
    return {
      ...trip,
      stages: refactoredStages,
    };
  });

  // 4. Convert the refactored data back to JSON
  const updatedTravelsData = JSON.stringify(refactoredTravels, null, 2); // Pretty print with 2 spaces

  // 5. Write the updated data back to travels.json
  fs.writeFileSync(travelsFilePath, updatedTravelsData, "utf8");

  console.log(`Successfully refactored stages in ${travelsFilePath}`);
} catch (error) {
  console.error("Error processing travels.json:", error);
  if (error instanceof SyntaxError) {
    console.error("This might be due to invalid JSON format in the file.");
  } else if (error.code === "ENOENT") {
    console.error(`File not found: ${travelsFilePath}`);
  }
}
