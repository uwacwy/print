import { segment, string } from 'ts-routes';

export const installRoutes = {
  install_sh: segment`/install.sh`,
  printer: {
    ...segment`/printer`,
    children: {
      $token: {
        ...segment`${string('token')}`,
        children: {
          install: segment`/install`,
        },
      },
    },
  },
};
