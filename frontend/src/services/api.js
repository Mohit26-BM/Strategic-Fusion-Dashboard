// Base URL from Render environment variable
const API_URL = process.env.REACT_APP_API_URL;

// ------------------------
// Fetch all intelligence
// ------------------------
export const fetchIntelligence = async () => {
  const response = await fetch(`${API_URL}/api/intelligence`);

  if (!response.ok) {
    throw new Error("Failed to fetch intelligence");
  }

  return response.json();
};

// ------------------------
// Add single node
// ------------------------
export const addIntelligence = async (data) => {
  const response = await fetch(`${API_URL}/api/intelligence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to add intelligence");
  }

  return response.json();
};

// ------------------------
// Bulk add nodes
// ------------------------
export const bulkAddIntelligence = async (nodes) => {
  const response = await fetch(`${API_URL}/api/intelligence/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nodes }),
  });

  if (!response.ok) {
    throw new Error("Failed to bulk import");
  }

  return response.json();
};
