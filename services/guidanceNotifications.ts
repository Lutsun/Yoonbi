import * as Notifications from 'expo-notifications';

// Notifications du guidage — un rappel quand on ne regarde pas l'écran
// (une autre appli au premier plan, le téléphone posé à côté de soi), pas
// une redite de ce que l'écran affiche déjà en direct.
//
// Limite à connaître : elles ne sont envoyées que pendant que l'app tourne.
// Pendant un guidage actif, l'écran reste allumé (expo-keep-awake), donc
// elles arrivent bien même si l'utilisateur regarde ailleurs — mais pas si
// l'app est fermée ou mise en arrière-plan, faute de suivi de position en
// arrière-plan (choix délibéré : pas de permission de localisation
// « Toujours », voir app.json).

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Si déjà refusée, iOS renvoie « denied » sans reproposer la boîte de
    // dialogue : cet appel ne peut donc pas harceler l'utilisateur.
    const requested = await Notifications.requestPermissionsAsync();
    return !!requested.granted;
  } catch {
    return false;
  }
}

async function notify(title: string, body: string): Promise<void> {
  try {
    if (!(await ensurePermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // Une notification manquée ne doit jamais interrompre le guidage.
  }
}

export function notifyPrepareToAlight(stopName: string): void {
  notify('Préparez-vous à descendre', `Prochain arrêt : ${stopName}`);
}

export function notifyArrived(destinationName: string): void {
  notify('Vous êtes arrivé à destination', destinationName);
}

export async function dismissGuidanceNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // rien à faire : au pire une notification reste dans le centre de notifications.
  }
}
