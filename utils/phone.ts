// Numéros mobiles sénégalais : 9 chiffres, préfixes Orange/Free/Expresso
// (70, 75, 76, 77, 78). On travaille en local (sans +221) dans les écrans,
// et on ajoute l'indicatif seulement au moment de contacter le service.

const SN_PHONE_REGEX = /^7[05678][0-9]{7}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^221/, '');
}

export function isValidSenegalPhone(raw: string): boolean {
  return SN_PHONE_REGEX.test(normalizePhone(raw));
}

export function formatPhoneDisplay(raw: string): string {
  const digits = normalizePhone(raw);
  // Format sénégalais usuel : XX XXX XX XX (ex. "77 720 31 62"), pas des
  // paires de chiffres qui ignorent la vraie structure du numéro.
  const match = digits.match(/^(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return match ? match.slice(1).join(' ') : digits;
}

export function toE164(raw: string): string {
  return `+221${normalizePhone(raw)}`;
}
