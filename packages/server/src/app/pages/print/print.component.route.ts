import { inject, InputSignal, Resource } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  ResourceContext,
  ResourceResult,
  Route,
} from '@angular/router';

import { PrinterService } from '../../services/printer/printer.service';

const resources = ({ params, queryParams }: ResourceContext) => {
  const printers = inject(PrinterService);

  return {
    printer: rxResource({
      params: () => ({
        slug: params()['slug'],
        token: queryParams()['token'],
      }),
      stream: ({ params }) =>
        printers.getPrinter(params.slug, params.token),
    }),
  } satisfies ResourceResult;
};

// currently Record<'printer', ResourceResult<infer T>
// want to extract all keys mapped to each T
type PrintResources = ReturnType<typeof resources>;

type TypedResourceResult<T extends ResourceResult> = {
  [K in keyof T]: T[K] extends Resource<infer U> ? U : never;
};

type UnwrapPrint = TypedResourceResult<PrintResources>;

// now, create a type that can be implemented
// if input type is Record<K,V>, output type is Record<K, InputSignal<V>>
type ResourcesFrom<
  T extends Record<string, unknown>,
  Required extends keyof T = keyof T,
> = {
  [K in keyof T]: InputSignal<
    K extends Required
      ? Exclude<T[K], undefined>
      : T[K] | undefined
  >;
};

export type PrintComponentResources = ResourcesFrom<UnwrapPrint>;

// should ResourcesFromRoute<typeof printComponentRoute>
// should equal PrintComponentResources
// to be used as `export class MyComponent implements ResourcesFromRoute<typeof printComponentRoute>`
export type ResourcesFromRoute<R extends Route> = R extends {
  resources: infer T extends Record<string, unknown>;
}
  ? ResourcesFrom<T>
  : never;

export const printComponentRoute = {
  data: {
    width: {
      lg: 8,
      md: 12,
      sm: 12,
      xl: 6,
      xs: 12,
    },
  },
  loadComponent: () =>
    import('./print.component').then((m) => m.PrintComponent),
  path: 'print/:slug',
  // title: $localize`:@@route.print.title:Print Documents`,
  title: ({ resources }, state) => {
    console.log({ resources });
    if (!resources) {
      return 'print';
    }
    const printer = resources['printer'];
    if (printer && printer.hasValue()) {
      return 'Print ' + printer.value();
    }
    return 'Print';
  },
  resources,
} satisfies Route;
