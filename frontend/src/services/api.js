// Bulk add intelligence nodes
export const bulkAddIntelligence = async (nodes) => {
  const response = await fetch(`${API_URL}/intelligence/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes })
  });
  if (!response.ok) throw new Error('Failed to bulk import');
  return response.json();
};
const API_URL = "http://localhost:5000/api";

export const fetchIntelligence = async () => {
  const response = await fetch(`${API_URL}/intelligence`);
  return response.json();
};

export const addIntelligence = async (data) => {
  const response = await fetch(`${API_URL}/intelligence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
};
