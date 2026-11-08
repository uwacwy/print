import { segment, string } from 'ts-routes';

export const installRoutes = {
  installScript: segment`/install.sh`,
  printerInstall: segment`/printer/${string('token')}/install`,
};
