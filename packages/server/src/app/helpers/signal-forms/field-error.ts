import { computed } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/** The first validation message of a field, shown once the user has touched it. */
export const fieldError = (field: () => FieldTree<string>) =>
  computed(() => {
    const state = field()();
    return state.touched()
      ? (state.errors()[0]?.message ?? '')
      : '';
  });
