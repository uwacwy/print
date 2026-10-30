snarfing observables

when a component method calls and subscribes to an observable for a single result (http), snarf it.

What this means is "return it to a promise and await it".

1. automatically unsubscribes and cleans up
2. bring final result handling to the bottom of every function
3. no Subscription().add() and final cleanup needed
4. lets the browser optimize around async operations

```typescript
class MyComponent {
  error = signal("");
  notice = signal("");
  result = signal(null);

  async updateAlphabet() {
    const result = await firstValueFrom(
      this.api.getAlphabet().pipe(
        tap((lowers) => {}),
        switchMap((lowers) => this.api.getUpperCase(lowers)),
        tap((uppers) => {}),
        catchError((e) => this.error.set(e.message)),
      ),
    );
  }
}
```
