import { arg, segment } from 'ts-routes';

export const agents = {
  enroll: segment`/enroll`,
  printer: segment`/printer`,
  jobs: {
    ...segment`/jobs`,
    children: {
      $id: {
        ...segment`/${arg('id')}`,
        children: {
          file: segment`/file`,
          status: segment`/status`,
        },
      },
    },
  },
};
