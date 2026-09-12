/**
 * Server utilities for Header component
 * Handles server-side logic for notifications, profile data, and search
 */

export async function getNotifications() {
  // Mock data - Replace with actual API call
  return {
    count: 3,
    notifications: [
      { id: 1, message: "Nueva notificación 1" },
      { id: 2, message: "Nueva notificación 2" },
      { id: 3, message: "Nueva notificación 3" },
    ],
  };
}

export async function getUserProfile() {
  // Mock data - Replace with actual API call
  return {
    id: 1,
    name: "Usuario",
    avatar: "/avatar.jpg",
    email: "usuario@picante.pe",
  };
}

export async function searchContent(query) {
  // Mock search function
  if (!query || query.trim() === "") {
    return { results: [], count: 0 };
  }

  // Replace with actual API call
  return {
    results: [
      { id: 1, title: "Resultado 1", category: "videos" },
      { id: 2, title: "Resultado 2", category: "modelos" },
    ],
    count: 2,
    query: query,
  };
}

export function formatNotificationTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `hace ${days}d`;
  if (hours > 0) return `hace ${hours}h`;
  if (minutes > 0) return `hace ${minutes}m`;
  return "Ahora";
}
