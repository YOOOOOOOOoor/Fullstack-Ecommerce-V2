export const emptyNotifications = () => ({ activities: [] });

export function dismissNotification(state, notificationId) {
  return {
    activities: state.activities.filter((item) => String(item.id) !== String(notificationId)),
  };
}

export function clearNotifications() {
  return emptyNotifications();
}

export function countNotifications(state) {
  return state.activities.length;
}
