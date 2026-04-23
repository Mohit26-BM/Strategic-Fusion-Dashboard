// Base URL from Render environment variable
const API_URL = process.env.REACT_APP_API_URL;

async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

// ------------------------
// Fetch all intelligence
// ------------------------
export const fetchIntelligence = async () => {
  const response = await fetch(`${API_URL}/api/intelligence`);
  return parseResponse(response, "Failed to fetch intelligence");
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

  return parseResponse(response, "Failed to add intelligence");
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

  return parseResponse(response, "Failed to bulk import");
};

// ------------------------
// Update single node
// ------------------------
export const updateIntelligence = async (id, data) => {
  const response = await fetch(`${API_URL}/api/intelligence/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseResponse(response, "Failed to update intelligence");
};

// ------------------------
// Delete single node
// ------------------------
export const deleteIntelligence = async (id) => {
  const response = await fetch(`${API_URL}/api/intelligence/${id}`, {
    method: "DELETE",
  });

  return parseResponse(response, "Failed to delete intelligence");
};
