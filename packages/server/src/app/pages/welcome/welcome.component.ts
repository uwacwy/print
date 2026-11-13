import { Component, inject } from '@angular/core';

import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';

@Component({
  selector: 'app-welcome',
  styleUrl: './welcome.component.scss',
  templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
  readonly config = inject(CLIENT_ENVIRONMENT);

  protected readonly faqs = [
    {
      answer: $localize`:@@welcome.faq-1.answer:No. Everything happens in your phone’s web browser — there is nothing to install and no sign-in.`,
      question: $localize`:@@welcome.faq-1.question:Do I need an app or an account?`,
    },
    {
      answer: $localize`:@@welcome.faq-2.answer:PDFs and photos (JPEG, PNG, and iPhone HEIC). You can send several documents at once and choose how many copies of each.`,
      question: $localize`:@@welcome.faq-2.question:What can I print?`,
    },
    {
      answer: $localize`:@@welcome.faq-3.answer:Your document goes only to the printer you chose and is deleted as soon as it prints. Some printers also add a cover sheet on top so others can’t see your pages in the tray.`,
      question: $localize`:@@welcome.faq-3.question:Is my document private?`,
    },
    {
      answer: $localize`:@@welcome.faq-4.answer:Each printed code only works for the dates shown under it. Ask a staff member or volunteer for a current one.`,
      question: $localize`:@@welcome.faq-4.question:The QR code says it has expired or is not active yet.`,
    },
    {
      answer: $localize`:@@welcome.faq-5.answer:If the poster shows a web address and PIN, open that address in your browser and enter the 9-digit PIN when asked. Otherwise, ask for help at the front desk.`,
      question: $localize`:@@welcome.faq-5.question:I can’t scan the code. Can I type the address instead?`,
    },
    {
      answer: $localize`:@@welcome.faq-6.answer:Check the status above to make sure printers are online, then ask a staff member or volunteer — they can see your job and send it to the printer again.`,
      question: $localize`:@@welcome.faq-6.question:My document didn’t print. What should I do?`,
    },
  ] as const;
}
