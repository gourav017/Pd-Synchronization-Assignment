import dotenv from "dotenv";
import type {
  PipedrivePerson,
  MappingItem,
  PipedriveSearchResult,
  PipedriveApiResponse,
} from "./types/pipedrive";
import inputData from "./mappings/inputData.json";
import mappings from "./mappings/mappings.json";

// Load environment variables from .env file
dotenv.config();

// Get API key and company domain from environment variables
const apiKey = process.env.PIPEDRIVE_API_KEY;
const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;

//Get a value from a nested object using a dot-notation path--->
// Example: getValuebyPath({ a: { b: "hello" } }, "a.b") => "hello"

function getValuebyPath(obj: Record<string, any>, path: string): any {
  const keys = path.split(".");

  let current = obj;

  for (const key of keys) {
    //case: if at any point the current value is null or not an object, stop
    if (current === null || current === undefined) {
      console.warn(`Path "${path}" could no be resolved`);
      return undefined;
    }

    current = current[key];
  }

  return current;
}

//Build the payload objectt  to send to Pipedrive--->
// It loops over the mappings array and maps inputData values to Pipedrive keys

function buildPipedrivePayload(
  mappingsList: MappingItem[],
): Record<string, any> {
  const payload: Record<string, any> = {};

  for (const mapping of mappingsList) {
    const pipedriveKey = mapping.pipedriveKey;
    const inputKey = mapping.inputKey;

    // Get the value from inputdata using the dot-notation path
    const value = getValuebyPath(inputData as Record<string, any>, inputKey);

    //skip if the value is missing or empty
    if (value === undefined || value === null || value === "") {
      console.warn(
        `Skipping mapping — no value found for inputKey: "${inputKey}"`,
      );
      continue;
    }

    // Pipedrive expects email and phone as arrays of objects
    if (pipedriveKey === "email") {
      payload["email"] = [{ value: value, primary: true, label: "work" }];
    } else if (pipedriveKey === "phone") {
      payload["phone"] = [{ value: value, primary: true, label: "home" }];
    } else {
      payload[pipedriveKey] = value;
    }
  }

  return payload;
}

//Search Pipedrive for a person by name--->
// Returns the person if found, or null if not found

async function searchPersonByName(
  name: string,
): Promise<PipedrivePerson | null> {
  const url = `https://${companyDomain}.pipedrive.com/v1/persons/search?term=${encodeURIComponent(name)}&exact_match=true&api_token=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errortag = await response.text();
    throw new Error(
      `pipedrive serch API failed with status ${response.status}: ${errortag}`,
    );
  }

  const result: PipedriveSearchResult = await response.json();

  if (!result.success) {
    throw new Error("pipedrive search api returned success: false");
  }

  const items = result.data?.items;

  // No person found with that name
  if (!items || items.length === 0) {
    console.log(`No existing person found with name: "${name}"`);
    return null;
  }

  console.log(
    `Found existing person with name: "${name}", ID: ${items[0].item.id}`,
  );
  return items[0].item;
}

// Create a new person in Pipedrive--->

async function createPerson(
  payload: Record<string, any>,
): Promise<PipedrivePerson> {
  const url = `https://${companyDomain}.pipedrive.com/v1/persons?api_token=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errortag = await response.text();
    throw new Error(
      `Pipedrive create person API failed with status ${response.status}: ${errortag}`,
    );
  }

  const result: PipedriveApiResponse = await response.json();

  if (!result.success) {
    throw new Error("Pipedrive create person API returned success: false");
  }
  console.log(result);

  console.log(`Successfully created new person with ID: ${result.data.id}`);
  return result.data;
}

//Update an existing person in Pipedrive by their ID--->

async function updatePerson(
  personId: number,
  payload: Record<string, any>,
): Promise<PipedrivePerson> {
  const url = `https://${companyDomain}.pipedrive.com/v1/persons/${personId}?api_token=${apiKey}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errortag = await response.text();
    throw new Error(
      `Pipedrive update person API failed with status ${response.status}: ${errortag}`,
    );
  }

  const result: PipedriveApiResponse = await response.json();

  if (!result.success) {
    throw new Error("Pipedrive update person API returned success: false");
  }

  console.log(`Successfully updated person with ID: ${personId}`);
  return result.data;
}

//main function-->
const syncPdPerson = async (): Promise<PipedrivePerson> => {
  try {
    //check that env variables are set before doing anything
    if (!apiKey || !companyDomain) {
      throw new Error("Missing Auth!");
    }

    //Build the payload using the mappings file
    const payload = buildPipedrivePayload(mappings as MappingItem[]);
    console.log("Built payload from mappings:", payload);

    //if the payload has no "name" field, we can't search or create a person
    if (!payload["name"]) {
      throw new Error('the mappings must include a mapping for "name"');
    }

    const personName = payload["name"];

    //Search if this person already exists in Pipedrive
    const existingPerson = await searchPersonByName(personName);

    //Update if found, create if not
    if (existingPerson) {
      const updatedPerson = await updatePerson(existingPerson.id, payload);
      return updatedPerson;
    } else {
      const newPerson = await createPerson(payload);
      return newPerson;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("syncpdprson failed:", error.message);
      throw error;
    }

    // Fallback for non-Erro
    console.error("syncpdprson failed with an unknown error:", error);
    throw new Error("An unknown error occurred");
  }
};

// Run the function and log the result
syncPdPerson()
  .then((person) => {
    console.log("Sync complete. Pipedrive person:", person);
  })
  .catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
