const API_URL = process.env.REACT_APP_API_URL;

async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

export const fetchIntelligence = async () => {
  const response = await fetch(`${API_URL}/intelligence`);
  return parseResponse(response, "Failed to load intelligence nodes");
};

export const addIntelligence = async (data) => {
  const response = await fetch(`${API_URL}/intelligence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse(response, "Failed to add intelligence node");
};

export const bulkAddIntelligence = async (nodes) => {
  const response = await fetch(`${API_URL}/intelligence/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
  });

  return parseResponse(response, "Failed to bulk import");
};

export const updateIntelligence = async (id, data) => {
  const response = await fetch(`${API_URL}/intelligence/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return parseResponse(response, "Failed to update intelligence node");
};

export const deleteIntelligence = async (id) => {
  const response = await fetch(`${API_URL}/intelligence/${id}`, {
    method: "DELETE",
  });

  return parseResponse(response, "Failed to delete intelligence node");
};
