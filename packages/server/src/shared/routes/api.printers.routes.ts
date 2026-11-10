import { arg, segment } from 'ts-routes';

export const printers = {
  $slug: {
    ...segment`/${arg('slug')}`,
    children: {
      agentToken: segment`/agent-token`,
      jobs: {
        ...segment`/jobs`,
        children: {
          retry: segment`/retry`,
        },
      },
      pin: segment`/pin`,
      qrEpoch: segment`/qr-epoch`,
      qrPdf: segment`/qr.pdf`,
      qrPrint: segment`/qr-print`,
      qrToken: segment`/qr-token`,
      token: segment`/token`,
    },
  },
  enrollToken: segment`/enroll-token`,
};
