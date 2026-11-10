export const posterNotice = (
  name: string,
  agentOnline: boolean,
) =>
  agentOnline
    ? $localize`:@@qr-messages.poster-sent:QR poster sent to ${name}:name:.`
    : $localize`:@@qr-messages.poster-queued:QR poster queued. It prints when the ${name}:name: agent is online.`;

export const replacePinPrompt = (name: string) =>
  $localize`:@@qr-messages.replace-pin:Replace the PIN for ${name}:name:? The old PIN stops working.`;

export const pinRefreshedNotice = (name: string) =>
  $localize`:@@qr-messages.pin-refreshed:New PIN for ${name}:name: is ready.`;

export const disablePinPrompt = (name: string) =>
  $localize`:@@qr-messages.disable-pin:Turn off PIN uploads for ${name}:name:? Only QR codes will work.`;

export const pinDisabledNotice = (name: string) =>
  $localize`:@@qr-messages.pin-disabled:PIN uploads turned off for ${name}:name:.`;

export const revokePrompt = (name: string) =>
  $localize`:@@qr-messages.revoke:Revoke every QR code and PIN link for ${name}:name:? Printed posters stop working and must be replaced.`;

export const revokedNotice = (name: string) =>
  $localize`:@@qr-messages.revoked:All QR codes for ${name}:name: were revoked.`;
