import { arg, segment } from 'ts-routes';

export const installRoutes = {
  install_sh: segment`/install.sh`,
  printer: {
    ...segment`/printer`,
    children: {
      $token: {
        ...segment`/${arg('token')}`,
        children: {
          install: segment`/install`,
        },
      },
    },
  },
};
