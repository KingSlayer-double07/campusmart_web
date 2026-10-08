import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** Persist this query to localStorage (public catalogue data only) */
      persist?: boolean;
    };
  }
}
