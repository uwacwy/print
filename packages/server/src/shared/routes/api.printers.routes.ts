import { arg, segment } from 'ts-routes';

export const printers = {
  $slug: {
    ...segment`/${arg('slug')}`,
    children: {
      token: segment`/token`,
      jobs: {
        ...segment`/jobs`,
        children: {
          retry: segment`/retry`,
        },
      },
      qrPdf: segment`/qr.pdf`,
      qrToken: segment`/qr-token`,
      qrPrint: segment`/qr-print`,
      qrEpoch: segment`/qr-epoch`,
      pin: segment`/pin`,
      agentToken: segment`/agent-token`,
    },
  },
  enrollToken: segment`/enroll-token`,
};
