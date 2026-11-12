import { FieldState } from '@angular/forms/signals';

export const firstErrorOrDefault = (
  state: FieldState<unknown>,
  orElse: string = '',
) =>
  state.touched()
    ? (state.errors()[0]?.message ?? orElse)
    : orElse;
