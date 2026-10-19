import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

// Guide 1.6.10: only public catalogue queries marked meta: { persist: true } go to localStorage.
// Anything personal (the user, sessions, orders, admin data) stays in memory.
export function shouldPersistQuery(query: Query): boolean {
  return query.meta?.persist === true && defaultShouldDehydrateQuery(query);
}
