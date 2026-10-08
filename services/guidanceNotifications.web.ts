// Version web (navigateur) : pas de notifications système. Le guidage reste
// entièrement visible à l'écran — ce fichier remplace guidanceNotifications.ts
// quand l'app est construite pour le web.

export function notifyPrepareToAlight(_stopName: string): void {}

export function notifyArrived(_destinationName: string): void {}

export async function dismissGuidanceNotifications(): Promise<void> {}
