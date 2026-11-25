// Turns an untrusted request body into a clean node. Only the fields listed here are ever stored,
// so a client cannot slip in _id, city, timestamp or any other field of its own.
const MAX = { title: 200, description: 5000, source: 100, type: 20, imageUrl: 2000, imageData: 700000 };
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function toCoordinate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null; // Number("") is 0, which is NOT a coordinate
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateImageUrl(value) {
  const text = String(value).trim();
  if (text === "") return { value: "" };
  if (text.startsWith("data:")) {
    if (text.length > MAX.imageData) return { error: "Image is too large (limit about 500 KB after resizing)" };
    if (!IMAGE_DATA_URL.test(text)) return { error: "Image data must be a PNG, JPEG, WebP or GIF" };
    return { value: text };
  }
  if (text.length > MAX.imageUrl) return { error: "Image URL is too long" };
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "Image URL must start with http:// or https://" };
  } catch {
    return { error: "Image URL is not a valid URL" };
  }
  return { value: text };
}

function text(value, field, max, errors, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push(`${field} must be text`);
    return undefined;
  }
  const trimmed = String(value).trim();
  if (required && !trimmed) {
    errors.push(`${field} is required`);
    return undefined;
  }
  if (trimmed.length > max) {
    errors.push(`${field} is too long (max ${max} characters)`);
    return undefined;
  }
  return trimmed;
}

/**
 * @param {object} payload the request body
 * @param {{ partial?: boolean }} options partial = an update: only the fields that are present are checked
 * @returns {{ errors: string[], value: object }}
 */
function validateNode(payload, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { errors: ["Body must be an object"], value };
  }

  const hasLat = payload.lat !== undefined;
  const hasLng = payload.lng !== undefined;
  if (!partial || hasLat || hasLng) {
    const lat = toCoordinate(payload.lat);
    const lng = toCoordinate(payload.lng);
    if (lat === null || lng === null) {
      errors.push("lat and lng must be numbers");
    } else if (lat < -90 || lat > 90) {
      errors.push("lat must be between -90 and 90");
    } else if (lng < -180 || lng > 180) {
      errors.push("lng must be between -180 and 180");
    } else {
      value.lat = lat;
      value.lng = lng;
    }
  }

  if (!partial || payload.type !== undefined) {
    const type = text(payload.type, "type", MAX.type, errors, { required: true });
    if (type !== undefined) {
      const upper = type.toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(upper)) errors.push("type may only contain letters, digits, '_' and '-'");
      else value.type = upper;
    }
  }

  if (!partial || payload.title !== undefined) {
    const title = text(payload.title, "title", MAX.title, errors, { required: true });
    if (title !== undefined) value.title = title;
  }

  if (payload.description !== undefined && payload.description !== null) {
    const description = text(payload.description, "description", MAX.description, errors);
    if (description !== undefined) value.description = description;
  }

  if (payload.source !== undefined && payload.source !== null) {
    const source = text(payload.source, "source", MAX.source, errors);
    if (source !== undefined) value.source = source;
  }

  if (payload.image_url !== undefined && payload.image_url !== null) {
    if (typeof payload.image_url !== "string") {
      errors.push("image_url must be text");
    } else {
      const result = validateImageUrl(payload.image_url);
      if (result.error) errors.push(result.error);
      else value.image_url = result.value;
    }
  }

  return { errors, value };
}

module.exports = { validateNode, toCoordinate, MAX };
