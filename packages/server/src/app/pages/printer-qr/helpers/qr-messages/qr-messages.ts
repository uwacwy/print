export const posterNotice = (name: string, agentOnline: boolean) =>
  agentOnline
    ? `QR poster sent to ${name}.`
    : `QR poster queued. It prints when the ${name} agent is online.`;

export const replacePinPrompt = (name: string) =>
  `Replace the PIN for ${name}? The old PIN stops working.`;

export const pinRefreshedNotice = (name: string) =>
  `New PIN for ${name} is ready.`;

export const disablePinPrompt = (name: string) =>
  `Turn off PIN uploads for ${name}? Only QR codes will work.`;

export const pinDisabledNotice = (name: string) =>
  `PIN uploads turned off for ${name}.`;

export const revokePrompt = (name: string) =>
  `Revoke every QR code and PIN link for ${name}? Printed posters stop working and must be replaced.`;

export const revokedNotice = (name: string) =>
  `All QR codes for ${name} were revoked.`;
